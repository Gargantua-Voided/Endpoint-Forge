import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  resolveMakensis,
  scanZipBufferOrPath,
  generateNsisScript,
  buildInstallerFromZip,
  NsisBuildOptions
} from './nsisService';

export function createNsisRouter(isPackaged = false, resourcesPath?: string) {
  const router = Router();
  const upload = multer({ dest: path.join(os.tmpdir(), 'nsis-uploads') });

  // Status check
  router.get('/status', (_req, res) => {
    const makensis = resolveMakensis(isPackaged, resourcesPath);
    if (!makensis) {
      res.json({
        ready: false,
        error: 'NSIS compiler (makensis) was not found on the server host.'
      });
      return;
    }
    res.json({ ready: true, path: makensis.path });
  });

  // Scan Zip archive
  router.post('/scan', upload.single('zipFile'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No zip file provided' });
      return;
    }

    try {
      const scanResult = scanZipBufferOrPath(req.file.path, req.file.originalname);
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
      res.json(scanResult);
    } catch (err: any) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
      res.status(500).json({ error: `Failed to inspect zip: ${err.message}` });
    }
  });

  // Preview NSIS Script
  router.post('/preview', (req, res) => {
    try {
      const options: NsisBuildOptions = req.body || {};
      const script = generateNsisScript(options, '$SOURCE_DIR', '$OUTFILE');
      res.json({ script });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Build Installer from Zip and download .exe
  router.post('/build', upload.single('zipFile'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No zip file uploaded' });
      return;
    }

    const makensis = resolveMakensis(isPackaged, resourcesPath);
    if (!makensis) {
      try { fs.unlinkSync(req.file.path); } catch {}
      res.status(500).json({ error: 'NSIS compiler (makensis) is not available.' });
      return;
    }

    try {
      let rawOptions: any = {};
      if (req.body.options) {
        try {
          rawOptions = JSON.parse(req.body.options);
        } catch {
          rawOptions = req.body;
        }
      } else {
        rawOptions = req.body;
      }

      const options: NsisBuildOptions = {
        appName: rawOptions.appName || 'MyApplication',
        appVersion: rawOptions.appVersion || '1.0.0',
        publisher: rawOptions.publisher || rawOptions.appName || 'Software Publisher',
        mainExe: rawOptions.mainExe || '',
        installScope: rawOptions.installScope === 'currentUser' ? 'currentUser' : 'perMachine',
        createDesktopShortcut: rawOptions.createDesktopShortcut !== 'false' && rawOptions.createDesktopShortcut !== false,
        createStartMenuShortcut: rawOptions.createStartMenuShortcut !== 'false' && rawOptions.createStartMenuShortcut !== false,
        createUninstaller: rawOptions.createUninstaller !== 'false' && rawOptions.createUninstaller !== false,
        runAfterInstall: rawOptions.runAfterInstall === 'true' || rawOptions.runAfterInstall === true
      };

      const sanitizedAppName = options.appName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const outFileName = `${sanitizedAppName}-Setup-${options.appVersion}.exe`;
      const outDir = path.join(os.tmpdir(), `nsis-out-${Date.now()}`);
      fs.mkdirSync(outDir, { recursive: true });
      const outFilePath = path.join(outDir, outFileName);

      const result = await buildInstallerFromZip(req.file.path, options, outFilePath, makensis);

      // Clean up uploaded zip
      try { fs.unlinkSync(req.file.path); } catch {}

      if (!result.success || !fs.existsSync(outFilePath)) {
        res.status(500).json({ error: result.error || 'Installer generation failed.' });
        try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
        return;
      }

      res.download(outFilePath, outFileName, (err) => {
        try {
          fs.rmSync(outDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch {}
      });

    } catch (err: any) {
      try { fs.unlinkSync(req.file.path); } catch {}
      res.status(500).json({ error: `Server error during NSIS build: ${err.message}` });
    }
  });

  return router;
}
