import React, { useState, useRef } from 'react';
import { Package, FolderUp, UploadCloud, AlertCircle, CheckCircle2, Loader2, ArrowRight, X } from 'lucide-react';

export default function IntunePackager() {
  const [setupFile, setSetupFile] = useState('');
  
  // Web Mode State
  const [sourceFiles, setSourceFiles] = useState<any[]>([]);
  
  // Desktop Mode State
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Status State
  const [backendStatus, setBackendStatus] = useState<{ status: 'checking' | 'ready' | 'error', message?: string }>({ status: 'checking' });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const electronAvailable = typeof window !== 'undefined' && !!window.electronAPI;

  React.useEffect(() => {
    const checkStatus = async () => {
      if (electronAvailable) {
        try {
          const status = await window.electronAPI.getIntuneStatus();
          if (status.ready) {
            setBackendStatus({ status: 'ready' });
          } else {
            setBackendStatus({ status: 'error', message: status.error });
          }
        } catch (err: any) {
          setBackendStatus({ status: 'error', message: 'Failed to verify local packager status.' });
        }
      } else {
        try {
          const res = await fetch('/api/intune/status');
          // If we hit Vite or an invalid route, it won't be JSON or ok
          if (!res.ok) throw new Error('API not available');
          const data = await res.json();
          if (data.ready) {
            setBackendStatus({ status: 'ready' });
          } else {
            setBackendStatus({ status: 'error', message: data.error || 'Server is not ready' });
          }
        } catch (err) {
          setBackendStatus({ 
            status: 'error', 
            message: 'Cannot reach the Endpoint Forge API. Ensure the host is running via the desktop app, not directly from a web preview.' 
          });
        }
      }
    };
    
    checkStatus();
  }, [electronAvailable]);

  const handleFilesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSourceFiles(prev => [...prev, ...files]);
      setError(null);
      setSuccessMsg(null);
      
      // Auto-guess setup file if not set
      if (!setupFile) {
        const guess = files.find((f: File) => f.name.match(/\.(exe|msi|ps1|bat|cmd)$/i)) || files[0];
        if (guess) {
          setSetupFile((guess as File).name);
        }
      }
    }
  };

  const handleRemoveFile = (index: number) => {
    setSourceFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSelectFiles = async () => {
    if (!electronAvailable) return;
    try {
      const filePaths = await window.electronAPI.selectFiles();
      if (filePaths && filePaths.length > 0) {
        const fileObjects = filePaths.map(p => ({
          name: p.split(/[\\/]/).pop(),
          path: p
        }));
        setSourceFiles(prev => [...prev, ...fileObjects]);
        setError(null);
        setSuccessMsg(null);
        
        if (!setupFile) {
          const guess = fileObjects.find(f => f.name.match(/\.(exe|msi|ps1|bat|cmd)$/i)) || fileObjects[0];
          if (guess) {
            setSetupFile(guess.name);
          }
        }
      }
    } catch (err: any) {
      setError(`Failed to select files: ${err.message}`);
    }
  };

  const handleSelectFolder = async () => {
    if (!electronAvailable) return;
    try {
      const folderPath = await window.electronAPI.selectFolder();
      if (folderPath) {
        setSelectedFolder(folderPath);
        setError(null);
        setSuccessMsg(null);
      }
    } catch (err: any) {
      setError(`Failed to select folder: ${err.message}`);
    }
  };

  const resetForm = () => {
    setSetupFile('');
    setSourceFiles([]);
    setSelectedFolder(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearAll = () => {
    resetForm();
    setError(null);
    setSuccessMsg(null);
  };

  const handlePackageLocal = async () => {
    if (!electronAvailable || !setupFile.trim()) return;
    if (!selectedFolder && sourceFiles.length === 0) return;
    
    setError(null);
    setSuccessMsg(null);
    setIsProcessing(true);
    
    try {
      const defaultName = setupFile.split('.')[0] + '.intunewin';
      const savePath = await window.electronAPI.selectSaveFile(defaultName, [
        { name: 'Intune Package (*.intunewin)', extensions: ['intunewin'] },
        { name: 'All Files (*.*)', extensions: ['*'] }
      ]);
      
      if (!savePath) {
        setIsProcessing(false);
        return;
      }
      
      let result;
      if (selectedFolder) {
         result = await window.electronAPI.packageIntuneLocal(selectedFolder, setupFile.trim(), savePath);
      } else {
         const filePaths = sourceFiles.map(f => (f as any).path).filter(p => !!p);
         if (filePaths.length === 0) {
            throw new Error("Could not resolve local file paths. Please use the web version or select a folder instead.");
         }
         result = await window.electronAPI.packageIntuneLocalFiles(filePaths, setupFile.trim(), savePath);
      }
      
      if (result.success) {
        setSuccessMsg(`Successfully created ${savePath.split(/[\\/]/).pop()}`);
        resetForm();
      } else {
        setError(result.error || 'Unknown error occurred during packaging.');
      }
    } catch (err: any) {
      setError(err.message || 'Error executing packager.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePackageWeb = async () => {
    if (sourceFiles.length === 0 || !setupFile.trim()) return;
    
    setError(null);
    setSuccessMsg(null);
    setIsProcessing(true);
    
    const formData = new FormData();
    sourceFiles.forEach(file => formData.append('sourceFiles', file));
    formData.append('setupFile', setupFile.trim());
    
    try {
      // In web mode, the port is typically the same as the host, but if we are running in Electron 
      // the web server might be on the defined port. Since this is for Web UI users, relative URL is fine.
      const response = await fetch('/api/intune/package', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        let errMsg = 'Server error during packaging.';
        try {
          const text = await response.text();
          try {
            const errData = JSON.parse(text);
            errMsg = errData.error || errMsg;
          } catch (e) {
            // Not JSON
            errMsg = `Server error (${response.status}): ${text.substring(0, 50)}...`;
          }
        } catch (e) {
          // Ignore text parsing errors
        }
        throw new Error(errMsg);
      }
      
      // Handle file download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = setupFile.split('.')[0] + '.intunewin';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setSuccessMsg('Package created and downloaded successfully.');
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Network error.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Intune App Packager</h1>
          <p className="text-slate-500 dark:text-slate-400">
            Convert Windows application installers into .intunewin format for Microsoft Company Portal deployment.
          </p>
        </div>
        {(setupFile || selectedFolder || sourceFiles.length > 0) && (
          <button
            onClick={handleClearAll}
            className="self-start sm:self-auto text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Clear / New Package
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Configuration */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
            <h2 className="text-base font-semibold mb-4">1. Source Files</h2>
            
            {electronAvailable && (
              <div className="space-y-4 mb-4">
                <div className="grid grid-cols-2 gap-4">
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
                </div>
                
                {selectedFolder && (
                  <div className="flex items-center justify-between space-x-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800 overflow-hidden">
                    <div className="flex items-center space-x-2 overflow-hidden">
                      <CheckCircle2 size={16} className="shrink-0" />
                      <span className="truncate font-mono" title={selectedFolder}>{selectedFolder}</span>
                    </div>
                    <button
                      onClick={() => setSelectedFolder(null)}
                      className="text-slate-400 hover:text-red-500 hover:bg-blue-100 dark:hover:bg-slate-800 transition-colors p-1 rounded-md shrink-0"
                      title="Deselect folder"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
              <div className="space-y-4">
                {!electronAvailable && (
                  <label className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <UploadCloud className="w-8 h-8 mb-3 text-slate-400" />
                      <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
                        <span className="font-semibold">Click to upload files</span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Select one or multiple files</p>
                    </div>
                    <input type="file" multiple className="hidden" onChange={handleFilesUpload} ref={fileInputRef} />
                  </label>
                )}
                
                {sourceFiles.length > 0 && (
                  <div className="space-y-2 mt-4 max-h-48 overflow-y-auto pr-2 styled-scrollbar">
                    {sourceFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center space-x-2 overflow-hidden">
                          <CheckCircle2 size={14} className="text-blue-500 shrink-0" />
                          <span className="truncate font-mono text-slate-700 dark:text-slate-300" title={f.name}>{f.name}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveFile(i)}
                          className="text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors p-1 rounded-md"
                          title="Remove file"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
            <h2 className="text-base font-semibold mb-4">2. App Details</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Setup File Name</label>
                <input 
                  type="text"
                  value={setupFile}
                  onChange={(e) => setSetupFile(e.target.value)}
                  placeholder="e.g. setup.exe, install.ps1, install.msi"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  The primary installation executable or script inside your source directory.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Status & Action */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm flex flex-col">
          <h2 className="text-base font-semibold mb-4">3. Package & Export</h2>
          
          <div className="flex-1 flex flex-col">
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-700 p-6 flex-1 flex flex-col justify-center items-center text-center space-y-4">
              
              {backendStatus.status === 'checking' && (
                <>
                  <Loader2 className="w-12 h-12 text-slate-300 dark:text-slate-600 animate-spin" />
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                    Verifying server readiness...
                  </p>
                </>
              )}

              {backendStatus.status === 'error' && (
                <div className="flex flex-col items-center text-red-600 dark:text-red-400 space-y-3 w-full">
                  <AlertCircle size={32} />
                  <p className="text-sm font-medium">{backendStatus.message}</p>
                </div>
              )}

              {backendStatus.status === 'ready' && !isProcessing && !error && !successMsg && (
                <>
                  <Package className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                    Ready to compile. Click below to generate your .intunewin package.
                  </p>
                </>
              )}

              {isProcessing && (
                <>
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Packaging Application...</p>
                    <p className="text-xs text-slate-500">This may take a moment for large installers.</p>
                  </div>
                </>
              )}

              {error && (
                <div className="flex flex-col items-center text-red-600 dark:text-red-400 space-y-3 w-full">
                  <AlertCircle size={32} />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              {successMsg && (
                <div className="flex flex-col items-center text-emerald-600 dark:text-emerald-400 space-y-3 w-full">
                  <CheckCircle2 size={32} />
                  <p className="text-sm font-medium">{successMsg}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Workspace reset and ready for the next application.</p>
                  <button
                    onClick={() => setSuccessMsg(null)}
                    className="mt-1 text-xs font-semibold px-3 py-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-md hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
            
            <div className="mt-6">
              <button 
                onClick={electronAvailable ? handlePackageLocal : handlePackageWeb}
                disabled={backendStatus.status !== 'ready' || isProcessing || !setupFile.trim() || (!selectedFolder && sourceFiles.length === 0)}
                className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Package size={18} />
                    <span>Create .intunewin Package</span>
                    <ArrowRight size={16} className="ml-1 opacity-70" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
