import { app, BrowserWindow, ipcMain, nativeImage, Tray, Menu, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import express from 'express';
import { autoUpdater } from 'electron-updater';
import { execFile, spawn } from 'child_process';
import https from 'https';
import http from 'http';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { createNsisRouter } from './apiRoutes';
import {
  resolveMakensis,
  scanZipBufferOrPath,
  generateNsisScript,
  buildInstallerFromZip,
  buildInstallerFromFolder,
  NsisBuildOptions
} from './nsisService';


let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Server state
let serverApp: express.Express | null = null;
let serverInstance: any = null;
let serverPort = 8080;
let isServerRunning = false;

app.name = 'Endpoint Forge';
if (process.platform === 'win32') {
  app.setAppUserModelId('com.endpointforge.app');
}

function getTrayIcon() {
  const logoPath = path.join(__dirname, '../logo.png');
  const size = process.platform === 'win32' ? 64 : 22;
  const cachePath = path.join(app.getPath('userData'), `tray-icon-${size}.png`);

  if (fs.existsSync(cachePath) && fs.existsSync(logoPath)) {
    if (fs.statSync(cachePath).mtimeMs >= fs.statSync(logoPath).mtimeMs) {
      const cached = nativeImage.createFromPath(cachePath);
      if (!cached.isEmpty()) return cached;
    }
  }

  if (fs.existsSync(logoPath)) {
    const small = nativeImage
      .createFromPath(logoPath)
      .resize({ width: size, height: size, quality: 'better' });
    fs.writeFileSync(cachePath, small.toPNG());
    return small;
  }
  
  // Fallback if logo.png is missing or unreadable
  return nativeImage.createEmpty();
}

function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

function logToServer(msg: string) {
  if (mainWindow) {
    mainWindow.webContents.send('server-log', { timestamp: Date.now(), message: msg });
  }
}

function broadcastServerStatus() {
  if (mainWindow) {
    mainWindow.webContents.send('server-status-changed', {
      isRunning: isServerRunning,
      port: serverPort,
      ips: getLocalIps()
    });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    frame: false,
    title: 'Endpoint Forge',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  
  mainWindow.setMenu(null);
  
  // Load UI
  if (process.env.NODE_ENV === 'development') {
    // We don't use loadURL for Endpoint Forge spec, strictly loadFile:
    // mainWindow.loadURL('http://localhost:3000');
  }
  
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

let fallbackDownloadedExePath: string | null = null;
let isFallbackDownloading = false;

function fetchGithubJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Endpoint-Forge-Updater' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchGithubJson(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse release response: ${e}`));
        }
      });
    }).on('error', reject);
  });
}

