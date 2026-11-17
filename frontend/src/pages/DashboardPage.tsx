import React, { useState, useEffect } from 'react';
import { adminService, jobService, printerService } from '../services/api';
import { DashboardStats, PrintJob, Printer as PrinterType } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { JobDetailsModal } from '../components/JobDetailsModal';
import {
  Printer,
  FileText,
  CheckCircle2,
  Clock,
  AlertOctagon,
  ArrowUpRight,
  RefreshCw,
  PlusCircle,
  Wifi,
  Layers,
  Cpu,
} from 'lucide-react';

interface DashboardPageProps {
  onNavigatePrint: () => void;
  onNavigateHistory: () => void;
  onNavigateNetwork: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigatePrint,
  onNavigateHistory,
  onNavigateNetwork,
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<PrintJob[]>([]);
  const [printers, setPrinters] = useState<PrinterType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null);
  const [testingPrinterId, setTestingPrinterId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; msg: string } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsData, jobsData, printersData] = await Promise.all([
        adminService.getStats().catch(() => null),
        jobService.getJobs({ limit: 5 }),
        printerService.getPrinters(),
      ]);

      if (statsData) setStats(statsData);
      setRecentJobs(jobsData.jobs);
      setPrinters(printersData);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Live poll every 10s
    return () => clearInterval(interval);
  }, []);

  const handleTestPrinter = async (printerId: string) => {
    setTestingPrinterId(printerId);
    setTestResult(null);
    try {
      const res = await printerService.testConnection(printerId);
      if (res.reachable) {
        setTestResult({ id: printerId, success: true, msg: `Printer is ONLINE (State: ${res.state})` });
      } else {
        setTestResult({
          id: printerId,
          success: false,
          msg: res.diagnostic?.hint || res.error || 'Printer unreachable',
        });
      }
      // Refresh list
      const updated = await printerService.getPrinters();
      setPrinters(updated);
    } catch (err: any) {
      setTestResult({ id: printerId, success: false, msg: err.message || 'Connection test failed' });
    } finally {
      setTestingPrinterId(null);
    }
  };

  const primaryPrinter = printers.find((p) => p.isDefault) || printers[0];

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-900/60 via-slate-900 to-indigo-950/60 border border-slate-800 p-6 sm:p-8">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand-500/10 text-brand-400 border border-brand-500/20 mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse"></span>
              Private Router VPN Active
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Remote Wi-Fi PDF Printing
            </h2>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              Upload documents from anywhere in the world and send them directly to your home/office HP LaserJet without running a local computer.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onNavigatePrint}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm shadow-lg shadow-brand-600/30 transition-all hover:scale-105 active:scale-95"
            >
              <PlusCircle className="h-4 w-4" />
              Print Document
            </button>
            <button
              onClick={onNavigateNetwork}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-sm transition-all"
            >
              <Wifi className="h-4 w-4 text-brand-400" />
              Router Setup
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Jobs</div>
            <div className="text-2xl sm:text-3xl font-bold text-white mt-1">
              {stats?.totalJobs ?? recentJobs.length}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
            <FileText className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Completed</div>
            <div className="text-2xl sm:text-3xl font-bold text-emerald-400 mt-1">
              {stats?.completedJobs ?? recentJobs.filter((j) => j.status === 'COMPLETED').length}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">In Progress</div>
            <div className="text-2xl sm:text-3xl font-bold text-sky-400 mt-1">
              {stats?.pendingJobs ?? recentJobs.filter((j) => ['QUEUED', 'PROCESSING', 'PRINTING'].includes(j.status)).length}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Failed</div>
            <div className="text-2xl sm:text-3xl font-bold text-rose-400 mt-1">
              {stats?.failedJobs ?? recentJobs.filter((j) => j.status === 'FAILED').length}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertOctagon className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Target Printer Card & Status */}
      {primaryPrinter && (
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 text-brand-400">
                <Printer className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg text-white">{primaryPrinter.name}</h3>
                  {primaryPrinter.isDefault && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-brand-500/10 text-brand-400 rounded-md border border-brand-500/20">
                      DEFAULT
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  {primaryPrinter.model} &bull; LAN IP: <span className="text-slate-200">{primaryPrinter.lanIp}</span>:{primaryPrinter.ippPort}{primaryPrinter.ippEndpoint}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleTestPrinter(primaryPrinter._id)}
                disabled={testingPrinterId === primaryPrinter._id}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${testingPrinterId === primaryPrinter._id ? 'animate-spin' : ''}`} />
                Test IPP Connectivity
              </button>
            </div>
          </div>

          {/* Diagnostic Warning if user still has 192.168.223.1 */}
          {primaryPrinter.lanIp.startsWith('192.168.223.') && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
              <AlertOctagon className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <span className="font-semibold">Notice: IP 192.168.223.1 detected.</span> This is the HP Wi-Fi Direct subnet. For remote printing through your router VPN, please connect the printer to your router Wi-Fi and configure its actual router LAN IP (e.g. 192.168.1.x) under Network Setup.
              </div>
            </div>
          )}

          {testResult && testResult.id === primaryPrinter._id && (
            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              testResult.success ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
            }`}>
              {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertOctagon className="h-4 w-4" />}
              <span>{testResult.msg}</span>
            </div>
          )}

          {/* Telemetry badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Status</span>
              <span className={`font-semibold ${
                primaryPrinter.connectionStatus === 'ONLINE' ? 'text-emerald-400' : primaryPrinter.connectionStatus === 'BUSY' ? 'text-amber-400' : 'text-slate-400'
              }`}>
                {primaryPrinter.connectionStatus}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Paper Tray</span>
              <span className={`font-semibold ${
                primaryPrinter.paperStatus === 'OK' ? 'text-emerald-400' : primaryPrinter.paperStatus === 'OUT' ? 'text-rose-400' : 'text-slate-400'
              }`}>
                {primaryPrinter.paperStatus}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Toner Cartridge</span>
              <span className={`font-semibold ${
                primaryPrinter.tonerStatus === 'OK' ? 'text-emerald-400' : primaryPrinter.tonerStatus === 'EMPTY' ? 'text-rose-400' : 'text-slate-400'
              }`}>
                {primaryPrinter.tonerStatus}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Conversion</span>
              <span className="font-semibold text-brand-400">PCLm (Auto)</span>
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity Table */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg text-white">Recent Print Activity</h3>
            <p className="text-xs text-slate-400">Live feed of documents submitted to your printer</p>
          </div>
          <button
            onClick={onNavigateHistory}
            className="flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300"
          >
            View All History <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {recentJobs.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
            <FileText className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No print jobs submitted yet.</p>
            <button
              onClick={onNavigatePrint}
              className="mt-3 text-xs font-semibold text-brand-400 hover:underline"
            >
              Upload your first PDF
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 uppercase font-mono text-[10px] text-slate-400">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Document</th>
                  <th className="px-4 py-3">Pages / Copies</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 rounded-r-lg text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {recentJobs.map((job) => (
                  <tr
                    key={job._id}
                    onClick={() => setSelectedJob(job)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3.5 font-medium text-white flex items-center gap-2">
                      <FileText className="h-4 w-4 text-brand-400 shrink-0" />
                      <span className="truncate max-w-[200px] sm:max-w-xs">{job.documentName}</span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-400">
                      {job.pageCount} p &bull; {job.copies} {job.copies > 1 ? 'copies' : 'copy'}
                    </td>
                    <td className="px-4 py-3.5 text-slate-400">
                      {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={job.status} size="sm" />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button className="text-slate-400 hover:text-white p-1">
                        <ArrowUpRight className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <JobDetailsModal
        isOpen={Boolean(selectedJob)}
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onJobUpdated={loadData}
      />
    </div>
  );
};
