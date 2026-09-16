const fs = require('fs');

let code = fs.readFileSync('src/components/IntunePackager.tsx', 'utf8');

// Update state type to any[]
code = code.replace(
  /const \[sourceFiles, setSourceFiles\] = useState<File\[\]>\(\[\]\);/,
  `const [sourceFiles, setSourceFiles] = useState<any[]>([]);`
);

// Add handleSelectFiles function
if (!code.includes("handleSelectFiles")) {
  code = code.replace(
    /const handleSelectFolder = async \(\) => \{/,
    `const handleSelectFiles = async () => {
    if (!electronAvailable) return;
    try {
      const filePaths = await window.electronAPI.selectFiles();
      if (filePaths && filePaths.length > 0) {
        const fileObjects = filePaths.map(p => ({
          name: p.split(/[\\\\/]/).pop(),
          path: p
        }));
        setSourceFiles(prev => [...prev, ...fileObjects]);
        setError(null);
        setSuccessMsg(null);
        
        if (!setupFile) {
          const guess = fileObjects.find(f => f.name.match(/\\.(exe|msi|ps1|bat|cmd)$/i)) || fileObjects[0];
          if (guess) {
            setSetupFile(guess.name);
          }
        }
      }
    } catch (err: any) {
      setError(\`Failed to select files: \${err.message}\`);
    }
  };

  const handleSelectFolder = async () => {`
  );
}

// Replace the UI for selecting files in electron mode
// We need to add a "Select Files" button next to "Select Folder"
code = code.replace(
  /<button \n                  onClick=\{handleSelectFolder\}\n                  className="w-full relative flex flex-col items-center justify-center h-20 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700\/50 cursor-pointer transition-colors"\n                >\n                  <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">\n                    <span className="font-semibold">Click here to select an entire folder<\/span>\n                  <\/p>\n                <\/button>/m,
  `<div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={handleSelectFolder}
                    className="w-full relative flex flex-col items-center justify-center h-20 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                  >
                    <p className="mb-1 text-sm text-slate-500 dark:text-slate-400 text-center px-2">
                      <span className="font-semibold">Select Folder</span>
                    </p>
                  </button>
                  <button 
                    onClick={handleSelectFiles}
                    className="w-full relative flex flex-col items-center justify-center h-20 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                  >
                    <p className="mb-1 text-sm text-slate-500 dark:text-slate-400 text-center px-2">
                      <span className="font-semibold">Select Files</span>
                    </p>
                  </button>
                </div>`
);


// In electron-mode, if they select files, we also want to render the sourceFiles list
// The sourceFiles list is only rendered currently under the !electronAvailable block!
// Actually, earlier we removed the `) : (` so it might be rendering everywhere, or maybe not.
// Let's check the structure of IntunePackager.tsx
fs.writeFileSync('src/components/IntunePackager.tsx', code);
