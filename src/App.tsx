/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Settings, Server, Play, Square, RefreshCw, Moon, Sun, X, Minus, Square as MaximizeSquare, QrCode, Grid, Terminal } from 'lucide-react';
import logoSrc from '../logo.png';
import './types'; // Load types
import IntuneQRGenerator from './components/IntuneQRGenerator';
import IntunePackager from './components/IntunePackager';
import NsisBuilder from './components/NsisBuilder';
import { Package, Hammer } from 'lucide-react';

interface OpenedApp {
  id: string;
  name: string;
  icon: React.FC<any>;
}

interface ServerLog {
  timestamp: number;
  message: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('home');
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('customportal-dark') === 'true';
  });
  const [port, setPort] = useState(8080);
  
  const [isRunning, setIsRunning] = useState(false);
  const [ips, setIps] = useState<string[]>([]);
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [isUpdateReady, setIsUpdateReady] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  
  const [openedApps, setOpenedApps] = useState<OpenedApp[]>([]);
  const [serverLogs, setServerLogs] = useState<ServerLog[]>([]);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const electronAvailable = typeof window !== 'undefined' && !!window.electronAPI;

  useEffect(() => {
    // Initial fetch if available
    if (electronAvailable) {
      window.electronAPI.getServerStatus().then(status => {
        setIsRunning(status.isRunning);
        if (status.port) setPort(status.port);
        if (status.ips) setIps(status.ips);
      });

      window.electronAPI.onServerStatusChanged(status => {
        setIsRunning(status.isRunning);
        setPort(status.port);
        setIps(status.ips);
      });
      
      window.electronAPI.onServerLog(log => {
        setServerLogs(prev => [...prev, log].slice(-100)); // Keep last 100
      });
      
      window.electronAPI.onUpdateEvent((event) => {
        if (event.type === 'checking') {
          setUpdateStatus('Checking for updates...');
          setIsUpdateReady(false);
        }
        if (event.type === 'available') {
          setUpdateStatus(`Downloading update: ${event.info?.version || ''}...`);
        }
        if (event.type === 'progress') {
          const percent = Math.round(event.progress || 0);
          setUpdateProgress(percent);
          setUpdateStatus(`Downloading: ${percent}%`);
        }
        if (event.type === 'downloaded') {
          setUpdateStatus('Update ready to install!');
          setIsUpdateReady(true);
        }
        if (event.type === 'not-available') setUpdateStatus('Up to date');
        if (event.type === 'error') setUpdateStatus(`Update error: ${event.message}`);
      });
    }

    const savedPort = localStorage.getItem('customportal-port');
    if (savedPort) setPort(parseInt(savedPort, 10));
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [serverLogs, activeTab]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('customportal-dark', String(darkMode));
  }, [darkMode]);
  
  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      setPort(val);
      localStorage.setItem('customportal-port', String(val));
    }
  };

  const toggleServer = async () => {
    if (!electronAvailable) return;
    
    if (isRunning) {
      await window.electronAPI.stopServer();
    } else {
      await window.electronAPI.startServer(port);
    }
  };

  const handleCheckUpdates = () => {
    if (!electronAvailable) return;
    setUpdateStatus('Initiating check...');
    window.electronAPI.checkForUpdates();
  };

  const openApp = (appId: string, appName: string, icon: React.FC<any>) => {
    if (!openedApps.find(app => app.id === appId)) {
      setOpenedApps([...openedApps, { id: appId, name: appName, icon }]);
    }
    setActiveTab(appId);
  };

  const closeApp = (appId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenedApps(openedApps.filter(app => app.id !== appId));
    if (activeTab === appId) {
      setActiveTab('home');
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  const availableApps = [
    {
      id: 'app_nsis_builder',
      name: 'NSIS Installer Builder',
      description: 'Convert application ZIP archives into Windows setup installers (.exe).',
      icon: Hammer
    },
    {
      id: 'app_intune_packager',
      name: 'Intune Packager',
      description: 'Convert application installers to .intunewin format.',
      icon: Package
    },
    {
      id: 'app_intune_qr',
      name: 'Intune QR Generator',
      description: 'Create Android Enterprise provisioning QR codes.',
      icon: QrCode
    }
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors">
      
      {/* Titlebar */}
      <header 
        className="flex items-center justify-between px-3 py-2 bg-slate-200 dark:bg-slate-800 select-none z-50 shrink-0 shadow-sm"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center space-x-2">
          <img src={logoSrc} alt="Endpoint Forge" className="w-5 h-5 object-contain" />
          <span className="font-medium text-sm">Endpoint Forge</span>
        </div>
        <div className="flex items-center space-x-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {electronAvailable && (
            <>
              <button onClick={() => window.electronAPI.windowControl('minimize')} className="p-1.5 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors">
                <Minus size={14} />
              </button>
              <button onClick={() => window.electronAPI.windowControl('maximize')} className="p-1.5 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors">
                <MaximizeSquare size={14} />
              </button>
              <button onClick={() => window.electronAPI.windowControl('close')} className="p-1.5 hover:bg-red-500 hover:text-white rounded transition-colors">
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Sidebar */}
        <aside className="w-64 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 overflow-y-auto">
          <div className="p-4 space-y-6">
            <div className="space-y-1">
              <button 
                onClick={() => setActiveTab('home')}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${activeTab === 'home' ? 'bg-blue-600 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}
              >
                <Grid size={18} />
                <span className="font-medium text-sm">Dashboard</span>
              </button>
            </div>
            
            {openedApps.length > 0 && (
              <div className="space-y-2">
                <div className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Open Apps
                </div>
                <div className="space-y-1">
                  {openedApps.map(app => (
                    <div 
                      key={app.id}
                      onClick={() => setActiveTab(app.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer group ${activeTab === app.id ? 'bg-slate-200 dark:bg-slate-800 font-medium' : 'hover:bg-slate-200/50 dark:hover:bg-slate-800/50'}`}
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <app.icon size={16} className={activeTab === app.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'} />
                        <span className="text-sm truncate">{app.name}</span>
                      </div>
                      <button 
                        onClick={(e) => closeApp(app.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-all"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {electronAvailable && (
              <div className="space-y-1 pt-4 border-t border-slate-200 dark:border-slate-700/50">
                <button 
                  onClick={() => setActiveTab('settings')}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                >
                  <Settings size={18} />
                  <span className="font-medium text-sm">Settings</span>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Tab Content */}
        <main className="flex-1 p-8 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/50">
          
          {/* Dashboard Tab */}
          {activeTab === 'home' && (
            <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Applications</h1>
                <p className="text-slate-500 dark:text-slate-400">Launch a local utility from your toolkit.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {availableApps.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => openApp(app.id, app.name, app.icon)}
                    className="flex flex-col text-left items-start p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all group"
                  >
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg mb-4 group-hover:scale-110 transition-transform">
                      <app.icon size={24} />
                    </div>
                    <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-1">{app.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                      {app.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Intune QR App */}
          {activeTab === 'app_intune_qr' && (
            <IntuneQRGenerator />
          )}

          {/* Intune Packager App */}
          {activeTab === 'app_intune_packager' && (
            <IntunePackager />
          )}

          {/* NSIS Installer Builder App */}
          {activeTab === 'app_nsis_builder' && (
            <NsisBuilder />
          )}

          {/* Settings Tab (Electron Only) */}
          {activeTab === 'settings' && electronAvailable && (
            <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-300">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-slate-500 dark:text-slate-400">Configure Endpoint Forge and network preferences.</p>
              </div>

              <div className="space-y-6">
                
                {/* Network Server Settings */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm flex flex-col">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Network Server</h2>
                  </div>
                  
                  <div className="p-6 space-y-6 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <label className="font-medium flex items-center space-x-2">
                          <Server size={18} className="text-slate-500" />
                          <span>Server Status</span>
                        </label>
                        <div className="flex items-center space-x-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-400'}`}></span>
                          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                            {isRunning ? 'Active & listening' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={toggleServer}
                        disabled={!electronAvailable}
                        className={`shrink-0 flex items-center space-x-2 px-6 py-2.5 rounded-lg font-medium transition-colors ${
                          !electronAvailable ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-700 text-slate-400' :
                          isRunning 
                            ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                      >
                        {isRunning ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                        <span>{isRunning ? 'Stop Server' : 'Start Server'}</span>
                      </button>
                    </div>

                    {isRunning && ips.length > 0 && (
                      <div className="pt-4 border-t border-slate-100 dark:border-slate-700/50 space-y-2">
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Available Endpoints:</h3>
                        <div className="grid gap-2">
                          {ips.map((ip, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-200 dark:border-slate-700">
                              <code className="text-sm text-blue-600 dark:text-blue-400">
                                http://{ip}:{port}
                              </code>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="border-t border-slate-100 dark:border-slate-700/50 pt-6 flex items-center justify-between">
                      <div className="space-y-1">
                        <label htmlFor="portInput" className="font-medium">Server Port</label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Port to bind the network server</p>
                      </div>
                      <input 
                        id="portInput"
                        type="number" 
                        value={port}
                        onChange={handlePortChange}
                        disabled={isRunning || !electronAvailable}
                        className="w-24 px-3 py-2 text-right bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Terminal Log View */}
                  <div className="bg-slate-950 text-slate-300 p-4 h-48 overflow-y-auto font-mono text-xs shadow-inner">
                    <div className="space-y-1 pb-2">
                      {serverLogs.length === 0 ? (
                        <div className="text-slate-600 italic">Waiting for server events...</div>
                      ) : (
                        serverLogs.map((log, i) => (
                          <div key={i} className="flex space-x-3 hover:bg-slate-800/50 px-1 py-0.5 rounded">
                            <span className="text-slate-500 shrink-0">[{formatTime(log.timestamp)}]</span>
                            <span className={log.message.includes('Error') || log.message.includes('Failed') ? 'text-red-400' : 'text-slate-300'}>
                              {log.message}
                            </span>
                          </div>
                        ))
                      )}
                      <div ref={logsEndRef} />
                    </div>
                  </div>
                </div>

                {/* General Settings */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Appearance</h2>
                  </div>
                  
                  <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <label className="font-medium">Dark Mode</label>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Toggle dark appearance</p>
                      </div>
                      <button 
                        onClick={() => setDarkMode(!darkMode)}
                        className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                      >
                        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Updates */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Updates</h2>
                  </div>
                  <div className="p-6 flex items-center justify-between">
                    <div className="space-y-1">
                      <label className="font-medium">Application Updates</label>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {updateStatus || 'Fetch the latest release from GitHub'}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isUpdateReady && (
                        <button 
                          onClick={() => window.electronAPI.installUpdate()}
                          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                        >
                          <span>Install & Restart</span>
                        </button>
                      )}
                      {!isUpdateReady && (
                        <button 
                          onClick={handleCheckUpdates}
                          disabled={!electronAvailable}
                          className="flex items-center space-x-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 font-medium transition-colors disabled:opacity-50"
                        >
                          <RefreshCw size={16} />
                          <span>Check</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
