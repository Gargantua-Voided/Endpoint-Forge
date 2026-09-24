import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import AdmZip from 'adm-zip';

export interface NsisBuildOptions {
  appName: string;
  appVersion: string;
  publisher?: string;
  mainExe: string;
  installScope?: 'perMachine' | 'currentUser';
  createDesktopShortcut?: boolean;
  createStartMenuShortcut?: boolean;
  createUninstaller?: boolean;
  runAfterInstall?: boolean;
}

export interface ZipScanResult {
  executables: string[];
  suggestedName: string;
  suggestedVersion: string;
  fileCount: number;
}

export function resolveMakensis(isPackaged = false, resourcesPath?: string): { path: string; nsisDir: string } | null {
  // 1. Packaged Electron app
  if (isPackaged && resourcesPath) {
    const packagedNsis = path.join(resourcesPath, 'nsis');
    if (fs.existsSync(packagedNsis)) {
      const exeName = process.platform === 'win32' ? 'Bin/makensis.exe' : (process.platform === 'darwin' ? 'mac/makensis' : 'linux/makensis');
      const target = path.join(packagedNsis, exeName);
      if (fs.existsSync(target)) {
        return { path: target, nsisDir: packagedNsis };
      }
    }
  }

  // 2. Local workspace bin/nsis
  const localNsis = path.resolve('bin/nsis');
  if (fs.existsSync(localNsis)) {
    const exeName = process.platform === 'win32' ? 'Bin/makensis.exe' : (process.platform === 'darwin' ? 'mac/makensis' : 'linux/makensis');
    const target = path.join(localNsis, exeName);
    if (fs.existsSync(target)) {
      return { path: target, nsisDir: localNsis };
    }
  }

  // 3. Fallback to electron-builder cache if available
  const homeCache = path.join(os.homedir(), '.cache/electron-builder/nsis-3.0.4.1');
  if (fs.existsSync(homeCache)) {
    try {
      const entries = fs.readdirSync(homeCache);
      for (const ent of entries) {
        const candidate = path.join(homeCache, ent);
        const exeName = process.platform === 'win32' ? 'Bin/makensis.exe' : (process.platform === 'darwin' ? 'mac/makensis' : 'linux/makensis');
        const target = path.join(candidate, exeName);
        if (fs.existsSync(target)) {
          return { path: target, nsisDir: candidate };
        }
      }
    } catch {}
  }

  return null;
}

export function scanZipBufferOrPath(zipInput: Buffer | string, filename = ''): ZipScanResult {
  const zip = typeof zipInput === 'string' ? new AdmZip(zipInput) : new AdmZip(zipInput);
  const entries = zip.getEntries();
  
  const executables: string[] = [];
  let fileCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory) {
      fileCount++;
      const name = entry.entryName;
      if (name.toLowerCase().endsWith('.exe')) {
        executables.push(name.replace(/\\/g, '/'));
      }
    }
  }

  // Heuristic for name and version from filename
  const baseName = path.basename(filename, path.extname(filename)) || 'MyApplication';
  let suggestedName = baseName;
  let suggestedVersion = '1.0.0';

  const versionMatch = baseName.match(/[-_]v?(\d+\.\d+(\.\d+)?)/i);
  if (versionMatch) {
    suggestedVersion = versionMatch[1];
    suggestedName = baseName.substring(0, versionMatch.index).replace(/[-_]/g, ' ').trim();
  } else {
    suggestedName = baseName.replace(/[-_](x64|x86|win32|win|installer|setup|portable)/gi, '').replace(/[-_]/g, ' ').trim();
  }

  // Capitalize name nicely
  if (suggestedName) {
    suggestedName = suggestedName
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  } else {
    suggestedName = 'My Application';
  }

  return {
    executables,
    suggestedName,
    suggestedVersion,
    fileCount
  };
}

