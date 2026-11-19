import React, { useState, useEffect } from 'react';
import { Printer as PrinterIcon, FileText, History, RefreshCw, Wifi } from 'lucide-react';
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
    printerService.getPrinter().then(setPrinter).catch(() => {});

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

  const getStatusLabel = (status?: PrinterOperationalStatus) => {
    if (status === 'PRINTING' || status === 'BUSY') return 'PRINTING';
    if (status === 'PAPER_OUT') return 'OUT OF PAPER';
    if (status === 'TONER_LOW') return 'TONER LOW';
    if (status === 'ERROR') return 'ERROR';
    if (status === 'OFFLINE') return 'OFFLINE';
    return 'READY TO PRINT';
  };

  const formatAckTime = (iso?: string) => {
    if (!iso) return '02:10:34 PM';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '02:10:34 PM';
    }
  };

  const operationalStatus: PrinterOperationalStatus = printer?.currentStatus || 'ONLINE';
  const isReady = operationalStatus === 'ONLINE' || operationalStatus === 'IDLE';

  return (
    <nav className="bg-[#050a22]/85 backdrop-blur-xl border-b border-blue-500/20 sticky top-0 z-50 shadow-xl shadow-blue-950/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-20">
          {/* Brand Logo & Title */}
          <div
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => setCurrentTab('print')}
          >
            <div className="p-2.5 bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 rounded-2xl shadow-lg shadow-blue-500/30 text-white group-hover:scale-105 transition-transform">
              <PrinterIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="font-extrabold text-xl text-white tracking-tight flex items-center gap-1.5">
                <span>AirPrint</span> <span className="text-cyan-400">Hub</span>
              </div>
              <div className="text-[10px] text-slate-400 tracking-widest uppercase font-mono font-medium">
                DIRECT WI-FI PDF PRINTING
              </div>
            </div>
          </div>

          {/* Center Navigation Pills */}
          <div className="p-1 bg-[#091230]/90 border border-blue-500/30 rounded-full flex items-center shadow-lg shadow-blue-950/60 backdrop-blur-md">
            <button
              onClick={() => setCurrentTab('print')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all ${
                currentTab === 'print'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>Print Document</span>
            </button>
            <button
              onClick={() => setCurrentTab('history')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all ${
                currentTab === 'history'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <History className="h-4 w-4" />
              <span>History</span>
            </button>
          </div>

          {/* Right Status Indicators */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Ready Status Pill */}
            <div className={`px-4 py-2 rounded-full border text-xs font-bold flex items-center gap-2 shadow-sm ${
              isReady
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-400 shadow-emerald-500/10'
                : 'bg-amber-950/50 border-amber-500/40 text-amber-300 shadow-amber-500/10'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isReady ? 'bg-emerald-400 shadow-sm shadow-emerald-400/80' : 'bg-amber-400'}`} />
              <span>{getStatusLabel(operationalStatus)}</span>
            </div>

            {/* Network Info Pill */}
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl bg-[#091230]/90 border border-blue-500/30 text-xs text-left font-mono">
              <Wifi className="h-4 w-4 text-cyan-400 shrink-0" />
              <div className="leading-tight">
                <div className="text-white font-bold text-xs tracking-tight">HP LaserJet M126nw</div>
                <div className="text-[10px] text-slate-400">A4 &bull; {formatAckTime(printer?.lastAcknowledgementAt)}</div>
              </div>
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleCheckNow}
              disabled={checking}
              title="Refresh printer telemetry"
              className="p-2.5 rounded-2xl bg-[#091230]/90 hover:bg-[#0f1d4d] border border-blue-500/30 text-slate-300 hover:text-white hover:border-cyan-400 transition-all shadow-md shadow-blue-950/50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};
