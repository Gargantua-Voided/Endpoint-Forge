const fs = require('fs');

// 1. Add select-files to electron/main.ts
let mainCode = fs.readFileSync('electron/main.ts', 'utf8');
if (!mainCode.includes("ipcMain.handle('select-files'")) {
  mainCode = mainCode.replace(
    /ipcMain\.handle\('select-folder', async \(\) => \{/,
    `ipcMain.handle('select-files', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled) return null;
  return result.filePaths;
});\n\nipcMain.handle('select-folder', async () => {`
  );
  fs.writeFileSync('electron/main.ts', mainCode);
}

// 2. Add select-files to electron/preload.ts
let preloadCode = fs.readFileSync('electron/preload.ts', 'utf8');
if (!preloadCode.includes("selectFiles:")) {
  preloadCode = preloadCode.replace(
    /selectFolder: \(\) => ipcRenderer\.invoke\('select-folder'\),/,
    `selectFiles: () => ipcRenderer.invoke('select-files'),\n  selectFolder: () => ipcRenderer.invoke('select-folder'),`
  );
  fs.writeFileSync('electron/preload.ts', preloadCode);
}

// 3. Add select-files to src/types.ts
let typesCode = fs.readFileSync('src/types.ts', 'utf8');
if (!typesCode.includes("selectFiles:")) {
  typesCode = typesCode.replace(
    /selectFolder: \(\) => Promise<string \| null>;/,
    `selectFiles: () => Promise<string[] | null>;\n  selectFolder: () => Promise<string | null>;`
  );
  fs.writeFileSync('src/types.ts', typesCode);
}

