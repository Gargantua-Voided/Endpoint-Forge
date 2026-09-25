import React, { useState, useRef, useEffect } from 'react';
import {
  Hammer,
  UploadCloud,
  FolderUp,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  X,
  Code2,
  FileText,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Layers
} from 'lucide-react';
import { NsisBuildOptions, ZipScanResult } from '../types';

export default function NsisBuilder() {
  // Zip & File State
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [localZipPath, setLocalZipPath] = useState<string | null>(null);
  const [localFolderPath, setLocalFolderPath] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState<number>(0);

  // Form Fields
  const [appName, setAppName] = useState('');
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [publisher, setPublisher] = useState('');
  const [mainExe, setMainExe] = useState('');
  const [availableExes, setAvailableExes] = useState<string[]>([]);
  const [installScope, setInstallScope] = useState<'perMachine' | 'currentUser'>('perMachine');

  // Checkboxes
  const [createDesktopShortcut, setCreateDesktopShortcut] = useState(true);
  const [createStartMenuShortcut, setCreateStartMenuShortcut] = useState(true);
  const [createUninstaller, setCreateUninstaller] = useState(true);
  const [runAfterInstall, setRunAfterInstall] = useState(false);

  // Process & UI State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ fileName: string; path?: string; downloaded?: boolean } | null>(null);

  // Script Preview Modal
  const [showScriptPreview, setShowScriptPreview] = useState(false);
  const [scriptPreviewContent, setScriptPreviewContent] = useState<string>('');
  const [isLoadingScript, setIsLoadingScript] = useState(false);

  // Backend Status
  const [backendStatus, setBackendStatus] = useState<{ status: 'checking' | 'ready' | 'error'; message?: string }>({
    status: 'checking'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const electronAvailable = typeof window !== 'undefined' && !!window.electronAPI;

  // Check compiler availability
  useEffect(() => {
    const checkStatus = async () => {
      if (electronAvailable) {
        try {
          const status = await window.electronAPI.getNsisStatus();
          if (status.ready) {
            setBackendStatus({ status: 'ready' });
          } else {
            setBackendStatus({ status: 'error', message: status.error || 'NSIS compiler unavailable.' });
          }
        } catch {
          setBackendStatus({ status: 'error', message: 'Failed to verify local NSIS compiler.' });
        }
      } else {
        try {
          const res = await fetch('/api/nsis/status');
          if (!res.ok) throw new Error('API not available');
          const data = await res.json();
          if (data.ready) {
            setBackendStatus({ status: 'ready' });
          } else {
            setBackendStatus({ status: 'error', message: data.error || 'NSIS compiler not available on server.' });
          }
        } catch {
          setBackendStatus({
            status: 'error',
            message: 'Cannot reach the NSIS compiler service.'
          });
        }
      }
    };
    checkStatus();
  }, [electronAvailable]);

  // Reset entire form to clean state
  const resetForm = () => {
    setZipFile(null);
    setLocalZipPath(null);
    setLocalFolderPath(null);
    setFileCount(0);
    setAppName('');
    setAppVersion('1.0.0');
    setPublisher('');
    setMainExe('');
    setAvailableExes([]);
    setInstallScope('perMachine');
    setCreateDesktopShortcut(true);
    setCreateStartMenuShortcut(true);
    setCreateUninstaller(true);
    setRunAfterInstall(false);
    setError(null);
    setProcessStep('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFullReset = () => {
    resetForm();
    setSuccessInfo(null);
  };

  // Inspect uploaded zip file
  const handleZipUpload = async (file: File) => {
    setError(null);
    setZipFile(file);
    const nativePath = (file as any).path;
    if (nativePath && typeof nativePath === 'string') {
      setLocalZipPath(nativePath);
    } else {
      setLocalZipPath(null);
    }
    setLocalFolderPath(null);

    // Call server to scan zip and detect executables
    const formData = new FormData();
    formData.append('zipFile', file);

    try {
      setProcessStep('Scanning archive for binaries...');
      const res = await fetch('/api/nsis/scan', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data: ZipScanResult = await res.json();
        setAvailableExes(data.executables || []);
        setFileCount(data.fileCount || 0);
        if (!appName && data.suggestedName) {
          setAppName(data.suggestedName);
          if (!publisher) setPublisher(data.suggestedName);
        }
        if (data.suggestedVersion && appVersion === '1.0.0') {
          setAppVersion(data.suggestedVersion);
        }
        if (data.executables && data.executables.length > 0) {
          setMainExe(data.executables[0]);
        }
      } else {
        // Fallback heuristics from file name
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        if (!appName) setAppName(baseName);
      }
    } catch {
      // Fallback
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      if (!appName) setAppName(baseName);
    } finally {
      setProcessStep('');
    }
  };

  // Select local zip in Electron
  const handleSelectLocalZip = async () => {
    if (!electronAvailable) return;
    try {
      const files = await window.electronAPI.selectFiles();
      if (!files || files.length === 0) return;
      const selected = files[0];
      if (!selected.toLowerCase().endsWith('.zip')) {
        setError('Please select a valid .zip archive.');
        return;
      }

      setError(null);
      setLocalZipPath(selected);
      setLocalFolderPath(null);
      setZipFile(null);

      const scan = await window.electronAPI.scanNsisZipLocal(selected);
      setAvailableExes(scan.executables || []);
      setFileCount(scan.fileCount || 0);
      if (!appName && scan.suggestedName) {
        setAppName(scan.suggestedName);
        if (!publisher) setPublisher(scan.suggestedName);
      }
      if (scan.suggestedVersion && appVersion === '1.0.0') {
        setAppVersion(scan.suggestedVersion);
      }
      if (scan.executables && scan.executables.length > 0) {
        setMainExe(scan.executables[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to select or inspect local archive.');
    }
  };

  // Select local folder in Electron
  const handleSelectLocalFolder = async () => {
    if (!electronAvailable) return;
    try {
      const folder = await window.electronAPI.selectFolder();
      if (!folder) return;

      setError(null);
      setLocalFolderPath(folder);
      setLocalZipPath(null);
      setZipFile(null);

      const parts = folder.split(/[/\\]/);
      const lastFolder = parts[parts.length - 1] || 'MyApplication';
      if (!appName) {
        setAppName(lastFolder);
        if (!publisher) setPublisher(lastFolder);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to select folder.');
    }
  };

  // Generate options object
  const getBuildOptions = (): NsisBuildOptions => {
    return {
      appName: appName.trim() || 'MyApplication',
      appVersion: appVersion.trim() || '1.0.0',
      publisher: publisher.trim() || appName.trim() || 'Software Publisher',
      mainExe: mainExe.trim(),
      installScope,
      createDesktopShortcut,
      createStartMenuShortcut,
      createUninstaller,
      runAfterInstall
    };
  };

  // Preview NSIS Script
  const handlePreviewScript = async () => {
    setIsLoadingScript(true);
    setShowScriptPreview(true);
    try {
      const options = getBuildOptions();
      if (electronAvailable) {
        const script = await window.electronAPI.previewNsisScript(options);
        setScriptPreviewContent(script);
      } else {
        const res = await fetch('/api/nsis/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options)
        });
        const data = await res.json();
        setScriptPreviewContent(data.script || '');
      }
    } catch (err: any) {
      setScriptPreviewContent(`; Error generating script preview: ${err.message}`);
    } finally {
      setIsLoadingScript(false);
    }
  };

  // Build Installer
  const handleBuild = async () => {
    if (!zipFile && !localZipPath && !localFolderPath) {
      setError('Please select or upload a .zip archive or application directory.');
      return;
    }

    if (!appName.trim()) {
      setError('Please specify an Application Name.');
      return;
    }

    if (!mainExe.trim()) {
      setError('Please specify the Main Executable file inside the package.');
      return;
    }

    setError(null);
    setSuccessInfo(null);
    setIsProcessing(true);
    setProcessStep('Preparing package and configuration...');

    const options = getBuildOptions();

    // Desktop mode with Electron
    if (electronAvailable) {
      try {
        const defaultOutName = `${options.appName.replace(/[^a-zA-Z0-9_-]/g, '_')}-Setup-${options.appVersion}.exe`;
        const savePath = await window.electronAPI.selectSaveFile(defaultOutName, [
          { name: 'Windows Setup Executable (*.exe)', extensions: ['exe'] },
          { name: 'All Files (*.*)', extensions: ['*'] }
        ]);

        if (!savePath) {
          setIsProcessing(false);
          setProcessStep('');
          return;
        }

        const finalSavePath = savePath.toLowerCase().endsWith('.exe') ? savePath : `${savePath}.exe`;
        const finalFileName = finalSavePath.split(/[/\\]/).pop() || defaultOutName;

        setProcessStep('Compiling Modern UI 2 Windows installer with NSIS...');

        let result: { success: boolean; error?: string };
        const effectiveZip = localZipPath || (zipFile ? (zipFile as any).path : null);

        if (effectiveZip) {
          result = await window.electronAPI.buildNsisLocal(effectiveZip, options, finalSavePath);
        } else if (localFolderPath) {
          result = await window.electronAPI.buildNsisFolder(localFolderPath, options, finalSavePath);
        } else if (zipFile) {
          // If in electron without native path, send to backend API
          const formData = new FormData();
          formData.append('zipFile', zipFile);
          formData.append('options', JSON.stringify(options));
          const res = await fetch('/api/nsis/build', {
            method: 'POST',
            body: formData
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to build NSIS installer.');
          }
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = finalFileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          result = { success: true };
        } else {
          throw new Error('No source specified.');
        }

        if (!result.success) {
          throw new Error(result.error || 'Failed to build NSIS installer.');
        }

        setSuccessInfo({
          fileName: finalFileName,
          path: finalSavePath
        });
        resetForm();
      } catch (err: any) {
        setError(err.message || 'Build failed.');
      } finally {
        setIsProcessing(false);
        setProcessStep('');
      }
      return;
    }

    // Web Mode (browser upload & download)
    if (!zipFile) {
      setError('Please upload a .zip file.');
      setIsProcessing(false);
      setProcessStep('');
      return;
    }

    try {
      setProcessStep('Uploading package and compiling installer with NSIS...');
      const formData = new FormData();
      formData.append('zipFile', zipFile);
      formData.append('options', JSON.stringify(options));

      const res = await fetch('/api/nsis/build', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        let errMsg = 'Failed to build installer.';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      setProcessStep('Downloading generated installer...');
      const blob = await res.blob();
      const filename = `${options.appName.replace(/[^a-zA-Z0-9_-]/g, '_')}-Setup-${options.appVersion}.exe`;

      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      setSuccessInfo({
        fileName: filename,
        downloaded: true
      });
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Packaging failed.');
    } finally {
      setIsProcessing(false);
      setProcessStep('');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-y-auto">
      <div className="max-w-4xl w-full mx-auto p-6 md:p-8 space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-lg">
                <Hammer size={22} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                NSIS Installer Builder
              </h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Package application archives (ZIP) into clean, standalone Windows setup installers (.exe) with shortcuts and uninstallation support.
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handlePreviewScript}
              className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm"
              title="Inspect generated NSIS script"
            >
              <Code2 size={15} className="text-indigo-500" />
              <span>Inspect Script</span>
            </button>
            <button
              onClick={handleFullReset}
              className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm"
              title="Clear form and reset all fields"
            >
              <RotateCcw size={14} className="text-slate-400" />
              <span>Clear / New</span>
            </button>
          </div>
        </div>

        {/* Backend Warning if compiler missing */}
        {backendStatus.status === 'error' && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl flex items-start space-x-3 text-amber-800 dark:text-amber-200 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1">
              <span className="font-medium">NSIS Compiler Status Notice</span>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {backendStatus.message}
              </p>
            </div>
          </div>
        )}

        {/* Success Banner */}
        {successInfo && (
          <div className="p-5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex items-start justify-between text-emerald-900 dark:text-emerald-100 shadow-sm animate-in fade-in">
            <div className="flex items-start space-x-3">
              <CheckCircle2 size={22} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-semibold text-base text-emerald-800 dark:text-emerald-200">
                  Windows Installer Generated Successfully!
                </h4>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  Output:{' '}
                  <code className="font-mono bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded text-xs font-semibold">
                    {successInfo.fileName}
                  </code>
                </p>
                {successInfo.path && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    Saved to: <span className="font-mono">{successInfo.path}</span>
                  </p>
                )}
                {successInfo.downloaded && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    The setup installer has been downloaded to your system.
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setSuccessInfo(null)}
              className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200 p-1"
              title="Dismiss"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-xl flex items-start justify-between text-red-900 dark:text-red-100">
            <div className="flex items-start space-x-3">
              <AlertCircle size={20} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-medium text-sm">Packaging Error</span>
                <p className="text-xs text-red-700 dark:text-red-300 break-words">{error}</p>
              </div>
            </div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 p-1">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Step 1: Upload / Select ZIP Source */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold">
                1
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Application Source Archive (ZIP)
              </h3>
            </div>
            {(zipFile || localZipPath || localFolderPath) && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center space-x-1">
                <CheckCircle2 size={13} />
                <span>Source loaded</span>
              </span>
            )}
          </div>

          {/* Desktop Select Buttons */}
          {electronAvailable && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleSelectLocalZip}
                className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg flex items-center space-x-2 transition-colors border border-slate-300/60 dark:border-slate-600"
              >
                <FileArchive size={16} className="text-indigo-500" />
                <span>Select Local ZIP Archive</span>
              </button>
              <button
                type="button"
                onClick={handleSelectLocalFolder}
                className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg flex items-center space-x-2 transition-colors border border-slate-300/60 dark:border-slate-600"
              >
                <FolderUp size={16} className="text-slate-500" />
                <span>Select App Folder</span>
              </button>
            </div>
          )}

          {/* Drag & Drop Area */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleZipUpload(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              zipFile || localZipPath || localFolderPath
                ? 'border-indigo-400 bg-indigo-50/20 dark:bg-indigo-950/10'
                : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-50/50 dark:hover:bg-slate-800/50'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleZipUpload(e.target.files[0]);
                }
              }}
            />

            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full mb-3">
              <UploadCloud size={28} />
            </div>

            {zipFile ? (
              <div className="space-y-1">
                <span className="font-semibold text-slate-900 dark:text-white text-sm">
                  {zipFile.name}
                </span>
                <p className="text-xs text-slate-500">
                  {(zipFile.size / (1024 * 1024)).toFixed(2)} MB • {fileCount > 0 ? `${fileCount} files inside` : 'Ready'}
                </p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 pt-1">
                  Click or drop another file to replace
                </p>
              </div>
            ) : localZipPath ? (
              <div className="space-y-1">
                <span className="font-semibold text-slate-900 dark:text-white text-sm">
                  {localZipPath}
                </span>
                <p className="text-xs text-slate-500">
                  Local archive • {fileCount > 0 ? `${fileCount} files detected` : 'Ready'}
                </p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 pt-1">
                  Click to replace
                </p>
              </div>
            ) : localFolderPath ? (
              <div className="space-y-1">
                <span className="font-semibold text-slate-900 dark:text-white text-sm">
                  {localFolderPath}
                </span>
                <p className="text-xs text-slate-500">Local directory selected</p>
              </div>
            ) : (
              <div className="space-y-1">
                <span className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                  Drop your application ZIP file here, or browse
                </span>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Upload a compressed folder containing your binary files (.exe, .dll, assets)
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Application Details & Binary Selection */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold">
              2
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Application Metadata & Executable
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Application Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Acme Studio"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Version *
              </label>
              <input
                type="text"
                placeholder="e.g. 1.0.0"
                value={appVersion}
                onChange={(e) => setAppVersion(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Publisher / Company
              </label>
              <input
                type="text"
                placeholder="e.g. Acme Corporation"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Install Scope
              </label>
              <select
                value={installScope}
                onChange={(e) => setInstallScope(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="perMachine">All Users (Program Files - Requires Admin)</option>
                <option value="currentUser">Current User (AppData - No Admin Prompt)</option>
              </select>
            </div>
          </div>

          {/* Main Executable Selection */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Main Executable (.exe) *
              </label>
              {availableExes.length > 0 && (
                <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                  {availableExes.length} {availableExes.length === 1 ? 'executable' : 'executables'} detected in ZIP
                </span>
              )}
            </div>

            {/* Quick selector badges if multiple executables detected */}
            {availableExes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {availableExes.map((exe) => (
                  <button
                    key={exe}
                    type="button"
                    onClick={() => setMainExe(exe)}
                    className={`px-2.5 py-1 text-xs font-mono rounded-md border transition-all ${
                      mainExe === exe
                        ? 'bg-indigo-100 dark:bg-indigo-900/60 border-indigo-500 text-indigo-700 dark:text-indigo-200 font-bold'
                        : 'bg-slate-100 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {exe}
                  </button>
                ))}
              </div>
            )}

            <input
              type="text"
              placeholder="e.g. app.exe or bin/launcher.exe"
              value={mainExe}
              onChange={(e) => setMainExe(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-slate-400 dark:text-slate-500">
              The primary file to launch when desktop or start menu shortcuts are clicked.
            </p>
          </div>
        </div>

        {/* Step 3: Installer Features (Checkboxes) */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold">
              3
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Installer Configuration Options
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Checkbox 1: Desktop Shortcut */}
            <label className="flex items-start space-x-3 p-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-900 transition-colors">
              <input
                type="checkbox"
                checked={createDesktopShortcut}
                onChange={(e) => setCreateDesktopShortcut(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium text-slate-900 dark:text-white flex items-center space-x-1.5">
                  <span>Create Desktop Shortcut</span>
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Places a shortcut icon on the user&apos;s desktop pointing to the main executable.
                </p>
              </div>
            </label>

            {/* Checkbox 2: Start Menu Entry */}
            <label className="flex items-start space-x-3 p-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-900 transition-colors">
              <input
                type="checkbox"
                checked={createStartMenuShortcut}
                onChange={(e) => setCreateStartMenuShortcut(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium text-slate-900 dark:text-white flex items-center space-x-1.5">
                  <span>Create Start Menu Entry</span>
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Adds program entry to Windows Start Menu under the application folder.
                </p>
              </div>
            </label>

            {/* Checkbox 3: Create Uninstaller */}
            <label className="flex items-start space-x-3 p-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-900 transition-colors">
              <input
                type="checkbox"
                checked={createUninstaller}
                onChange={(e) => setCreateUninstaller(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium text-slate-900 dark:text-white flex items-center space-x-1.5">
                  <span>Create Uninstaller</span>
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Generates Uninstall.exe and registers the app in Windows Installed Apps / Control Panel.
                </p>
              </div>
            </label>

            {/* Checkbox 4: Run After Install */}
            <label className="flex items-start space-x-3 p-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-900 transition-colors">
              <input
                type="checkbox"
                checked={runAfterInstall}
                onChange={(e) => setRunAfterInstall(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium text-slate-900 dark:text-white flex items-center space-x-1.5">
                  <span>Launch Application After Install</span>
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Displays a &quot;Run {appName || 'Application'}&quot; checkbox on the installer finish wizard page.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Build Action Section */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {processStep ? (
              <span className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 font-medium">
                <Loader2 size={14} className="animate-spin" />
                <span>{processStep}</span>
              </span>
            ) : (
              <span>Output: {appName ? `${appName.replace(/[^a-zA-Z0-9_-]/g, '_')}-Setup-${appVersion}.exe` : 'Setup.exe'}</span>
            )}
          </div>

          <button
            onClick={handleBuild}
            disabled={isProcessing || (!zipFile && !localZipPath && !localFolderPath)}
            className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none text-white font-medium rounded-xl shadow-sm hover:shadow flex items-center justify-center space-x-2 transition-all"
          >
            {isProcessing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Building Installer...</span>
              </>
            ) : (
              <>
                <Hammer size={18} />
                <span>Build Windows Installer (.exe)</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>

      </div>

      {/* Script Preview Modal */}
      {showScriptPreview && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center space-x-2">
                <FileText size={18} className="text-indigo-500" />
                <h3 className="font-semibold text-slate-900 dark:text-white">Generated NSIS Script</h3>
              </div>
              <button
                onClick={() => setShowScriptPreview(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-auto bg-slate-950 font-mono text-xs text-slate-200">
              {isLoadingScript ? (
                <div className="flex items-center justify-center py-12 space-x-2 text-slate-400">
                  <Loader2 size={18} className="animate-spin" />
                  <span>Generating script preview...</span>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap">{scriptPreviewContent}</pre>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <span className="text-xs text-slate-400">Modern UI 2 compatible script</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(scriptPreviewContent);
                }}
                className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
              >
                Copy Script
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
