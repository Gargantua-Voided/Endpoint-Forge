import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Download, FileJson, AlertCircle, CheckCircle2, Plus, X as XIcon } from 'lucide-react';
import QRCode from 'qrcode';

const DPC_COMPONENT = 'com.google.android.apps.work.clouddpc/.receivers.CloudDeviceAdminReceiver';
const DPC_CHECKSUM = 'I5YvS0O5hXY46mb01BlRjq4oJJGs2kuUcHvVkAPEXlg';
const DPC_DOWNLOAD_LOCATION = 'https://play.google.com/managed/downloadManagingApp?identifier=setup';
const ENROLLMENT_TOKEN_KEY = 'com.google.android.apps.work.clouddpc.EXTRA_ENROLLMENT_TOKEN';
const SYSTEM_APPS_KEY = 'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED';

export default function IntuneQRGenerator() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [enrollmentToken, setEnrollmentToken] = useState<string | null>(null);
  const [systemAppsEnabled, setSystemAppsEnabled] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  
  // Custom Flags State
  const [customFlags, setCustomFlags] = useState<{key: string, value: string}[]>([]);
  const [newFlagKey, setNewFlagKey] = useState('');
  const [newFlagValue, setNewFlagValue] = useState('');
  
  const payloadRef = useRef<any>(null);

  const findEnrollmentToken = (obj: any): string | null => {
    if (!obj || typeof obj !== 'object') return null;
    
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const res = findEnrollmentToken(item);
        if (res) return res;
      }
    } else {
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        
        if (key === ENROLLMENT_TOKEN_KEY && typeof val === 'string' && val.trim() !== '') {
          return val;
        }
        
        const altKeys = ['enrollmentToken', 'EnrollmentToken', 'enrollment_token', 'token', 'Token'];
        if (altKeys.includes(key) && typeof val === 'string' && val.trim().length >= 10) {
          return val;
        }
        
        if (typeof val === 'object') {
          const res = findEnrollmentToken(val);
          if (res) return res;
        }
      }
    }
    return null;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    setError(null);
    setEnrollmentToken(null);
    setQrDataUrl(null);
    payloadRef.current = null;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) throw new Error('File is empty.');
        
        const json = JSON.parse(text);
        const token = findEnrollmentToken(json);
        
        if (!token) {
          throw new Error('Could not find the Intune enrollment token. The JSON structure is not recognized.');
        }
        
        setEnrollmentToken(token);
      } catch (err: any) {
        setError(err.message || 'Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    
    e.target.value = '';
  };

  const addCustomFlag = () => {
    if (newFlagKey.trim()) {
      setCustomFlags([...customFlags, { key: newFlagKey.trim(), value: newFlagValue.trim() }]);
      setNewFlagKey('');
      setNewFlagValue('');
    }
  };

  const removeCustomFlag = (index: number) => {
    setCustomFlags(customFlags.filter((_, i) => i !== index));
  };

  const buildPayload = () => {
    if (!enrollmentToken) return null;
    
    const payload: any = {
      'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': DPC_COMPONENT,
      'android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM': DPC_CHECKSUM,
      'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': DPC_DOWNLOAD_LOCATION,
      [SYSTEM_APPS_KEY]: systemAppsEnabled,
      'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': {
        [ENROLLMENT_TOKEN_KEY]: enrollmentToken
      }
    };

    // Inject custom flags
    customFlags.forEach(flag => {
      let parsedValue: any = flag.value;
      // Auto-cast strings to booleans or numbers if applicable
      if (parsedValue.toLowerCase() === 'true') parsedValue = true;
      else if (parsedValue.toLowerCase() === 'false') parsedValue = false;
      else if (!isNaN(Number(parsedValue)) && parsedValue !== '') parsedValue = Number(parsedValue);
      
      payload[flag.key] = parsedValue;
    });

    return payload;
  };

  useEffect(() => {
    const generateQR = async () => {
      const payload = buildPayload();
      if (!payload) return;
      
      payloadRef.current = payload;
      const jsonString = JSON.stringify(payload);
      
      try {
        const dataUrl = await QRCode.toDataURL(jsonString, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 400
        });
        setQrDataUrl(dataUrl);
      } catch (err: any) {
        setError('QR Generation failed: ' + err.message);
      }
    };
    
    generateQR();
  }, [enrollmentToken, systemAppsEnabled, customFlags]);

  const exportJson = () => {
    if (!payloadRef.current) return;
    const blob = new Blob([JSON.stringify(payloadRef.current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName ? fileName.replace('.json', '-SystemAppsEnabled.json') : 'provisioning.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportPng = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = fileName ? fileName.replace('.json', '-SystemAppsEnabled.png') : 'qr-code.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Intune Android QR Generator</h1>
        <p className="text-slate-500 dark:text-slate-400">
          Create Android Enterprise QR provisioning payloads for Microsoft Intune Corporate-Owned Fully Managed devices.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
            <h2 className="text-base font-semibold mb-4">1. Select Intune JSON File</h2>
            <label className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <UploadCloud className="w-8 h-8 mb-3 text-slate-400" />
                <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">JSON files only</p>
              </div>
              <input type="file" className="hidden" accept=".json" onChange={handleFileUpload} />
            </label>
            
            {fileName && !error && (
              <div className="mt-4 flex items-center space-x-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800">
                <CheckCircle2 size={16} />
                <span>Loaded: <strong>{fileName}</strong></span>
              </div>
            )}
            
            {error && (
              <div className="mt-4 flex items-start space-x-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-100 dark:border-red-800">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-base font-semibold mb-4">2. Provisioning Options</h2>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Enrollment Token</label>
                  <input 
                    type="text"
                    value={enrollmentToken || ''}
                    onChange={(e) => setEnrollmentToken(e.target.value)}
                    placeholder="e.g. ABCDE-12345-..."
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Auto-filled from uploaded JSON, or pasted manually.
                  </p>
                </div>

                <label className="flex items-start space-x-3 cursor-pointer pt-2">
                  <input 
                    type="checkbox" 
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    checked={systemAppsEnabled}
                    onChange={(e) => setSystemAppsEnabled(e.target.checked)}
                    disabled={!enrollmentToken}
                  />
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Leave all system apps enabled</span>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Sets <code>PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED</code> to true, keeping manufacturer default apps during setup.
                    </p>
                  </div>
                </label>
              </div>
            </div>
            
            <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
              <h3 className="text-sm font-semibold mb-3">Custom JSON Flags</h3>
              
              <div className="space-y-3">
                {customFlags.map((flag, idx) => (
                  <div key={idx} className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-700">
                    <div className="flex-1 overflow-hidden">
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">{flag.key}</div>
                      <div className="text-sm truncate font-mono">{flag.value}</div>
                    </div>
                    <button 
                      onClick={() => removeCustomFlag(idx)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors"
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                ))}
                
                <div className="flex flex-col sm:flex-row gap-2">
                  <input 
                    type="text" 
                    placeholder="android.app.extra.FLAG_NAME"
                    value={newFlagKey}
                    onChange={(e) => setNewFlagKey(e.target.value)}
                    disabled={!enrollmentToken}
                    className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Value"
                      value={newFlagValue}
                      onChange={(e) => setNewFlagValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addCustomFlag()}
                      disabled={!enrollmentToken}
                      className="w-full sm:w-32 px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <button 
                      onClick={addCustomFlag}
                      disabled={!enrollmentToken || !newFlagKey.trim()}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm flex flex-col">
          <h2 className="text-base font-semibold mb-4">3. Generated QR Code</h2>
          
          <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] border border-slate-100 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Provisioning QR Code" className="max-w-full rounded-md shadow-sm bg-white p-2" />
            ) : (
              <div className="text-center text-slate-400 space-y-2">
                <QRCodeIcon className="w-12 h-12 mx-auto opacity-20" />
                <p className="text-sm">Upload a JSON file to generate QR</p>
              </div>
            )}
          </div>
          
          {qrDataUrl && (
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button 
                onClick={exportPng}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <Download size={16} />
                <span>Export PNG</span>
              </button>
              <button 
                onClick={exportJson}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors text-sm font-medium"
              >
                <FileJson size={16} />
                <span>Export JSON</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Simple internal icon for empty state
function QRCodeIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="5" height="5" x="3" y="3" rx="1" />
      <rect width="5" height="5" x="16" y="3" rx="1" />
      <rect width="5" height="5" x="3" y="16" rx="1" />
      <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
      <path d="M21 21v.01" />
      <path d="M12 7v3a2 2 0 0 1-2 2H7" />
      <path d="M3 12h.01" />
      <path d="M12 3h.01" />
      <path d="M12 16v.01" />
      <path d="M16 12h1" />
      <path d="M21 12v.01" />
      <path d="M12 21v-1" />
    </svg>
  );
}
