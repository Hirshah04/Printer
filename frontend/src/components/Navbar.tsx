import React, { useState, useEffect } from 'react';
import { Printer as PrinterIcon, FileUp, History, RefreshCw, CheckCircle2, AlertOctagon } from 'lucide-react';
import { printerService } from '../services/api';
import { Printer } from '../types';

interface NavbarProps {
  currentTab: 'print' | 'history';
  setCurrentTab: (tab: 'print' | 'history') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab }) => {
  const [printer, setPrinter] = useState<Printer | null>(null);
  const [testing, setTesting] = useState(false);

  const fetchPrinterStatus = async () => {
    try {
      const data = await printerService.getPrinter();
      setPrinter(data);
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    fetchPrinterStatus();
    const timer = setInterval(fetchPrinterStatus, 15000);
    return () => clearInterval(timer);
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      await printerService.testConnection();
      await fetchPrinterStatus();
    } catch {
      // Handled
    } finally {
      setTesting(false);
    }
  };

  const isOnline = printer?.connectionStatus === 'ONLINE' || printer?.connectionStatus === 'BUSY';

  return (
    <nav className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => setCurrentTab('print')}
          >
            <div className="p-2 bg-gradient-to-tr from-brand-600 to-indigo-600 rounded-xl shadow-lg shadow-brand-500/20 text-white">
              <PrinterIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-lg text-white flex items-center gap-1.5">
                AirPrint <span className="text-brand-400 font-extrabold">Hub</span>
              </div>
              <div className="text-[10px] text-slate-400 tracking-wider uppercase font-mono">
                Remote PDF Printing
              </div>
            </div>
          </div>

          {/* Navigation - Exactly Two Tabs: Print Document & History */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentTab('print')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                currentTab === 'print'
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileUp className="h-4 w-4" />
              Print Document
            </button>
            <button
              onClick={() => setCurrentTab('history')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                currentTab === 'history'
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <History className="h-4 w-4" />
              History
            </button>
          </div>

          {/* Target Printer IP Badge (192.168.1.37) */}
          <div className="hidden sm:flex items-center gap-2.5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs">
              <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <div className="text-left font-mono">
                <span className="text-slate-300 font-semibold">192.168.1.37</span>
                <span className="text-slate-500 ml-1.5 text-[11px]">HP M126nw</span>
              </div>
            </div>
            <button
              onClick={handleTestConnection}
              disabled={testing}
              title="Test IPP Connection to 192.168.1.37"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${testing ? 'animate-spin text-brand-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};
