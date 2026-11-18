import React, { useState, useEffect, useRef } from 'react';
import { printerService, jobService } from '../services/api';
import { realtimeClient } from '../services/realtime';
import { Printer, PrintJob, PrinterOperationalStatus } from '../types';
import { StatusBadge } from '../components/StatusBadge';
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
  Plus,
  Minus,
  Maximize2,
  FileCheck,
  Wifi,
  Server,
  Zap,
} from 'lucide-react';

interface PrintPageProps {
  onNavigateHistory?: () => void;
}

export const PrintPage: React.FC<PrintPageProps> = ({ onNavigateHistory }) => {
  const [printer, setPrinter] = useState<Printer | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [copies, setCopies] = useState<number>(1);
  const [paperSize, setPaperSize] = useState<'A4' | 'Letter'>('A4');
  const [orientation, setOrientation] = useState<'PORTRAIT' | 'LANDSCAPE' | 'AUTO'>('AUTO');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [activeJob, setActiveJob] = useState<PrintJob | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (
    level: 'info' | 'success' | 'warn' | 'error',
    category: string,
    message: string,
    details?: any
  ) => {
    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const tag = `[${time}] [AirPrint Hub][${category}]`;

    if (level === 'error') {
      console.error(`%c${tag} ${message}`, 'color: #f43f5e; font-weight: bold;', details || '');
    } else if (level === 'warn') {
      console.warn(`%c${tag} ${message}`, 'color: #f59e0b; font-weight: bold;', details || '');
    } else if (level === 'success') {
      console.info(`%c${tag} ${message}`, 'color: #10b981; font-weight: bold;', details || '');
    } else {
      console.log(`%c${tag} ${message}`, 'color: #38bdf8;', details || '');
    }
  };

  useEffect(() => {
    printerService
      .getPrinter()
      .then((p) => {
        setPrinter(p);
      })
      .catch((err) => {
        addLog('warn', 'NET', `Could not fetch initial printer info: ${err.message}`);
      });

    const unsubPrinter = realtimeClient.onPrinter((updated) => {
      setPrinter(updated);
    });

    const unsubJob = realtimeClient.onJob((updatedJob) => {
      setActiveJob((prev) => {
        if (!prev || prev._id === updatedJob._id) {
          return updatedJob;
        }
        return prev;
      });
    });

    return () => {
      unsubPrinter();
      unsubJob();
    };
  }, []);

  const handleCheckNow = async () => {
    setIsChecking(true);
    try {
      const updated = await printerService.checkNow();
      setPrinter(updated);
      addLog('success', 'PRINTER', `Telemetry received: ${updated.currentStatus}`);
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
    const name = (selected.name || '').toLowerCase();
    const type = (selected.type || '').toLowerCase();
    const isPdf = type.includes('pdf') || name.endsWith('.pdf') || type === '' || type.includes('octet-stream');

    if (!isPdf && name.includes('.') && !name.endsWith('.pdf')) {
      const msg = 'Only PDF documents (.pdf) are supported.';
      setError(msg);
      return;
    }

    const MAX_SIZE_MB = 25;
    if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
      const msg = `PDF file size exceeds maximum limit of ${MAX_SIZE_MB}MB.`;
      setError(msg);
      return;
    }

    setFile(selected);
    setError('');
    addLog('info', 'UPLOAD', `Selected document: ${selected.name} (${(selected.size / 1024).toFixed(1)} KB)`);
  };

  const handlePrintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select or drop a PDF file first.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('copies', String(copies));
    formData.append('paperSize', paperSize);
    formData.append('orientation', orientation);

    try {
      const res = await jobService.createJob(formData, (progress) => {
        setUploadProgress(progress);
      });

      setActiveJob(res.job);
      addLog('success', 'DISPATCH', `Job registered: #${res.job._id.slice(-6)} (Status: ${res.job.status})`);
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to submit print job';
      setError(errMsg);
      addLog('error', 'NET', `Print upload error: ${errMsg}`);
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
    if (!iso) return 'Just now';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return 'Just now';
    }
  };

  const operationalStatus: PrinterOperationalStatus = printer?.currentStatus || 'ONLINE';

  const getStatusBadge = (status: PrinterOperationalStatus) => {
    if (status === 'PRINTING' || status === 'BUSY') {
      return {
        label: 'PRINTING',
        dot: 'bg-blue-400 animate-ping',
        classes: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      };
    }
    if (status === 'PAPER_OUT') {
      return {
        label: 'OUT OF PAPER',
        dot: 'bg-amber-400',
        classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      };
    }
    if (status === 'TONER_LOW') {
      return {
        label: 'TONER LOW',
        dot: 'bg-amber-400',
        classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      };
    }
    if (status === 'ERROR') {
      return {
        label: 'PRINTER ERROR',
        dot: 'bg-rose-400',
        classes: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      };
    }
    if (status === 'OFFLINE') {
      return {
        label: 'OFFLINE',
        dot: 'bg-slate-400',
        classes: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
      };
    }
    return {
      label: 'READY TO PRINT',
      dot: 'bg-emerald-400',
      classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    };
  };

  const currentBadge = getStatusBadge(operationalStatus);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Target Printer Real-Time Hardware Status Widget */}
      <div className="relative overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-slate-950/95 border border-slate-800/80 shadow-2xl backdrop-blur-xl space-y-4">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="relative p-3 rounded-2xl bg-gradient-to-tr from-brand-600/20 to-indigo-600/20 border border-brand-500/30 text-brand-400 shadow-lg shadow-brand-500/10">
              <PrinterIcon className="h-6 w-6" />
              <span className={`absolute -top-1 -right-1 h-3 w-3 rounded-full ${currentBadge.dot}`} />
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="font-bold text-white text-base sm:text-lg tracking-tight">
                  HP LaserJet Pro MFP M126nw
                </h3>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${currentBadge.classes}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${currentBadge.dot}`} />
                  {currentBadge.label}
                </span>
              </div>

              <div className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1 text-slate-300">
                  <Wifi className="h-3 w-3 text-brand-400" />
                  {printer?.lanIp || '103.209.67.76'}:631
                </span>
                <span className="text-slate-600">&bull;</span>
                <span className="text-emerald-400 font-medium">Native 300 DPI Laser PCLm</span>
                <span className="text-slate-600">&bull;</span>
                <span className="text-slate-400">Pure Cloud (No PC Needed)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <div className="text-right text-[11px] font-mono text-slate-400 hidden sm:block">
              <div className="flex items-center gap-1 justify-end text-slate-300">
                <Clock className="h-3 w-3 text-slate-400" />
                <span>Sync: {formatTime(printer?.lastAcknowledgementAt)}</span>
              </div>
              <div className="text-slate-500">Live IPP Telemetry</div>
            </div>

            <button
              onClick={handleCheckNow}
              disabled={isChecking}
              title="Refresh printer telemetry now"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700/80 transition-all shadow-sm disabled:opacity-50 hover:scale-105 active:scale-95"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin text-brand-400' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Real-time Hardware Error / Notice Banner */}
        {printer?.lastError && (
          <div className="relative z-10 p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-3 shadow-md">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-amber-300 text-sm">Printer Status Alert:</div>
              <div className="font-mono">{printer.lastError}</div>
              <div className="text-amber-400/80 text-[11px]">
                The system monitors hardware telemetry before and after printing to guarantee physical output.
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-sm flex items-center gap-3 shadow-lg">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {!activeJob ? (
        <form onSubmit={handlePrintSubmit} className="space-y-6">
          {/* Mobile-Friendly Drag & Drop / Tap Upload Zone */}
          <label
            htmlFor="pdf-file-input"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            className={`block relative border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-300 ${
              isDragging
                ? 'border-brand-400 bg-brand-500/10 scale-[1.01]'
                : file
                ? 'border-emerald-500/50 bg-emerald-500/5 shadow-lg shadow-emerald-500/5'
                : 'border-slate-800 hover:border-brand-500/60 bg-slate-900/50 hover:bg-slate-900/80'
            }`}
          >
            <input
              id="pdf-file-input"
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileSelect}
              className="sr-only"
            />

            {file ? (
              <div className="flex flex-col items-center">
                <div className="p-4 bg-gradient-to-tr from-emerald-600/20 to-teal-600/20 text-emerald-400 rounded-2xl border border-emerald-500/40 mb-3 shadow-lg shadow-emerald-500/10 animate-fade-in">
                  <FileCheck className="h-10 w-10" />
                </div>
                <h4 className="text-lg font-bold text-white max-w-md truncate">{file.name}</h4>
                <div className="flex items-center gap-2 mt-1.5 text-xs font-mono text-slate-400">
                  <span className="text-emerald-400 font-semibold">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                  <span>&bull;</span>
                  <span>100% True Scale (No Shrinking)</span>
                  <span>&bull;</span>
                  <span>300 DPI Laser Ready</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    resetForm();
                  }}
                  className="mt-4 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-rose-300 border border-slate-700 transition-colors"
                >
                  Choose a different file
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="p-4 bg-slate-800/80 text-brand-400 rounded-2xl border border-slate-700/80 mb-3 group-hover:scale-105 transition-transform">
                  <FileUp className="h-10 w-10" />
                </div>
                <h4 className="text-base sm:text-lg font-semibold text-white">
                  Drop your PDF here, or <span className="text-brand-400 underline underline-offset-4">tap to browse</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1.5 max-w-sm">
                  Upload certificates, forms, letters, or resumes. Directly transmitted to HP LaserJet Pro MFP M126nw.
                </p>
                <div className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-medium text-xs shadow-md shadow-brand-500/20">
                  <FileUp className="h-4 w-4" />
                  <span>Select Document</span>
                </div>
              </div>
            )}
          </label>

          {/* Print Preferences Box */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800/90 shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-brand-400" />
                <span>Print Configuration</span>
              </h3>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                1:1 Exact Aspect Ratio
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {/* Copies Stepper */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Number of Copies
                </label>
                <div className="flex items-center bg-slate-800/90 border border-slate-700/90 rounded-2xl p-1">
                  <button
                    type="button"
                    onClick={() => setCopies(Math.max(1, copies - 1))}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/80 transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full bg-transparent text-center font-bold text-white text-sm focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setCopies(Math.min(100, copies + 1))}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/80 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Paper Size */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Paper Media
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaperSize('A4')}
                    className={`p-2.5 rounded-2xl border text-left transition-all ${
                      paperSize === 'A4'
                        ? 'bg-brand-600/20 border-brand-500 text-white shadow-md shadow-brand-500/15'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold">A4</div>
                    <div className="text-[10px] text-slate-400 font-mono">210 × 297 mm</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaperSize('Letter')}
                    className={`p-2.5 rounded-2xl border text-left transition-all ${
                      paperSize === 'Letter'
                        ? 'bg-brand-600/20 border-brand-500 text-white shadow-md shadow-brand-500/15'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold">Letter</div>
                    <div className="text-[10px] text-slate-400 font-mono">8.5 × 11 in</div>
                  </button>
                </div>
              </div>

              {/* Orientation */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Orientation
                </label>
                <div className="grid grid-cols-3 gap-1.5 bg-slate-800/60 p-1 rounded-2xl border border-slate-700/60">
                  {(['AUTO', 'PORTRAIT', 'LANDSCAPE'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setOrientation(mode)}
                      className={`py-2 text-[11px] font-bold rounded-xl capitalize transition-all ${
                        orientation === mode
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mode.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Submit Bar */}
            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-brand-400 animate-pulse" />
                <span>Target IP: {printer?.lanIp || '103.209.67.76'}:631 &bull; 300 DPI Laser Stream</span>
              </div>

              <button
                type="submit"
                disabled={!file || isSubmitting}
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-brand-600 via-indigo-600 to-violet-600 hover:from-brand-500 hover:to-violet-500 text-white font-bold text-sm shadow-xl shadow-brand-500/25 transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-95"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Transmitting ({uploadProgress}%)...</span>
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
        /* Live Execution Tracking Card */
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/95 border border-slate-800 shadow-2xl space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Live Execution Telemetry
                </span>
                {activeJob.printerIPPJobId && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-brand-300 font-mono text-xs border border-slate-700">
                    IPP Job #{activeJob.printerIPPJobId}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-bold text-white mt-1">{activeJob.documentName}</h3>
              <div className="text-xs text-slate-400 mt-1 font-mono">
                {activeJob.pageCount} page(s) &bull; {activeJob.copies} copy(ies) &bull; Target: {printer?.lanIp || '103.209.67.76'}
              </div>
            </div>
            <StatusBadge status={activeJob.status} />
          </div>

          {/* Stepper */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              {
                title: '1. Uploaded',
                desc: 'PDF received',
                active: ['UPLOADING', 'UPLOADED', 'QUEUED', 'PROCESSING', 'SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
                done: ['QUEUED', 'PROCESSING', 'SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
              },
              {
                title: '2. 300 DPI PCLm',
                desc: 'Fast raster render',
                active: ['PROCESSING', 'SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
                done: ['SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
              },
              {
                title: '3. Transmission',
                desc: `Sent to ${printer?.lanIp || '103.209.67.76'}`,
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
                className={`p-4 rounded-2xl border text-xs transition-all ${
                  step.done
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : step.active
                    ? 'bg-brand-500/15 border-brand-500/50 text-brand-300 shadow-md shadow-brand-500/10'
                    : 'bg-slate-800/40 border-slate-700/40 text-slate-500'
                }`}
              >
                <div className="font-bold text-white mb-0.5">{step.title}</div>
                <div>{step.desc}</div>
              </div>
            ))}
          </div>

          {/* Strict Verified Completion Banner */}
          {activeJob.status === 'COMPLETED' && activeJob.completionVerified && (
            <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-teal-950/40 border border-emerald-500/50 text-emerald-300 flex items-start gap-4 shadow-xl shadow-emerald-500/10">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <div className="font-bold text-base text-emerald-300">Physical Print Successfully Verified!</div>
                <div className="text-xs text-emerald-200">
                  {activeJob.message || 'Printer reports that the document has finished printing.'}
                </div>
                {activeJob.verificationDetails?.evidence && (
                  <div className="text-[11px] font-mono text-emerald-400/80 mt-1">
                    Telemetry Confirmation: {activeJob.verificationDetails.evidence}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Real-time Hardware Error from Printer */}
          {activeJob.status === 'FAILED' && (
            <div className="p-5 rounded-2xl bg-rose-950/60 border border-rose-500/50 text-rose-200 space-y-2 shadow-xl shadow-rose-500/10">
              <div className="font-bold text-base text-rose-400 flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                <span>Printer Error Received</span>
              </div>
              <div className="text-sm font-mono text-rose-100 bg-rose-900/30 p-3 rounded-xl border border-rose-500/30">
                {activeJob.printerError || activeJob.errorMessage || 'Unknown hardware failure'}
              </div>
              <div className="text-xs text-rose-300/80">
                Please check the printer control panel or resolve the alert above, then retry.
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={resetForm}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors shadow-sm"
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
    </div>
  );
};
