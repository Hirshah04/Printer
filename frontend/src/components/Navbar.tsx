import React, { useState, useEffect } from 'react';
import { Printer as PrinterIcon, FileUp, History, RefreshCw, Radio } from 'lucide-react';
import { printerService } from '../services/api';
import { realtimeClient } from '../services/realtime';
import { Printer, PrinterOperationalStatus } from '../types';

interface NavbarProps {
  currentTab: 'print' | 'history';
  setCurrentTab: (tab: 'print' | 'history') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab }) => {
  const [printer, setPrinter] = useState<Printer | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Initial fetch
    printerService.getPrinter().then(setPrinter).catch(() => {});

    // Subscribe to SSE real-time telemetry stream
    const unsubscribe = realtimeClient.onPrinter((updatedPrinter) => {
      setPrinter(updatedPrinter);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const updated = await printerService.checkNow();
      setPrinter(updated);
    } catch {
      // Handled
    } finally {
      setChecking(false);
    }
  };

  const getStatusColor = (status?: PrinterOperationalStatus) => {
    switch (status) {
      case 'ONLINE':
      case 'IDLE':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'PRINTING':
      case 'BUSY':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'PAPER_OUT':
      case 'TONER_LOW':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'ERROR':
      case 'OFFLINE':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const formatAckTime = (iso?: string) => {
    if (!iso) return 'Waiting...';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return 'Unknown';
    }
  };

  const operationalStatus: PrinterOperationalStatus = printer?.currentStatus || 'ONLINE';

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
                Direct Wi-Fi PDF Printing
              </div>
            </div>
          </div>

          {/* Navigation - Exactly Two Pages: Print Document & History */}
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

          {/* Real-Time Wi-Fi Status Bar (192.168.1.37) */}
          <div className="hidden md:flex items-center gap-2.5">
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getStatusColor(operationalStatus)}`}>
                {operationalStatus}
              </span>

              <div className="text-left font-mono leading-tight">
                <div className="text-slate-200 font-semibold flex items-center gap-1.5">
                  <Radio className="h-3 w-3 text-brand-400 animate-pulse" />
                  <span>192.168.1.37</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Ack: {formatAckTime(printer?.lastAcknowledgementAt)}
                </div>
              </div>
            </div>

            <button
              onClick={handleCheckNow}
              disabled={checking}
              title="Force immediate IPP check now"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/50 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin text-brand-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};
