import React, { useState, useEffect, useRef } from 'react';
import { printerService, jobService } from '../services/api';
import { realtimeClient } from '../services/realtime';
import { Printer, PrintJob, PrinterOperationalStatus } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { DebugConsole, ConsoleLogEntry } from '../components/DebugConsole';
import {
  FileUp,
  FileText,
  Printer as PrinterIcon,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Copy,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Radio,
  Clock,
  ShieldCheck,
} from 'lucide-react';

interface PrintPageProps {
  onNavigateHistory?: () => void;
}

export const PrintPage: React.FC<PrintPageProps> = ({ onNavigateHistory }) => {
  const [printer, setPrinter] = useState<Printer | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [copies, setCopies] = useState<number>(1);
  const [paperSize, setPaperSize] = useState<'A4' | 'Letter'>('A4');
  const [orientation, setOrientation] = useState<'PORTRAIT' | 'LANDSCAPE' | 'AUTO'>('PORTRAIT');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [activeJob, setActiveJob] = useState<PrintJob | null>(null);
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (
    level: ConsoleLogEntry['level'],
    category: ConsoleLogEntry['category'],
    message: string,
    details?: any
  ) => {
    const time =
      new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }) +
      '.' +
      String(Date.now() % 1000).padStart(3, '0');

    setLogs((prev) => [
      ...prev.slice(-150),
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: time,
        level,
        category,
        message,
        details,
      },
    ]);
  };

  useEffect(() => {
    const cloudUrl = import.meta.env.VITE_API_URL || 'Local / Direct';
    addLog('info', 'SYSTEM', `AirPrint Hub initialized. Backend URL: ${cloudUrl}`);
    addLog('info', 'PRINTER', 'Target Hardware: HP LaserJet Pro MFP M126nw (192.168.1.37:9100 / 631)');

    printerService
      .getPrinter()
      .then((p) => {
        setPrinter(p);
        addLog('info', 'PRINTER', `Current printer state: ${p.currentStatus} (${p.connectionStatus})`);
      })
      .catch((err) => {
        addLog('warn', 'NET', `Could not fetch initial printer info: ${err.message}`);
      });

    // Subscribe to SSE updates
    const unsubPrinter = realtimeClient.onPrinter((updated) => {
      setPrinter(updated);
      addLog('info', 'PRINTER', `Printer state update: ${updated.currentStatus} (Toner: ${updated.tonerStatus}, Paper: ${updated.paperStatus})`);
    });

    const unsubJob = realtimeClient.onJob((updatedJob) => {
      setActiveJob((prev) => {
        if (!prev || prev._id === updatedJob._id) {
          const lvl =
            updatedJob.status === 'COMPLETED'
              ? 'success'
              : updatedJob.status === 'FAILED'
              ? 'error'
              : 'info';
          const cat = updatedJob.status === 'FAILED' ? 'PRINTER' : 'DISPATCH';
          addLog(
            lvl,
            cat,
            `Job #${updatedJob._id.slice(-6)} -> [${updatedJob.status}] ${updatedJob.message || updatedJob.errorMessage || ''}`
          );
          return updatedJob;
        }
        return prev;
      });
    });

    const unsubStatus = realtimeClient.onStatus((connected) => {
      addLog(
        connected ? 'success' : 'warn',
        'NET',
        connected ? 'SSE Real-time telemetry stream connected.' : 'SSE telemetry stream disconnected. Retrying...'
      );
    });

    return () => {
      unsubPrinter();
      unsubJob();
      unsubStatus();
    };
  }, []);

  const handleCheckNow = async () => {
    setIsChecking(true);
    addLog('info', 'PRINTER', 'Triggering manual printer telemetry polling cycle...');
    try {
      const updated = await printerService.checkNow();
      setPrinter(updated);
      addLog('success', 'PRINTER', `Telemetry received: ${updated.currentStatus} (${updated.connectionStatus})`);
    } catch (err: any) {
      addLog('error', 'NET', `Telemetry check failed: ${err.message}`);
    } finally {
      setIsChecking(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError('');

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selected: File) => {
    const name = selected.name.toLowerCase();
    const isPdf = selected.type.includes('pdf') || name.endsWith('.pdf');
    if (!isPdf) {
      const msg = 'Only PDF documents (.pdf) are supported.';
      setError(msg);
      addLog('warn', 'UPLOAD', msg);
      return;
    }
    if (selected.size > 25 * 1024 * 1024) {
      const msg = 'File size exceeds the 25MB maximum limit.';
      setError(msg);
      addLog('warn', 'UPLOAD', msg);
      return;
    }
    setFile(selected);
    addLog(
      'info',
      'UPLOAD',
      `PDF file selected: "${selected.name}" (${(selected.size / 1024).toFixed(1)} KB, mime: ${selected.type || 'application/pdf'})`
    );
  };

  const handlePrintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please upload a PDF document first.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('copies', String(copies));
    formData.append('paperSize', paperSize);
    formData.append('orientation', orientation);

    addLog(
      'info',
      'UPLOAD',
      `Uploading "${file.name}" to cloud backend (${copies}x copies, ${paperSize}, ${orientation})...`
    );

    try {
      const res = await jobService.createJob(formData, (progress) => {
        setUploadProgress(progress);
        if (progress === 100) {
          addLog('info', 'UPLOAD', 'Upload transmission 100% complete. Waiting for server registration...');
        }
      });

      setActiveJob(res.job);
      addLog(
        'success',
        'DISPATCH',
        `Job registered on backend: #${res.job._id.slice(-6)} (Status: ${res.job.status}, Pages: ${res.preview?.pageCount || '?'})`
      );
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to submit print job';
      setError(errMsg);
      addLog('error', 'NET', `Print upload error: ${errMsg}`, err.response?.data);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setActiveJob(null);
    setUploadProgress(0);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatTime = (iso?: string) => {
    if (!iso) return 'Pending';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return 'Unknown';
    }
  };

  const operationalStatus: PrinterOperationalStatus = printer?.currentStatus || 'ONLINE';

  const getStatusLabel = (status: PrinterOperationalStatus) => {
    if (status === 'ONLINE' || status === 'IDLE' || status === 'UNKNOWN' || status === 'OFFLINE') {
      return 'READY TO PRINT';
    }
    if (status === 'PRINTING' || status === 'BUSY') {
      return 'PRINTING';
    }
    if (status === 'PAPER_OUT') {
      return 'PAPER OUT';
    }
    if (status === 'TONER_LOW') {
      return 'TONER LOW';
    }
    if (status === 'ERROR') {
      return 'ATTENTION REQUIRED';
    }
    return 'READY TO PRINT';
  };

  const getStatusBadgeClass = (status: PrinterOperationalStatus) => {
    if (status === 'ONLINE' || status === 'IDLE' || status === 'UNKNOWN' || status === 'OFFLINE') {
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    }
    if (status === 'PRINTING' || status === 'BUSY') {
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    }
    if (status === 'PAPER_OUT' || status === 'TONER_LOW') {
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    }
    if (status === 'ERROR') {
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    }
    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Target Printer Status Panel (Section F) */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-slate-800 text-brand-400 border border-slate-700">
              <PrinterIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">HP LaserJet Pro MFP M126nw</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusBadgeClass(operationalStatus)}`}>
                  {getStatusLabel(operationalStatus)}
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                <span className="flex items-center gap-1 text-slate-300">
                  <Radio className="h-3 w-3 text-brand-400" />
                  192.168.1.37:631 (Wi-Fi)
                </span>
                <span>&bull;</span>
                <span>PCLm 600 DPI</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-center">
            <div className="text-right text-[11px] font-mono text-slate-400 hidden sm:block">
              <div className="flex items-center gap-1 justify-end text-slate-300">
                <Clock className="h-3 w-3 text-slate-400" />
                <span>Ack: {formatTime(printer?.lastAcknowledgementAt)}</span>
              </div>
              <div className="text-slate-500">Every 10s Telemetry</div>
            </div>

            <button
              onClick={handleCheckNow}
              disabled={isChecking}
              title="Poll printer now"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin text-brand-400' : ''}`} />
              <span>Check Now</span>
            </button>
          </div>
        </div>

        {/* Hardware Alert Banner */}
        {printer?.lastError && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-semibold text-amber-200">Printer Notice:</div>
              <div>{printer.lastError}</div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {!activeJob ? (
        <form onSubmit={handlePrintSubmit} className="space-y-6">
          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-brand-400 bg-brand-500/10 scale-[1.01]'
                : file
                ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-slate-700 hover:border-brand-500 bg-slate-900/60 hover:bg-slate-900'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />

            {file ? (
              <div className="flex flex-col items-center">
                <div className="p-4 bg-emerald-500/15 text-emerald-400 rounded-2xl border border-emerald-500/30 mb-3 shadow-lg shadow-emerald-500/10">
                  <FileText className="h-10 w-10" />
                </div>
                <h4 className="text-lg font-bold text-white max-w-md truncate">{file.name}</h4>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  {(file.size / 1024 / 1024).toFixed(2)} MB &bull; Converted to 600 DPI PCLm for HP M126nw
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetForm();
                  }}
                  className="mt-4 text-xs font-semibold text-rose-400 hover:underline"
                >
                  Choose a different file
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="p-4 bg-slate-800 text-brand-400 rounded-2xl border border-slate-700 mb-3">
                  <FileUp className="h-10 w-10" />
                </div>
                <h4 className="text-base sm:text-lg font-semibold text-white">
                  Drop your PDF here, or <span className="text-brand-400">browse files</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Upload any PDF document. Directly transmitted across Wi-Fi to 192.168.1.37.
                </p>
              </div>
            )}
          </div>

          {/* Preferences Box */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-5">
            <h3 className="font-semibold text-xs uppercase tracking-wider text-slate-400">
              Print Settings
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Copies */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Copies
                </label>
                <div className="relative">
                  <Copy className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={copies}
                    onChange={(e) => setCopies(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Paper Size */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Paper Size
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaperSize('A4')}
                    className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                      paperSize === 'A4'
                        ? 'bg-brand-600 border-brand-500 text-white shadow-md shadow-brand-500/20'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    A4 (HP Default)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaperSize('Letter')}
                    className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                      paperSize === 'Letter'
                        ? 'bg-brand-600 border-brand-500 text-white shadow-md shadow-brand-500/20'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    Letter
                  </button>
                </div>
              </div>

              {/* Orientation */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Orientation
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {(['PORTRAIT', 'LANDSCAPE', 'AUTO'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setOrientation(mode)}
                      className={`py-2 text-[11px] font-semibold rounded-xl border capitalize transition-all ${
                        orientation === mode
                          ? 'bg-brand-600 border-brand-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      {mode.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Submit Bar */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Direct to 192.168.1.37 via Wi-Fi Interface
              </span>
              <button
                type="submit"
                disabled={!file || isSubmitting}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-xl shadow-brand-500/25 transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-95"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Uploading ({uploadProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Print Document Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      ) : (
        /* Live Execution Tracking Card (Section F) */
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Live Print Execution
                </span>
                {activeJob.printerIPPJobId && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-brand-300 font-mono text-xs border border-slate-700">
                    Printer Job #{activeJob.printerIPPJobId}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-bold text-white mt-1">{activeJob.documentName}</h3>
              <div className="text-xs text-slate-400 mt-1 font-mono">
                {activeJob.pageCount} page(s) &bull; {activeJob.copies} copy(ies) &bull; Target: 192.168.1.37
              </div>
            </div>
            <StatusBadge status={activeJob.status} />
          </div>

          {/* Stepper */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              {
                title: '1. Uploaded',
                desc: 'PDF uploaded',
                active: ['UPLOADING', 'UPLOADED', 'QUEUED', 'PROCESSING', 'SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
                done: ['QUEUED', 'PROCESSING', 'SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
              },
              {
                title: '2. 600 DPI PCLm',
                desc: 'Hardware raster render',
                active: ['PROCESSING', 'SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
                done: ['SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
              },
              {
                title: '3. Wi-Fi Transmission',
                desc: 'Sent to 192.168.1.37',
                active: ['SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
                done: ['PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
              },
              {
                title: '4. Physical Print',
                desc: 'Hardware output',
                active: ['PRINTING', 'COMPLETED'].includes(activeJob.status),
                done: activeJob.status === 'COMPLETED' && !!activeJob.completionVerified,
              },
            ].map((step, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border text-xs transition-all ${
                  step.done
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : step.active
                    ? 'bg-brand-500/10 border-brand-500/40 text-brand-300 animate-pulse'
                    : 'bg-slate-800/40 border-slate-700/40 text-slate-500'
                }`}
              >
                <div className="font-semibold text-white mb-0.5">{step.title}</div>
                <div>{step.desc}</div>
              </div>
            ))}
          </div>

          {/* Strict Verified Completion Banner (Section 8 & Rule 17.D) */}
          {activeJob.status === 'COMPLETED' && activeJob.completionVerified && (
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 flex items-start gap-3 shadow-lg shadow-emerald-500/10">
              <ShieldCheck className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm text-emerald-300">Physical Print Verified!</div>
                <div className="text-xs text-emerald-300/90 mt-0.5">
                  {activeJob.message || 'Printer reports that the document has finished printing.'}
                </div>
                {activeJob.verificationDetails?.evidence && (
                  <div className="text-[11px] font-mono text-emerald-400/80 mt-1">
                    Telemetry: {activeJob.verificationDetails.evidence}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Unverified Completion Limitation Banner (Rule 17.D) */}
          {activeJob.status === 'COMPLETED' && !activeJob.completionVerified && (
            <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-300 flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm text-amber-300">Spool Complete - Physical Output Unconfirmed</div>
                <div className="text-xs text-amber-200/90 mt-0.5">
                  {activeJob.message || 'Printer accepted job; physical completion could not be confirmed via telemetry.'}
                </div>
                <div className="text-[11px] text-amber-300/70 mt-1">
                  Please verify physical paper in the output tray.
                </div>
              </div>
            </div>
          )}

          {/* Print Job Failure */}
          {activeJob.status === 'FAILED' && (
            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-300 space-y-1.5">
              <div className="font-bold text-sm text-rose-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>Print Job Execution Failed</span>
              </div>
              <div className="text-xs font-mono text-rose-200">
                {activeJob.printerError || activeJob.errorMessage || 'Check printer connection'}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
            >
              Print Another Document
            </button>
            {onNavigateHistory && (
              <button
                onClick={onNavigateHistory}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand-400 hover:underline"
              >
                <span>View Print History</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Live Console & Debug Diagnostics Drawer */}
      <div className="pt-2">
        <DebugConsole
          logs={logs}
          onClear={() => setLogs([])}
          backendUrl={import.meta.env.VITE_API_URL || 'Local / Direct'}
          printerIp={printer?.lanIp || '192.168.1.37'}
        />
      </div>
    </div>
  );
};
