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

export interface ElectronAPI {
  windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
  startServer: (port: number) => Promise<{ success: boolean; message?: string }>;
  stopServer: () => Promise<{ success: boolean; message?: string }>;
  getServerStatus: () => Promise<{ isRunning: boolean; port: number; ips: string[] }>;
  onServerStatusChanged: (callback: (status: { isRunning: boolean; port: number; ips: string[] }) => void) => void;
  onServerLog: (callback: (log: { timestamp: number; message: string }) => void) => void;
  checkForUpdates: () => Promise<any>;
  onUpdateEvent: (callback: (event: any) => void) => void;
  installUpdate: () => Promise<void>;
  selectFiles: () => Promise<string[] | null>;
  selectFolder: () => Promise<string | null>;
  selectSaveFile: (defaultName: string) => Promise<string | null>;
  openExternal: (url: string) => void;
  packageIntuneLocal: (sourceDir: string, setupFile: string, outPath: string) => Promise<{ success: boolean; error?: string }>;
  packageIntuneLocalFiles: (filePaths: string[], setupFile: string, outPath: string) => Promise<{success: boolean, path?: string, error?: string}>;
  getIntuneStatus: () => Promise<{ ready: boolean; error?: string }>;
  // NSIS Installer Builder
  buildNsisLocal: (zipPath: string, options: NsisBuildOptions, outPath: string) => Promise<{ success: boolean; error?: string }>;
  buildNsisFolder: (folderPath: string, options: NsisBuildOptions, outPath: string) => Promise<{ success: boolean; error?: string }>;
  scanNsisZipLocal: (zipPath: string) => Promise<ZipScanResult>;
  getNsisStatus: () => Promise<{ ready: boolean; error?: string }>;
  previewNsisScript: (options: NsisBuildOptions) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
