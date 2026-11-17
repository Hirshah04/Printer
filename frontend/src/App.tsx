import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { PrintPage } from './pages/PrintPage';
import { HistoryPage } from './pages/HistoryPage';
import { NetworkSetupPage } from './pages/NetworkSetupPage';
import { AdminPage } from './pages/AdminPage';
import { Shield, Lock, Printer } from 'lucide-react';

export const App: React.FC = () => {
  const { user, loading, isAuthenticated, isAdmin } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="p-3 bg-brand-600/20 text-brand-400 rounded-2xl border border-brand-500/30 animate-pulse">
          <Printer className="h-8 w-8" />
        </div>
        <div className="h-6 w-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        <div className="text-xs text-slate-400 font-mono">Initializing AirPrint Hub...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentTab === 'dashboard' && (
          <DashboardPage
            onNavigatePrint={() => setCurrentTab('print')}
            onNavigateHistory={() => setCurrentTab('history')}
            onNavigateNetwork={() => setCurrentTab('network')}
          />
        )}
        {currentTab === 'print' && (
          <PrintPage
            onNavigateHistory={() => setCurrentTab('history')}
          />
        )}
        {currentTab === 'history' && <HistoryPage />}
        {currentTab === 'network' && <NetworkSetupPage />}
        {currentTab === 'admin' && isAdmin && <AdminPage />}
      </main>

      <footer className="border-t border-slate-850 bg-slate-900/60 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-400" />
            <span>AirPrint Hub &bull; Target: HP LaserJet Pro MFP M126nw</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-slate-400" />
            <span>No public IPP exposure &bull; Protected by Private Router VPN</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
