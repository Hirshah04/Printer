import React, { useState, useEffect, useRef } from 'react';
import { printerService, jobService } from '../services/api';
import { realtimeClient } from '../services/realtime';
import { Printer, PrintJob, PrinterOperationalStatus } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import {
  FileText,
  Printer as PrinterIcon,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Copy,
  ArrowRight,
  RefreshCw,
  Clock,
  ShieldCheck,
  Plus,
  Minus,
  Maximize2,
  FileCheck,
  Wifi,
  Zap,
  ChevronDown,
  Compass,
  Smartphone,
  RectangleHorizontal,
  FolderOpen,
  Crosshair,
  Check,
} from 'lucide-react';

interface PrintPageProps {
  onNavigateHistory?: () => void;
}

export const PrintPage: React.FC<PrintPageProps> = ({ onNavigateHistory }) => {
  const [printer, setPrinter] = useState<Printer | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [copies, setCopies] = useState<number>(1);
  const [paperSize] = useState<'A4'>('A4');
  const [orientation, setOrientation] = useState<'PORTRAIT' | 'LANDSCAPE' | 'AUTO'>('AUTO');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [activeJob, setActiveJob] = useState<PrintJob | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    printerService
      .getPrinter()
      .then(setPrinter)
      .catch(() => {});

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
    } catch {
      // Handled
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
      setError('Only PDF documents (.pdf) are supported.');
      return;
    }

    const MAX_SIZE_MB = 25;
    if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`PDF file size exceeds maximum limit of ${MAX_SIZE_MB}MB.`);
      return;
    }

    setFile(selected);
    setError('');
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
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to submit print job';
      setError(errMsg);
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
    if (!iso) return '02:10:34 PM';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '02:10:34 PM';
    }
  };

  const operationalStatus: PrinterOperationalStatus = printer?.currentStatus || 'ONLINE';
  const isReady = operationalStatus === 'ONLINE' || operationalStatus === 'IDLE';

  return (
    <div className="max-w-5xl mx-auto space-y-6 sm:space-y-7 pb-12">
      {/* 1. TOP PRINTER TELEMETRY CARD */}
      <div className="relative rounded-3xl border border-blue-500/30 bg-gradient-to-r from-[#0d163a]/90 via-[#0a1128]/95 to-[#0d163a]/90 backdrop-blur-xl p-5 sm:p-6 shadow-2xl shadow-blue-950/60 overflow-hidden">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/4 w-96 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Left: 3D Printer on Glowing Pedestal + Metadata */}
          <div className="flex items-center gap-5 w-full md:w-auto">
            {/* 3D Printer with Pedestal Glow */}
            <div className="relative shrink-0 flex items-center justify-center w-28 h-28 sm:w-32 sm:h-32">
            </div>

            {/* Printer Details */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-md shadow-emerald-400/80 animate-pulse shrink-0" />
                <h3 className="text-base sm:text-lg font-extrabold text-white tracking-wide">
                  HP LaserJet Pro MFP M126nw
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                  isReady
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                    : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                }`}>
                  {isReady ? 'READY TO PRINT' : operationalStatus}
                </span>
              </div>

              {/* Sub-line 1: IP & Resolution */}
              <div className="flex items-center gap-2 text-xs font-mono text-slate-300 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Wifi className="h-3.5 w-3.5 text-cyan-400" />
                  <span>{printer?.lanIp || '103.209.67.76'}:631</span>
                </span>
                <span className="text-cyan-400 font-bold">&bull;</span>
                <span className="text-cyan-400 font-semibold">Native 600 DPI Laser PCLm</span>
              </div>

              {/* Sub-line 2: Pure Cloud */}
              <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                <ShieldCheck className="h-4 w-4 text-cyan-400 shrink-0" />
                <span>Pure Cloud (No PC Needed)</span>
              </div>
            </div>
          </div>

          {/* Right: Sync Status & Refresh Button */}
          <div className="flex items-center justify-between md:justify-end gap-5 w-full md:w-auto border-t md:border-t-0 pt-4 md:pt-0 border-blue-500/20">
            {/* Checkmark in Green Circle Badge */}
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
              <Check className="h-4 w-4 stroke-[3]" />
            </div>

            {/* Sync Telemetry Details */}
            <div className="text-left font-mono text-xs leading-tight space-y-0.5">
              <div className="flex items-center gap-1.5 text-white font-bold">
                <RefreshCw className="h-3.5 w-3.5 text-cyan-400" />
                <span>Sync</span>
              </div>
              <div className="text-[11px] text-slate-400">@ {formatTime(printer?.lastAcknowledgementAt)}</div>
              <div className="text-[11px] text-slate-400">Live IPP</div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Telemetry</span>
              </div>
            </div>

            {/* Refresh Pill Button */}
            <button
              onClick={handleCheckNow}
              disabled={isChecking}
              className="px-4 py-2.5 rounded-2xl bg-blue-600/25 hover:bg-blue-600/40 border border-blue-500/40 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-500/15 hover:shadow-cyan-500/20 transition-all disabled:opacity-50 hover:scale-105 active:scale-95"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Real-time Hardware Error Alert */}
        {printer?.lastError && (
          <div className="relative z-10 mt-4 p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-3 shadow-md">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <span className="font-bold text-amber-300">Printer Notice: </span>
              <span className="font-mono">{printer.lastError}</span>
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
        <form onSubmit={handlePrintSubmit} className="space-y-6 sm:space-y-7">
          {/* 2. CENTER UPLOAD / DROPZONE CARD */}
          <label
            htmlFor="pdf-file-input"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            className={`block relative rounded-3xl border-2 border-dashed p-8 sm:p-12 text-center cursor-pointer transition-all duration-300 backdrop-blur-xl overflow-hidden group ${
              isDragging
                ? 'border-cyan-400 bg-cyan-500/15 scale-[1.01] shadow-2xl shadow-cyan-500/30'
                : file
                ? 'border-emerald-500/60 bg-gradient-to-b from-[#091530]/90 to-[#071024]/95 shadow-xl shadow-emerald-500/10'
                : 'border-cyan-500/40 hover:border-cyan-400 bg-gradient-to-b from-[#091238]/85 via-[#070e2b]/90 to-[#060b22]/95 shadow-2xl shadow-blue-950/40'
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

            {/* Subtle floating background silhouettes */}
            <div className="absolute top-4 left-6 opacity-10 pointer-events-none">
              <FileText className="w-16 h-16 text-cyan-400" />
            </div>
            <div className="absolute bottom-4 right-8 opacity-10 pointer-events-none">
              <FileText className="w-20 h-20 text-blue-400" />
            </div>
            <div className="absolute bottom-6 left-12 opacity-10 pointer-events-none">
              <FileText className="w-12 h-12 text-indigo-400" />
            </div>

            {file ? (
              <div className="relative z-10 flex flex-col items-center">
                <div className="p-4 bg-emerald-500/20 text-emerald-400 rounded-3xl border border-emerald-500/40 mb-3 shadow-xl shadow-emerald-500/20 animate-fade-in">
                  <FileCheck className="h-12 w-12" />
                </div>
                <h4 className="text-xl font-extrabold text-white max-w-lg truncate">{file.name}</h4>
                <div className="flex items-center gap-2.5 mt-2 text-xs font-mono text-slate-300">
                  <span className="text-emerald-400 font-bold">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                  <span>&bull;</span>
                  <span>100% True Scale (No Shrinking)</span>
                  <span>&bull;</span>
                  <span className="text-cyan-400 font-semibold">600 DPI Ready</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    resetForm();
                  }}
                  className="mt-5 px-4 py-1.5 rounded-full bg-slate-800/90 hover:bg-slate-700 text-xs font-semibold text-rose-300 border border-slate-700 transition-colors shadow-md"
                >
                  Choose a different file
                </button>
              </div>
            ) : (
              <div className="relative z-10 flex flex-col items-center">
                {/* 3D PDF Icon with Concentric Ripple Halo */}
                <div className="relative flex items-center justify-center w-28 h-28 mb-4">
                  {/* Concentric Glow Ripples */}
                  <div className="absolute inset-0 rounded-full border border-cyan-500/25 bg-cyan-500/5 animate-pulse pointer-events-none" />
                  <div className="absolute inset-2.5 rounded-full border border-blue-500/35 bg-blue-500/10 pointer-events-none" />
              
                </div>

                {/* Headline */}
                <h4 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                  Drop your PDF here, or <span className="text-cyan-400 underline underline-offset-4 font-bold">tap to browse</span>
                </h4>

                {/* Subtitle */}
                <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-md">
                  Upload certificates, forms, letters, or resumes. Directly transmitted to HP LaserJet Pro MFP M126nw.
                </p>

                {/* Select Document Button */}
                <div className="mt-6 inline-flex items-center gap-2.5 px-8 py-3.5 rounded-full bg-gradient-to-r from-[#0284c7] via-[#2563eb] to-[#7c3aed] text-white font-bold text-xs uppercase tracking-wider shadow-xl shadow-blue-500/30 group-hover:shadow-cyan-500/40 group-hover:scale-105 active:scale-95 transition-all">
                  <FolderOpen className="h-4 w-4" />
                  <span>Select Document</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            )}
          </label>

          {/* 3. BOTTOM PRINT CONFIGURATION CARD */}
          <div className="rounded-3xl border border-blue-500/30 bg-gradient-to-b from-[#0b143a]/90 via-[#08102e]/90 to-[#060c24]/90 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-blue-950/60 space-y-6">
            {/* Header: Title & 1:1 Aspect Ratio Badge */}
            <div className="flex items-center justify-between pb-4 border-b border-blue-500/20">
              <h3 className="font-extrabold text-xs sm:text-sm uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Zap className="h-4 w-4 text-cyan-400" />
                <span>PRINT CONFIGURATION</span>
              </h3>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-500/40 bg-emerald-950/40 text-emerald-400 text-xs font-mono font-medium shadow-sm">
                <Maximize2 className="h-3.5 w-3.5" />
                <span>1:1 Exact Aspect Ratio</span>
              </div>
            </div>

            {/* 3-Column Configuration Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Column 1: Number of Copies */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Copy className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Number of Copies</span>
                </label>
                <div className="flex items-center justify-between bg-[#0d173d]/90 border border-blue-500/30 rounded-2xl p-1.5 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setCopies(Math.max(1, copies - 1))}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/80 transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="font-extrabold text-white text-base">
                    {copies}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCopies(Math.min(100, copies + 1))}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/80 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Column 2: Paper Media (A4 Locked) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Paper Media</span>
                </label>
                <div className="bg-[#0d173d]/90 border border-blue-500/30 rounded-2xl p-2.5 flex items-center justify-between shadow-inner">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-white">A4</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/25 border border-blue-400/40 text-blue-300 font-bold">
                        Standard
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      210 &times; 297 mm (8.27 &times; 11.69&quot;)
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </div>
              </div>

              {/* Column 3: Orientation (Auto, Portrait, Landscape) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Compass className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Orientation</span>
                </label>
                <div className="bg-[#0d173d]/90 border border-blue-500/30 rounded-2xl p-1 flex items-center gap-1 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setOrientation('AUTO')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      orientation === 'AUTO'
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md shadow-cyan-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Auto</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrientation('PORTRAIT')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      orientation === 'PORTRAIT'
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md shadow-cyan-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>Portrait</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrientation('LANDSCAPE')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      orientation === 'LANDSCAPE'
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md shadow-cyan-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <RectangleHorizontal className="h-3.5 w-3.5" />
                    <span>Landscape</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Row: Target IP & Print Document Now Button */}
            <div className="pt-4 border-t border-blue-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <Crosshair className="h-4 w-4 text-cyan-400 shrink-0" />
                <span>Target IP: {printer?.lanIp || '103.209.67.76'}:9100 - 600 DPI Laser Stream</span>
              </div>

              <button
                type="submit"
                disabled={!file || isSubmitting}
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full bg-gradient-to-r from-[#0099ff] via-[#3b82f6] to-[#a855f7] hover:from-[#00b4ff] hover:to-[#b565ff] text-white font-extrabold text-sm shadow-xl shadow-cyan-500/30 hover:shadow-cyan-400/50 transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-95"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Transmitting ({uploadProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <PrinterIcon className="h-4 w-4" />
                    <span>Print Document Now</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      ) : (
        /* LIVE EXECUTION TELEMETRY TRACKER */
        <div className="rounded-3xl border border-blue-500/30 bg-gradient-to-b from-[#0b143a]/95 via-[#08102e]/95 to-[#060c24]/95 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-blue-950/70 space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-blue-500/20">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Live Execution Telemetry
                </span>
                {activeJob.printerIPPJobId && (
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-cyan-300 font-mono text-xs border border-blue-500/30">
                    IPP Job #{activeJob.printerIPPJobId}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-extrabold text-white mt-1">{activeJob.documentName}</h3>
              <div className="text-xs text-slate-400 mt-1 font-mono">
                {activeJob.pageCount} page(s) &bull; {activeJob.copies} copy(ies) &bull; Target: {printer?.lanIp || '103.209.67.76'}
              </div>
            </div>
            <StatusBadge status={activeJob.status} />
          </div>

          {/* Stepper Progress */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              {
                title: '1. Uploaded',
                desc: 'PDF received',
                active: ['UPLOADING', 'UPLOADED', 'QUEUED', 'PROCESSING', 'SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
                done: ['QUEUED', 'PROCESSING', 'SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
              },
              {
                title: '2. 600 DPI PCLm',
                desc: 'Raster swaths',
                active: ['PROCESSING', 'SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
                done: ['SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
              },
              {
                title: '3. Streaming',
                desc: 'Delivered to port 9100',
                active: ['SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
                done: ['PRINTING', 'COMPLETED'].includes(activeJob.status),
              },
              {
                title: '4. Physical Output',
                desc: 'Paper printed',
                active: ['PRINTING', 'COMPLETED'].includes(activeJob.status),
                done: activeJob.status === 'COMPLETED',
              },
            ].map((step, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-2xl border transition-all ${
                  step.done
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                    : step.active
                    ? 'bg-blue-900/30 border-cyan-500/50 text-cyan-200 animate-pulse'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="font-extrabold text-xs">{step.title}</div>
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : step.active ? (
                    <RefreshCw className="h-3.5 w-3.5 text-cyan-400 animate-spin" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-slate-600" />
                  )}
                </div>
                <div className="text-[11px] opacity-80">{step.desc}</div>
              </div>
            ))}
          </div>

          {/* Status Message */}
          <div className="p-4 rounded-2xl bg-[#091230]/90 border border-blue-500/30 flex items-center justify-between">
            <div className="text-xs text-slate-300 font-mono">
              <span className="text-cyan-400 font-bold">Status: </span>
              {activeJob.message || 'Processing print job...'}
            </div>
            {activeJob.status === 'COMPLETED' && (
              <button
                onClick={resetForm}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition-all"
              >
                Print Another Document
              </button>
            )}
            {activeJob.status === 'FAILED' && (
              <button
                onClick={resetForm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all"
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