function downloadBinaryWithProgress(url: string, destFile: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Endpoint-Forge-Updater' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadBinaryWithProgress(res.headers.location, destFile, onProgress));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      let lastReportedPct = -1;

      const fileStream = fs.createWriteStream(destFile);
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) {
          const pct = Math.round((downloaded / total) * 100);
          if (pct !== lastReportedPct) {
            lastReportedPct = pct;
            onProgress(pct);
          }
        }
      });
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', (err) => {
        fs.unlink(destFile, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

async function attemptFallbackDownload(targetVersion?: string) {
  if (isFallbackDownloading) return;
  isFallbackDownloading = true;
  logToServer(`Attempting direct GitHub release fallback download...`);
  mainWindow?.webContents.send('update-event', {
    type: 'checking',
    message: 'Resolving installer binary directly from GitHub releases...'
  });

  try {
    const releaseUrl = targetVersion
      ? `https://api.github.com/repos/Gargantua-Voided/Endpoint-Forge/releases/tags/${targetVersion}`
      : `https://api.github.com/repos/Gargantua-Voided/Endpoint-Forge/releases/latest`;

    const releaseData = await fetchGithubJson(releaseUrl);
    const exeAsset = releaseData.assets?.find((a: any) => a.name && a.name.toLowerCase().endsWith('.exe'));

    if (!exeAsset) {
      throw new Error(`No executable installer asset (.exe) found in release ${releaseData.tag_name || targetVersion || ''}`);
    }

    const downloadUrl = exeAsset.browser_download_url;
    const destPath = path.join(os.tmpdir(), exeAsset.name);

    mainWindow?.webContents.send('update-event', {
      type: 'available',
      info: { version: releaseData.tag_name || targetVersion, name: exeAsset.name }
    });

    logToServer(`Downloading installer fallback: ${exeAsset.name} from ${downloadUrl}`);

    await downloadBinaryWithProgress(downloadUrl, destPath, (percent) => {
      mainWindow?.webContents.send('update-event', {
        type: 'progress',
        progress: percent
      });
    });

    fallbackDownloadedExePath = destPath;
    logToServer(`Fallback installer downloaded successfully to: ${destPath}`);
    mainWindow?.webContents.send('update-event', {
      type: 'downloaded',
      info: {
        version: releaseData.tag_name,
        name: exeAsset.name,
        path: destPath
      }
    });
  } catch (fallbackErr: any) {
    logToServer(`Fallback download failed: ${fallbackErr.message}`);
    mainWindow?.webContents.send('update-event', {
      type: 'error',
      message: `Update download failed: ${fallbackErr.message}`
    });
  } finally {
    isFallbackDownloading = false;
  }
}

app.whenReady().then(() => {
  createWindow();
  
  tray = new Tray(getTrayIcon());
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setToolTip('Endpoint Forge');
  tray.setContextMenu(contextMenu);
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Setup auto-updater
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  
  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update-event', { type: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-event', { type: 'available', info });
  });
  autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('update-event', { type: 'not-available', info });
  });
  autoUpdater.on('error', async (err) => {
    logToServer(`AutoUpdater error: ${err.message}`);
    // If the error is a 404 or cannot download asset due to filename mismatch
    if (err.message && (err.message.includes('status 404') || err.message.includes('Cannot download') || err.message.includes('404'))) {
      logToServer(`Detected 404 download issue in autoUpdater. Initiating direct GitHub release fallback...`);
      const match = err.message.match(/releases\/download\/([^/]+)\//);
      const versionTag = match ? match[1] : undefined;
      await attemptFallbackDownload(versionTag);
    } else {
      mainWindow?.webContents.send('update-event', { type: 'error', message: err.message });
    }
  });
  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('update-event', { type: 'progress', progress: progressObj.percent });
  });
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-event', { type: 'downloaded', info });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.on('window-control', (_e, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  if (action === 'close') mainWindow.close();
});