export function generateNsisScript(options: NsisBuildOptions, sourceDir: string, outFile: string): string {
  const appName = options.appName.trim() || 'My Application';
  const appVersion = options.appVersion.trim() || '1.0.0';
  const publisher = (options.publisher || appName).trim();
  const mainExe = (options.mainExe || '').replace(/\//g, '\\').trim();
  const isPerMachine = options.installScope !== 'currentUser';
  const createDesktopShortcut = options.createDesktopShortcut !== false;
  const createStartMenuShortcut = options.createStartMenuShortcut !== false;
  const createUninstaller = options.createUninstaller !== false;
  const runAfterInstall = !!options.runAfterInstall;

  const execLevel = isPerMachine ? 'admin' : 'user';
  const defaultDir = isPerMachine
    ? `$PROGRAMFILES\\${appName}`
    : `$LOCALAPPDATA\\Programs\\${appName}`;
  const regRoot = isPerMachine ? 'HKLM' : 'HKCU';

  // Normalize paths for NSIS compiler
  const normSource = sourceDir.replace(/\\/g, '/');
  const normOut = outFile.replace(/\\/g, '/');

  let script = `; ==========================================================
; NSIS Modern UI 2 Installer Script
; Generated automatically by Endpoint Forge
; ==========================================================
Unicode True
!include "MUI2.nsh"
!include "LogicLib.nsh"

; --- Application Definitions ---
!define PRODUCT_NAME "${appName}"
!define PRODUCT_VERSION "${appVersion}"
!define PRODUCT_PUBLISHER "${publisher}"
${mainExe ? `!define MAIN_EXE "${mainExe}"` : ''}

Name "${appName}"
OutFile "${normOut}"
InstallDir "${defaultDir}"
InstallDirRegKey ${regRoot} "Software\\${publisher}\\${appName}" "InstallDir"
RequestExecutionLevel ${execLevel}

SetCompressor /SOLID lzma

; --- Interface Settings ---
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to \${PRODUCT_NAME} Setup"
!define MUI_WELCOMEPAGE_TEXT "This setup wizard will guide you through installing \${PRODUCT_NAME} \${PRODUCT_VERSION}.$\\r$\\n$\\r$\\nClick Next to continue."

; --- Pages ---
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
`;

  if (runAfterInstall && mainExe) {
    script += `!define MUI_FINISHPAGE_RUN "$INSTDIR\\${mainExe}"\n!define MUI_FINISHPAGE_RUN_TEXT "Launch ${appName}"\n`;
  }

  script += `!insertmacro MUI_PAGE_FINISH\n\n`;

  if (createUninstaller) {
    script += `; --- Uninstaller Pages ---
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
\n`;
  }

  script += `; --- Languages ---
!insertmacro MUI_LANGUAGE "English"

; --- Installer Sections ---
Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  
  ; Extract application files
  File /r "${normSource}/*.*"
`;

  if (createDesktopShortcut && mainExe) {
    script += `
  ; Desktop Shortcut
  SetShellVarContext ${isPerMachine ? 'all' : 'current'}
  CreateShortCut "$DESKTOP\\${appName}.lnk" "$INSTDIR\\${mainExe}" "" "$INSTDIR\\${mainExe}" 0
`;
  }

  if (createStartMenuShortcut && mainExe) {
    script += `
  ; Start Menu Shortcut
  SetShellVarContext ${isPerMachine ? 'all' : 'current'}
  CreateDirectory "$SMPROGRAMS\\${appName}"
  CreateShortCut "$SMPROGRAMS\\${appName}\\${appName}.lnk" "$INSTDIR\\${mainExe}" "" "$INSTDIR\\${mainExe}" 0
`;
    if (createUninstaller) {
      script += `  CreateShortCut "$SMPROGRAMS\\${appName}\\Uninstall ${appName}.lnk" "$INSTDIR\\Uninstall.exe" "" "$INSTDIR\\Uninstall.exe" 0\n`;
    }
  }

  if (createUninstaller) {
    script += `
  ; Create Uninstaller
  WriteUninstaller "$INSTDIR\\Uninstall.exe"
  
  ; Write Registry Keys for Windows Installed Apps / Control Panel
  WriteRegStr ${regRoot} "Software\\${publisher}\\${appName}" "InstallDir" "$INSTDIR"
  WriteRegStr ${regRoot} "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "DisplayName" "${appName}"
  WriteRegStr ${regRoot} "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "DisplayVersion" "${appVersion}"
  WriteRegStr ${regRoot} "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "Publisher" "${publisher}"
  WriteRegStr ${regRoot} "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "UninstallString" '"$INSTDIR\\Uninstall.exe"'
  WriteRegStr ${regRoot} "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "QuietUninstallString" '"$INSTDIR\\Uninstall.exe" /S'
  WriteRegStr ${regRoot} "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "InstallLocation" "$INSTDIR"
  ${mainExe ? `WriteRegStr ${regRoot} "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "DisplayIcon" "$INSTDIR\\${mainExe}"` : ''}
  WriteRegDWORD ${regRoot} "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "NoModify" 1
  WriteRegDWORD ${regRoot} "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}" "NoRepair" 1
`;
  }

  script += `SectionEnd\n\n`;

  if (createUninstaller) {
    script += `; --- Uninstaller Section ---
Section "Uninstall"
  SetShellVarContext ${isPerMachine ? 'all' : 'current'}
`;
    if (createDesktopShortcut) {
      script += `  Delete "$DESKTOP\\${appName}.lnk"\n`;
    }
    if (createStartMenuShortcut) {
      script += `  Delete "$SMPROGRAMS\\${appName}\\${appName}.lnk"\n`;
      script += `  Delete "$SMPROGRAMS\\${appName}\\Uninstall ${appName}.lnk"\n`;
      script += `  RMDir "$SMPROGRAMS\\${appName}"\n`;
    }
    script += `
  ; Remove installation directory
  RMDir /r "$INSTDIR"

  ; Clean registry
  DeleteRegKey ${regRoot} "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}"
  DeleteRegKey ${regRoot} "Software\\${publisher}\\${appName}"
SectionEnd
`;
  }

  return script;
}

export async function compileNsisScript(
  scriptContent: string,
  workDir: string,
  outFile: string,
  makensisInfo: { path: string; nsisDir: string }
): Promise<{ success: boolean; error?: string }> {
  const scriptPath = path.join(workDir, 'installer.nsi');
  fs.writeFileSync(scriptPath, scriptContent, 'utf8');

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      NSISDIR: makensisInfo.nsisDir
    };

    execFile(makensisInfo.path, [scriptPath], { env, cwd: workDir }, (err, _stdout, stderr) => {
      if (err) {
        resolve({
          success: false,
          error: `NSIS compilation failed: ${stderr || err.message}`
        });
        return;
      }

      if (!fs.existsSync(outFile)) {
        resolve({
          success: false,
          error: 'Installer compilation finished, but output file was not generated.'
        });
        return;
      }

      resolve({ success: true });
    });
  });
}

export async function buildInstallerFromZip(
  zipInput: Buffer | string,
  options: NsisBuildOptions,
  outFile: string,
  makensisInfo: { path: string; nsisDir: string }
): Promise<{ success: boolean; error?: string }> {
  const workDir = path.join(os.tmpdir(), `nsis-build-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const sourceDir = path.join(workDir, 'source');
  fs.mkdirSync(sourceDir, { recursive: true });

  try {
    const zip = typeof zipInput === 'string' ? new AdmZip(zipInput) : new AdmZip(zipInput);
    zip.extractAllTo(sourceDir, true);

    // Make sure destination directory exists
    fs.mkdirSync(path.dirname(outFile), { recursive: true });

    const script = generateNsisScript(options, sourceDir, outFile);
    const compileResult = await compileNsisScript(script, workDir, outFile, makensisInfo);
    
    // Clean up temporary files
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {}

    return compileResult;
  } catch (err: any) {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {}
    return { success: false, error: err.message || 'Failed to extract and build installer from zip.' };
  }
}

export async function buildInstallerFromFolder(
  sourceDir: string,
  options: NsisBuildOptions,
  outFile: string,
  makensisInfo: { path: string; nsisDir: string }
): Promise<{ success: boolean; error?: string }> {
  const workDir = path.join(os.tmpdir(), `nsis-folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    // Make sure destination directory exists
    fs.mkdirSync(path.dirname(outFile), { recursive: true });

    const script = generateNsisScript(options, sourceDir, outFile);
    const compileResult = await compileNsisScript(script, workDir, outFile, makensisInfo);

    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {}

    return compileResult;
  } catch (err: any) {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {}
    return { success: false, error: err.message || 'Failed to build installer from folder.' };
  }
}

