import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { PrintPage } from './pages/PrintPage';
import { HistoryPage } from './pages/HistoryPage';
import { Shield, Lock } from 'lucide-react';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<'print' | 'history'>('print');

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100">
      <Navbar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {currentTab === 'print' ? (
          <PrintPage onNavigateHistory={() => setCurrentTab('history')} />
        ) : (
          <HistoryPage />
        )}
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-900/60 py-5 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-400" />
            <span>AirPrint Hub &bull; Target: HP LaserJet Pro MFP M126nw (103.209.67.76)</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-slate-400" />
            <span>Direct Router Port Forwarding &bull; Ports 631 / 9100</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
