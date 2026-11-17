import React, { useState, useEffect } from 'react';
import { adminService, printerService } from '../services/api';
import { Printer, WorkerInfo, User, SystemLogItem } from '../types';
import { Modal } from '../components/Modal';
import {
  ShieldCheck,
  Printer as PrinterIcon,
  Cpu,
  Users,
  ScrollText,
  Plus,
  RefreshCw,
  Trash2,
  Edit,
  Activity,
  CheckCircle2,
  AlertCircle,
  Wifi,
  Server,
} from 'lucide-react';

export const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'printers' | 'workers' | 'users' | 'logs'>('printers');

  // Data states
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<SystemLogItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Printer Modal State
  const [printerModalOpen, setPrinterModalOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<Printer | null>(null);
  const [printerForm, setPrinterForm] = useState({
    name: 'HP LaserJet Pro MFP M126nw',
    brand: 'HP',
    model: 'HP LaserJet Pro MFP M126nw',
    lanIp: '192.168.1.150',
    ippPort: 631,
    ippEndpoint: '/ipp/printer',
    isDefault: true,
    locationNotes: 'Home/Office Wi-Fi Router Subnet',
  });
  const [printerFormError, setPrinterFormError] = useState('');
  const [testResult, setTestResult] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'printers') {
        const list = await printerService.getPrinters();
        setPrinters(list);
      } else if (activeTab === 'workers') {
        const list = await adminService.getWorkers();
        setWorkers(list);
      } else if (activeTab === 'users') {
        const list = await adminService.getUsers();
        setUsers(list);
      } else if (activeTab === 'logs') {
        const res = await adminService.getLogs({ limit: 50 });
        setLogs(res.logs);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleOpenAddPrinter = () => {
    setEditingPrinter(null);
    setPrinterForm({
      name: 'HP LaserJet Pro MFP M126nw',
      brand: 'HP',
      model: 'HP LaserJet Pro MFP M126nw',
      lanIp: '192.168.1.150',
      ippPort: 631,
      ippEndpoint: '/ipp/printer',
      isDefault: printers.length === 0,
      locationNotes: 'Office Wi-Fi Network',
    });
    setPrinterFormError('');
    setTestResult(null);
    setPrinterModalOpen(true);
  };

  const handleOpenEditPrinter = (p: Printer) => {
    setEditingPrinter(p);
    setPrinterForm({
      name: p.name,
      brand: p.brand,
      model: p.model,
      lanIp: p.lanIp,
      ippPort: p.ippPort,
      ippEndpoint: p.ippEndpoint,
      isDefault: p.isDefault,
      locationNotes: p.locationNotes || '',
    });
    setPrinterFormError('');
    setTestResult(null);
    setPrinterModalOpen(true);
  };

  const handleSavePrinter = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrinterFormError('');

    try {
      if (editingPrinter) {
        await printerService.updatePrinter(editingPrinter._id, printerForm);
      } else {
        await printerService.createPrinter(printerForm);
      }
      setPrinterModalOpen(false);
      loadData();
    } catch (err: any) {
      setPrinterFormError(err.response?.data?.message || err.message || 'Failed to save printer');
    }
  };

  const handleDeletePrinter = async (id: string) => {
    if (!confirm('Are you sure you want to remove this printer?')) return;
    try {
      await printerService.deletePrinter(id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Delete failed');
    }
  };

  const handleTestPrinter = async (id: string) => {
    try {
      const res = await printerService.testConnection(id);
      setTestResult(res);
      loadData();
    } catch (err: any) {
      setTestResult({ reachable: false, error: err.message });
    }
  };

  const handleToggleUserRole = async (user: User) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Change role of ${user.email} to ${newRole}?`)) return;
    try {
      await adminService.updateUserRole(user.id, newRole);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Role change failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-brand-400" />
            System Administration
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Manage printers, cloud workers, user access, and system telemetry
          </p>
        </div>

        <button
          onClick={loadData}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-300 transition-colors w-fit"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Admin Tabs */}
      <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-2xl w-fit">
        {[
          { id: 'printers', label: 'Printers', icon: PrinterIcon },
          { id: 'workers', label: 'Cloud Workers', icon: Cpu },
          { id: 'users', label: 'User Accounts', icon: Users },
          { id: 'logs', label: 'System Logs', icon: ScrollText },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab: Printers */}
      {activeTab === 'printers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-lg text-white">Configured Network Printers</h3>
            <button
              onClick={handleOpenAddPrinter}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-600/30 transition-all"
            >
              <Plus className="h-4 w-4" /> Add Printer
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {printers.map((p) => (
              <div
                key={p._id}
                className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-slate-800 rounded-xl text-brand-400 border border-slate-700">
                      <PrinterIcon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-base">{p.name}</h4>
                        {p.isDefault && (
                          <span className="px-2 py-0.5 text-[9px] font-semibold bg-brand-500/10 text-brand-400 rounded border border-brand-500/20">
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">{p.model}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditPrinter(p)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeletePrinter(p._id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-750 text-xs space-y-1 font-mono">
                  <div className="text-slate-400">
                    Endpoint: <span className="text-white">http://{p.lanIp}:{p.ippPort}{p.ippEndpoint}</span>
                  </div>
                  <div className="text-slate-400">
                    Formats: <span className="text-brand-300">{p.supportedFormats.join(', ')}</span>
                  </div>
                  <div className="text-slate-400">
                    Status:{' '}
                    <span className={`font-semibold ${p.connectionStatus === 'ONLINE' ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {p.connectionStatus}
                    </span>{' '}
                    &bull; Paper: <span className="text-slate-200">{p.paperStatus}</span> &bull; Toner: <span className="text-slate-200">{p.tonerStatus}</span>
                  </div>
                </div>

                {p.lanIp.startsWith('192.168.223.') && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]">
                    Warning: 192.168.223.x is HP Wi-Fi Direct. Update to your router's actual LAN IP!
                  </div>
                )}

                <div className="pt-2 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">
                    Last Seen: {p.lastSeenAt ? new Date(p.lastSeenAt).toLocaleTimeString() : 'Never'}
                  </span>
                  <button
                    onClick={() => handleTestPrinter(p._id)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-brand-400 hover:underline"
                  >
                    <Activity className="h-3.5 w-3.5" /> Test Connection
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Cloud Workers */}
      {activeTab === 'workers' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
            Cloud Print Workers run independently in the cloud, maintaining a secure WireGuard tunnel to your router and polling for print jobs.
          </div>

          {workers.length === 0 ? (
            <div className="text-center py-12 rounded-2xl bg-slate-900/60 border border-slate-800">
              <Cpu className="h-10 w-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-300 font-semibold">No Cloud Workers Registered Yet</p>
              <p className="text-xs text-slate-500 mt-1">Start your worker container or script to see live telemetry.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workers.map((w) => (
                <div key={w._id} className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-slate-800 text-emerald-400 rounded-xl border border-slate-700">
                        <Server className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-base">{w.name}</h4>
                        <div className="text-xs text-slate-400 font-mono">{w.workerId} &bull; v{w.version}</div>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                      w.status === 'ONLINE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {w.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
                      <span className="text-slate-400 block text-[10px] uppercase">VPN Status</span>
                      <span className={`font-semibold ${w.vpnStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {w.vpnStatus}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
                      <span className="text-slate-400 block text-[10px] uppercase">Tunnel IP</span>
                      <span className="text-white">{w.vpnIp || 'N/A'}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
                      <span className="text-slate-400 block text-[10px] uppercase">Platform</span>
                      <span className="text-slate-200">{w.systemInfo?.platform || 'linux'} ({w.systemInfo?.arch || 'x64'})</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
                      <span className="text-slate-400 block text-[10px] uppercase">Heartbeat</span>
                      <span className="text-slate-200">{new Date(w.lastHeartbeat).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Users */}
      {activeTab === 'users' && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/60 uppercase font-mono text-[10px] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Name</th>
                <th className="px-5 py-3.5">Email</th>
                <th className="px-5 py-3.5">Role</th>
                <th className="px-5 py-3.5">Registered</th>
                <th className="px-5 py-3.5 text-right">Toggle Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/40">
                  <td className="px-5 py-4 font-semibold text-white">{u.name}</td>
                  <td className="px-5 py-4 font-mono text-slate-400">{u.email}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                      u.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-400">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => handleToggleUserRole(u)}
                      className="text-xs font-semibold text-brand-400 hover:underline"
                    >
                      Make {u.role === 'admin' ? 'User' : 'Admin'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Logs */}
      {activeTab === 'logs' && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
            <div className="p-4 bg-slate-800/50 border-b border-slate-800 text-xs font-semibold text-slate-300">
              System Audit Trail (Latest 50 events)
            </div>
            <div className="divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
              {logs.map((log) => (
                <div key={log._id} className="p-4 hover:bg-slate-800/30 font-mono text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        log.level === 'error' ? 'bg-rose-500/20 text-rose-400' : log.level === 'warn' ? 'bg-amber-500/20 text-amber-400' : 'bg-sky-500/20 text-sky-400'
                      }`}>
                        {log.level}
                      </span>
                      <span className="font-semibold text-white">{log.eventType}</span>
                    </div>
                    <span className="text-slate-500 text-[10px]">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-slate-300 font-sans">{log.description}</p>
                  {log.metadata && (
                    <pre className="p-2 rounded bg-slate-950 text-slate-400 text-[10px] overflow-x-auto">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Printer Modal */}
      <Modal
        isOpen={printerModalOpen}
        onClose={() => setPrinterModalOpen(false)}
        title={editingPrinter ? 'Edit Network Printer' : 'Add Network Printer'}
      >
        <form onSubmit={handleSavePrinter} className="space-y-4">
          {printerFormError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {printerFormError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Printer Display Name</label>
            <input
              type="text"
              required
              value={printerForm.name}
              onChange={(e) => setPrinterForm({ ...printerForm, name: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Brand</label>
              <input
                type="text"
                value={printerForm.brand}
                onChange={(e) => setPrinterForm({ ...printerForm, brand: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Model</label>
              <input
                type="text"
                value={printerForm.model}
                onChange={(e) => setPrinterForm({ ...printerForm, model: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Printer LAN IP (Private Router Network)
            </label>
            <input
              type="text"
              required
              value={printerForm.lanIp}
              onChange={(e) => setPrinterForm({ ...printerForm, lanIp: e.target.value })}
              placeholder="e.g. 192.168.1.150"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Important: Do NOT enter 192.168.223.1 if that is Wi-Fi Direct. Use its DHCP LAN IP assigned by your router.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">IPP Port</label>
              <input
                type="number"
                value={printerForm.ippPort}
                onChange={(e) => setPrinterForm({ ...printerForm, ippPort: parseInt(e.target.value, 10) || 631 })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">IPP Endpoint</label>
              <input
                type="text"
                value={printerForm.ippEndpoint}
                onChange={(e) => setPrinterForm({ ...printerForm, ippEndpoint: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={printerForm.isDefault}
              onChange={(e) => setPrinterForm({ ...printerForm, isDefault: e.target.checked })}
              className="rounded bg-slate-800 border-slate-700 text-brand-500 focus:ring-brand-500"
            />
            <label htmlFor="isDefault" className="text-xs text-slate-300">
              Set as Default Target Printer
            </label>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setPrinterModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-600/30"
            >
              {editingPrinter ? 'Update Printer' : 'Save Printer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