ipcMain.handle('start-server', async (_e, port) => {
  if (isServerRunning) return { success: false, message: 'Already running' };
  
  try {
    serverPort = port || 8080;
    serverApp = express();
    
    // Log all requests
    serverApp.use((req, res, next) => {
      logToServer(`[${req.method}] ${req.url}`);
      next();
    });

    const upload = multer({ dest: path.join(os.tmpdir(), 'intune-uploads') });

    // Intune Web Endpoint
    serverApp.post('/api/intune/package', upload.array('sourceFiles'), async (req, res) => {
      try {
        const filesArray = req.files as Express.Multer.File[];
        if (!filesArray || filesArray.length === 0) {
          res.status(400).json({ error: 'No files provided' });
          return;
        }
        
        const setupFile = req.body.setupFile;
        if (!setupFile) {
          res.status(400).json({ error: 'No setup file specified' });
          return;
        }

        logToServer(`Web request to package intune file for ${setupFile}`);
        
        const exactUtilPath = app.isPackaged
          ? path.join(process.resourcesPath, 'IntuneWinAppUtil.exe')
          : path.join(__dirname, '../../bin/IntuneWinAppUtil.exe');
          
        if (!fs.existsSync(exactUtilPath)) {
          res.status(500).json({ error: 'IntuneWinAppUtil.exe not found. The packaging component is missing.' });
          return;
        }
        
        const workDir = path.join(os.tmpdir(), `intune-${Date.now()}`);
        const sourceDir = path.join(workDir, 'source');
        const outDir = path.join(workDir, 'output');
        fs.mkdirSync(sourceDir, { recursive: true });
        fs.mkdirSync(outDir, { recursive: true });

        // Copy uploaded files to source directory
        logToServer(`Preparing source files...`);
        for (const file of filesArray) {
          const destPath = path.join(sourceDir, file.originalname);
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(file.path, destPath);
          fs.unlinkSync(file.path);
        }
        
        logToServer(`Running IntuneWinAppUtil.exe...`);
        execFile(exactUtilPath, ['-c', sourceDir, '-s', setupFile, '-o', outDir, '-q'], (error, stdout, stderr) => {
          if (error) {
            logToServer(`Intune Packaging Failed: ${error.message}`);
            res.status(500).json({ error: `Packaging failed: ${error.message}` });
            return;
          }
          
          logToServer(`Packaging successful.`);
          
          // Find the generated .intunewin file
          const files = fs.readdirSync(outDir);
          const intunewinFile = files.find(f => f.endsWith('.intunewin'));
          
          if (!intunewinFile) {
            res.status(500).json({ error: 'Packaging succeeded but .intunewin file was not found.' });
            return;
          }
          
          const filePath = path.join(outDir, intunewinFile);
          res.download(filePath, intunewinFile, (err) => {
            // Cleanup
            try { fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (e) { logToServer(`Cleanup failed: ${e.message}`); }
          });
        });
        
      } catch (err: any) {
        logToServer(`Intune Web API Error: ${err.message}`);
        res.status(500).json({ error: err.message });
      }
    });
    
    // NSIS Web Endpoints
    serverApp.use('/api/nsis', createNsisRouter(app.isPackaged, process.resourcesPath));

    // Serve the compiled UI to web users
    serverApp.use(express.static(path.join(__dirname, '../dist')));
    
    serverApp.get('/api/intune/status', (req, res) => {
      if (os.platform() !== 'win32') {
        res.json({ ready: false, error: 'The Endpoint Forge host server is running on a non-Windows OS (Linux/Mac). Intune packaging requires a Windows host.' });
        return;
      }
      
      const exactUtilPath = app.isPackaged
        ? path.join(process.resourcesPath, 'IntuneWinAppUtil.exe')
        : path.join(__dirname, '../../bin/IntuneWinAppUtil.exe');
        
      if (!fs.existsSync(exactUtilPath)) {
        res.json({ ready: false, error: 'IntuneWinAppUtil.exe is missing on the host server.' });
        return;
      }
      
      res.json({ ready: true });
    });

    // Fallback for SPA routing
    serverApp.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../dist/index.html'));
    });
    
    logToServer(`Starting server on port ${serverPort}...`);
    serverInstance = serverApp.listen(serverPort, '0.0.0.0', () => {
      isServerRunning = true;
      logToServer(`Server is active and listening.`);
      broadcastServerStatus();
    });
    
    return { success: true };
  } catch (err: any) {
    logToServer(`Failed to start server: ${err.message}`);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('stop-server', async () => {
  if (!isServerRunning || !serverInstance) return { success: false, message: 'Not running' };
  
  try {
    logToServer(`Stopping server...`);
    serverInstance.close(() => {
      isServerRunning = false;
      serverInstance = null;
      serverApp = null;
      logToServer(`Server stopped.`);
      broadcastServerStatus();
    });
    return { success: true };
  } catch (err: any) {
    logToServer(`Failed to stop server: ${err.message}`);
    return { success: false, message: err.message };
  }
});

ipcMain.handle('get-server-status', () => {
  return {
    isRunning: isServerRunning,
    port: serverPort,
    ips: getLocalIps()
  };
});

ipcMain.on('open-external', (_event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('check-updates', async () => {
  try {
    return await autoUpdater.checkForUpdates();
  } catch (err: any) {
    return { error: err.message };
  }
});

ipcMain.handle('install-update', () => {
  if (fallbackDownloadedExePath && fs.existsSync(fallbackDownloadedExePath)) {
    logToServer(`Launching fallback installer: ${fallbackDownloadedExePath}`);
    const child = spawn(fallbackDownloadedExePath, [], { detached: true, stdio: 'ignore' });
    child.unref();
    app.quit();
  } else {
    autoUpdater.quitAndInstall();
  }
});

ipcMain.handle('select-files', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled) return null;
  return result.filePaths;
});

ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('select-save-file', async (_e, defaultName) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'Intune Package', extensions: ['intunewin'] }]
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.handle('get-intune-status', () => {
  if (os.platform() !== 'win32') {
    return { ready: false, error: 'Intune packaging requires a Windows operating system to run.' };
  }
  const exactUtilPath = app.isPackaged
    ? path.join(process.resourcesPath, 'IntuneWinAppUtil.exe')
    : path.join(__dirname, '../../bin/IntuneWinAppUtil.exe');
    
  if (!fs.existsSync(exactUtilPath)) {
    return { ready: false, error: 'IntuneWinAppUtil.exe is missing from the application components.' };
  }
  
  return { ready: true };
});

ipcMain.handle('package-intune-local', async (_e, sourceDir, setupFile, outPath) => {
  try {
    const exactUtilPath = app.isPackaged
      ? path.join(process.resourcesPath, 'IntuneWinAppUtil.exe')
      : path.join(__dirname, '../../bin/IntuneWinAppUtil.exe');
      
    if (!fs.existsSync(exactUtilPath)) {
      return { success: false, error: 'IntuneWinAppUtil.exe not found. The packaging component is missing.' };
    }

    logToServer(`Running local Intune packaging...`);
    const outDir = path.dirname(outPath);
    
    return new Promise((resolve) => {
      execFile(exactUtilPath, ['-c', sourceDir, '-s', setupFile, '-o', outDir, '-q'], (error, stdout, stderr) => {
        if (error) {
          logToServer(`Intune Packaging Failed: ${error.message}`);
          resolve({ success: false, error: error.message });
          return;
        }
        
        // Find generated file and rename/move to exact outPath if needed
        const files = fs.readdirSync(outDir);
        const intunewinFile = files.find(f => f.endsWith('.intunewin'));
        
        if (intunewinFile) {
          const generatedPath = path.join(outDir, intunewinFile);
          if (generatedPath !== outPath) {
            fs.renameSync(generatedPath, outPath);
          }
        }
        
        logToServer(`Intune local packaging complete.`);
        resolve({ success: true });
      });
    });

  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('package-intune-local-files', async (_e, filePaths: string[], setupFile: string, outPath: string) => {
  try {
    const exactUtilPath = app.isPackaged
      ? path.join(process.resourcesPath, 'IntuneWinAppUtil.exe')
      : path.join(__dirname, '../../bin/IntuneWinAppUtil.exe');
      
    if (!fs.existsSync(exactUtilPath)) {
      return { success: false, error: 'IntuneWinAppUtil.exe not found. The packaging component is missing.' };
    }

    logToServer(`Running local Intune packaging from individual files...`);
    
    // Create a temp directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intune-packager-'));
    
    // Copy all files into it
    for (const file of filePaths) {
      const destPath = path.join(tempDir, path.basename(file));
      fs.copyFileSync(file, destPath);
    }

    const outDir = path.dirname(outPath);
    
    return new Promise((resolve) => {
      execFile(exactUtilPath, ['-c', tempDir, '-s', setupFile, '-o', outDir, '-q'], (error, stdout, stderr) => {
        // Clean up temp dir
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
        
        if (error) {
          logToServer(`Intune Packaging Failed: ${error.message}`);
          resolve({ success: false, error: error.message });
          return;
        }
        
        // Find generated file and rename/move to exact outPath if needed
        const files = fs.readdirSync(outDir);
        const intunewinFile = files.find(f => f.endsWith('.intunewin'));
        
        if (intunewinFile) {
          const generatedPath = path.join(outDir, intunewinFile);
          if (generatedPath !== outPath) {
            fs.renameSync(generatedPath, outPath);
          }
        }
        
        logToServer(`Intune local files packaging complete.`);
        resolve({ success: true, path: outPath });
      });
    });
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// NSIS Installer IPC Handlers
ipcMain.handle('get-nsis-status', async () => {
  const makensis = resolveMakensis(app.isPackaged, process.resourcesPath);
  if (!makensis) {
    return { ready: false, error: 'NSIS compiler (makensis) is not available.' };
  }
  return { ready: true, path: makensis.path };
});

ipcMain.handle('preview-nsis-script', async (_e, options: NsisBuildOptions) => {
  return generateNsisScript(options, '$SOURCE_DIR', '$OUTFILE');
});

ipcMain.handle('scan-nsis-zip-local', async (_e, zipPath: string) => {
  try {
    return scanZipBufferOrPath(zipPath, path.basename(zipPath));
  } catch (err: any) {
    return {
      executables: [],
      suggestedName: path.basename(zipPath, path.extname(zipPath)),
      suggestedVersion: '1.0.0',
      fileCount: 0
    };
  }
});

ipcMain.handle('build-nsis-local', async (_e, zipPath: string, options: NsisBuildOptions, outPath: string) => {
  const makensis = resolveMakensis(app.isPackaged, process.resourcesPath);
  if (!makensis) {
    return { success: false, error: 'NSIS compiler (makensis) was not found.' };
  }
  logToServer(`Building NSIS installer from zip ${zipPath} -> ${outPath}`);
  return await buildInstallerFromZip(zipPath, options, outPath, makensis);
});

ipcMain.handle('build-nsis-folder', async (_e, folderPath: string, options: NsisBuildOptions, outPath: string) => {
  const makensis = resolveMakensis(app.isPackaged, process.resourcesPath);
  if (!makensis) {
    return { success: false, error: 'NSIS compiler (makensis) was not found.' };
  }
  logToServer(`Building NSIS installer from folder ${folderPath} -> ${outPath}`);
  return await buildInstallerFromFolder(folderPath, options, outPath, makensis);
});

