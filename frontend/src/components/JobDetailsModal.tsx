import React, { useState } from 'react';
import { Modal } from './Modal';
import { StatusBadge } from './StatusBadge';
import { PrintJob } from '../types';
import { jobService } from '../services/api';
import { RefreshCw, Ban, FileText, CheckCircle2, Clock, Printer, AlertTriangle } from 'lucide-react';

interface JobDetailsModalProps {
  job: PrintJob | null;
  isOpen: boolean;
  onClose: () => void;
  onJobUpdated?: () => void;
}

export const JobDetailsModal: React.FC<JobDetailsModalProps> = ({
  job,
  isOpen,
  onClose,
  onJobUpdated,
}) => {
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  if (!job) return null;

  const printer = typeof job.printerId === 'object' ? job.printerId : null;

  const handleRetry = async () => {
    setLoading(true);
    setActionError('');
    try {
      await jobService.retryJob(job._id);
      if (onJobUpdated) onJobUpdated();
      onClose();
    } catch (err: any) {
      setActionError(err.response?.data?.message || err.message || 'Retry failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    setActionError('');
    try {
      await jobService.cancelJob(job._id);
      if (onJobUpdated) onJobUpdated();
      onClose();
    } catch (err: any) {
      setActionError(err.response?.data?.message || err.message || 'Cancel failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Print Job Details" maxWidth="xl">
      <div className="space-y-6">
        {actionError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {actionError}
          </div>
        )}

        {/* Top Summary Card */}
        <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-brand-500/10 text-brand-400 rounded-xl border border-brand-500/20">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-white break-all">{job.documentName}</h4>
              <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                <span>{(job.fileSizeBytes / 1024).toFixed(1)} KB</span>
                <span>{job.pageCount} Pages</span>
                <span>{job.copies} {job.copies > 1 ? 'Copies' : 'Copy'}</span>
                <span>{job.paperSize}</span>
                <span>{job.orientation}</span>
              </div>
            </div>
          </div>
          <StatusBadge status={job.status} />
        </div>

        {/* Printer Target Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 flex items-center gap-2.5">
            <Printer className="h-4 w-4 text-slate-400" />
            <div>
              <div className="text-xs text-slate-400">Target Printer</div>
              <div className="font-medium text-white">{printer ? printer.name : 'Configured Printer'}</div>
              {printer && <div className="text-[11px] text-slate-400 font-mono">{printer.lanIp}</div>}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-slate-400" />
            <div>
              <div className="text-xs text-slate-400">Submitted At</div>
              <div className="font-medium text-white">{new Date(job.createdAt).toLocaleString()}</div>
              {job.printerJobId && (
                <div className="text-[11px] text-cyan-400 font-mono">IPP ID: #{job.printerJobId}</div>
              )}
            </div>
          </div>
        </div>

        {/* Error message card if failed */}
        {job.errorMessage && (
          <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300">
            <div className="font-semibold text-xs uppercase tracking-wider text-rose-400 mb-1 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Failure Reason
            </div>
            <div className="text-sm font-mono break-all">{job.errorMessage}</div>
          </div>
        )}

        {/* Physical Completion Verification Evidence (Section 10 requirement) */}
        {job.verificationDetails?.evidence && (
          <div className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-300">
            <div className="font-semibold text-xs uppercase tracking-wider text-emerald-400 mb-1 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Verification Evidence
            </div>
            <div className="text-sm">{job.verificationDetails.evidence}</div>
            {job.verificationDetails.verifiedAt && (
              <div className="text-xs text-emerald-400/70 mt-1">
                Verified at: {new Date(job.verificationDetails.verifiedAt).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Status History Timeline */}
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Lifecycle & Progress Timeline
          </h5>
          <div className="relative pl-6 space-y-4 border-l border-slate-700/80 ml-2">
            {job.statusHistory.map((item, idx) => (
              <div key={idx} className="relative">
                <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full bg-brand-500 border-2 border-slate-900 ring-2 ring-brand-500/20" />
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">{item.status}</span>
                  <span className="text-slate-500 font-mono">{new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
                {item.message && <p className="text-xs text-slate-400 mt-0.5">{item.message}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
          {(job.status === 'FAILED' || job.status === 'CANCELLED') && (
            <button
              onClick={handleRetry}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium text-sm transition-all shadow-md shadow-brand-600/30 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Retry Job
            </button>
          )}

          {['QUEUED', 'PROCESSING'].includes(job.status) && (
            <button
              onClick={handleCancel}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-medium text-sm transition-all disabled:opacity-50"
            >
              <Ban className="h-4 w-4" />
              Cancel Job
            </button>
          )}

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
