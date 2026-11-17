import React, { useState, useEffect, useRef } from 'react';
import { printerService, jobService } from '../services/api';
import { Printer, PrintJob } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import {
  FileUp,
  FileText,
  Printer as PrinterIcon,
  CheckCircle2,
  AlertCircle,
  Copy,
  Layers,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

interface PrintPageProps {
  onJobCreated?: (job: PrintJob) => void;
  onNavigateHistory?: () => void;
}

export const PrintPage: React.FC<PrintPageProps> = ({ onJobCreated, onNavigateHistory }) => {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [copies, setCopies] = useState<number>(1);
  const [paperSize, setPaperSize] = useState<'A4' | 'Letter'>('A4');
  const [orientation, setOrientation] = useState<'PORTRAIT' | 'LANDSCAPE' | 'AUTO'>('PORTRAIT');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [activeJob, setActiveJob] = useState<PrintJob | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    printerService.getPrinters().then((list) => {
      setPrinters(list);
      const def = list.find((p) => p.isDefault) || list[0];
      if (def) setSelectedPrinterId(def._id);
    });
  }, []);

  // Poll active job status if tracking
  useEffect(() => {
    if (!activeJob || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(activeJob.status)) return;

    const interval = setInterval(async () => {
      try {
        const updated = await jobService.getJobById(activeJob._id);
        setActiveJob(updated);
      } catch {
        // Continue polling
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeJob]);

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
    if (selected.type !== 'application/pdf' && !selected.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF documents are supported for printing.');
      return;
    }
    if (selected.size > 25 * 1024 * 1024) {
      setError('File size exceeds the 25MB maximum limit.');
      return;
    }
    setFile(selected);
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
    formData.append('printerId', selectedPrinterId);
    formData.append('copies', String(copies));
    formData.append('paperSize', paperSize);
    formData.append('orientation', orientation);

    try {
      const res = await jobService.createJob(formData, (progress) => {
        setUploadProgress(progress);
      });

      setActiveJob(res.job);
      if (onJobCreated) onJobCreated(res.job);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to submit print job');
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

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileUp className="h-6 w-6 text-brand-400" />
          Print PDF Document
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Securely submit your PDF across the internet to your private network printer
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Print Form or Active Job Stepper */}
      {!activeJob ? (
        <form onSubmit={handlePrintSubmit} className="space-y-6">
          {/* Drag & Drop Upload Box */}
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
                  {(file.size / 1024 / 1024).toFixed(2)} MB &bull; Ready for PCLm Conversion
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
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Supports standard PDF documents up to 25MB. Target paper format: A4.
                </p>
              </div>
            )}
          </div>

          {/* Print Options Card */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-400">
              Print Job Preferences
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Target Printer */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Target Printer
                </label>
                <div className="relative">
                  <PrinterIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <select
                    value={selectedPrinterId}
                    onChange={(e) => setSelectedPrinterId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-brand-500 focus:outline-none appearance-none"
                  >
                    {printers.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} ({p.lanIp}) - {p.connectionStatus}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Number of Copies */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Number of Copies
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
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaperSize('A4')}
                    className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                      paperSize === 'A4'
                        ? 'bg-brand-600 border-brand-500 text-white shadow-md shadow-brand-500/20'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    A4 (210 x 297 mm)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaperSize('Letter')}
                    className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                      paperSize === 'Letter'
                        ? 'bg-brand-600 border-brand-500 text-white shadow-md shadow-brand-500/20'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    Letter (8.5 x 11 in)
                  </button>
                </div>
              </div>

              {/* Orientation */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Orientation
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['PORTRAIT', 'LANDSCAPE', 'AUTO'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setOrientation(mode)}
                      className={`py-2 text-xs font-semibold rounded-xl border capitalize transition-all ${
                        orientation === mode
                          ? 'bg-brand-600 border-brand-500 text-white shadow-md shadow-brand-500/20'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                      }`}
                    >
                      {mode.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                PCLm conversion & IPP protocol handled automatically.
              </div>
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
        /* Live Execution Tracking Card */
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Live Print Job Monitor
              </span>
              <h3 className="text-xl font-bold text-white mt-1">{activeJob.documentName}</h3>
              <div className="text-xs text-slate-400 mt-1">
                {activeJob.pageCount} page(s) &bull; {activeJob.copies} copy(ies) &bull; {activeJob.paperSize}
              </div>
            </div>
            <StatusBadge status={activeJob.status} />
          </div>

          {/* Interactive Stepper */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              {
                title: '1. Cloud Storage',
                desc: 'PDF uploaded & encrypted',
                active: ['UPLOADING', 'UPLOADED', 'QUEUED', 'PROCESSING', 'SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
                done: ['QUEUED', 'PROCESSING', 'SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
              },
              {
                title: '2. PCLm Conversion',
                desc: 'Worker rendering raster',
                active: ['PROCESSING', 'SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
                done: ['SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
              },
              {
                title: '3. VPN to Router',
                desc: 'Tunneling to printer IP',
                active: ['SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
                done: ['PRINTER_ACCEPTED', 'PRINTING', 'COMPLETED'].includes(activeJob.status),
              },
              {
                title: '4. Physical Print',
                desc: 'Job accepted by LaserJet',
                active: ['PRINTING', 'COMPLETED'].includes(activeJob.status),
                done: activeJob.status === 'COMPLETED',
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

          {/* Verification Box */}
          {activeJob.status === 'COMPLETED' && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
              <div>
                <div className="font-bold text-sm">Physical Print Verified!</div>
                <div className="text-xs text-emerald-300/80">
                  {activeJob.verificationDetails?.evidence || 'Document successfully spooled and confirmed by printer hardware.'}
                </div>
              </div>
            </div>
          )}

          {activeJob.status === 'FAILED' && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300">
              <div className="font-bold text-sm text-rose-400 mb-1">Print Job Failed</div>
              <div className="text-xs font-mono">{activeJob.errorMessage || 'Unknown error occurred'}</div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
            >
              Print Another Document
            </button>
            {onNavigateHistory && (
              <button
                onClick={onNavigateHistory}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand-400 hover:underline"
              >
                <span>View Full Print History</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
