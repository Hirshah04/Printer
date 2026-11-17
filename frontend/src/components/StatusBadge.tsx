import React from 'react';
import { PrintJobStatus } from '../types';

interface StatusBadgeProps {
  status: PrintJobStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-semibold';

  switch (status) {
    case 'COMPLETED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 ${sizeClasses}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
          Completed
        </span>
      );
    case 'PRINTING':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 ${sizeClasses}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping"></span>
          Printing...
        </span>
      );
    case 'PRINTER_ACCEPTED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 ${sizeClasses}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
          Printer Accepted
        </span>
      );
    case 'SENT_TO_PRINTER':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 ${sizeClasses}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400"></span>
          Sent to Printer
        </span>
      );
    case 'PROCESSING':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 ${sizeClasses}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse"></span>
          Processing (Converting)
        </span>
      );
    case 'QUEUED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 ${sizeClasses}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400"></span>
          Queued
        </span>
      );
    case 'UPLOADING':
    case 'UPLOADED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 text-slate-300 border border-slate-500/30 ${sizeClasses}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
          Uploaded
        </span>
      );
    case 'FAILED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 ${sizeClasses}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400"></span>
          Failed
        </span>
      );
    case 'CANCELLED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-600/30 ${sizeClasses}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-slate-500"></span>
          Cancelled
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-600/30 ${sizeClasses}`}>
          {status}
        </span>
      );
  }
};
