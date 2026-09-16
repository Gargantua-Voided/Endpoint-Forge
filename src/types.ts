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
  selectFolder: () => Promise<string | null>;
  selectSaveFile: (defaultName: string) => Promise<string | null>;
  openExternal: (url: string) => void;
  packageIntuneLocal: (sourceDir: string, setupFile: string, outPath: string) => Promise<{ success: boolean; error?: string }>;
  getIntuneStatus: () => Promise<{ ready: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
