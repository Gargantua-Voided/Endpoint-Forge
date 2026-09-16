import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  windowControl: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.send('window-control', action),
  
  // Server controls
  startServer: (port: number) => ipcRenderer.invoke('start-server', port),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  onServerStatusChanged: (callback: (status: any) => void) => {
    ipcRenderer.on('server-status-changed', (_event, status) => callback(status));
  },
  onServerLog: (callback: (log: any) => void) => {
    ipcRenderer.on('server-log', (_event, log) => callback(log));
  },
  
  // Updater controls
  checkForUpdates: () => ipcRenderer.invoke('check-updates'),
  onUpdateEvent: (callback: (event: any) => void) => {
    ipcRenderer.on('update-event', (_e, updateEvent) => callback(updateEvent));
  },
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // Filesystem + Packager
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  selectSaveFile: (defaultName: string) => ipcRenderer.invoke('select-save-file', defaultName),
  packageIntuneLocal: (sourceDir: string, setupFile: string, outPath: string) => 
    ipcRenderer.invoke('package-intune-local', sourceDir, setupFile, outPath),
  packageIntuneLocalFiles: (filePaths: string[], setupFile: string, outPath: string) => ipcRenderer.invoke('package-intune-local-files', filePaths, setupFile, outPath),
  getIntuneStatus: () => ipcRenderer.invoke('get-intune-status')
});
