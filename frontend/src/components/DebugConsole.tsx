import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Copy,
  Check,
  Trash2,
  ChevronUp,
  ChevronDown,
  Radio,
  Wifi,
  FileUp,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export interface ConsoleLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'network' | 'printer';
  category: 'NET' | 'UPLOAD' | 'DISPATCH' | 'PRINTER' | 'WORKER' | 'SYSTEM';
  message: string;
  details?: any;
}

interface DebugConsoleProps {
  logs: ConsoleLogEntry[];
  onClear: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
  backendUrl?: string;
  printerIp?: string;
}

export const DebugConsole: React.FC<DebugConsoleProps> = ({
  logs,
  onClear,
  isOpen: controlledIsOpen,
  onToggle: controlledOnToggle,
  backendUrl = import.meta.env.VITE_API_URL || 'Local / Direct',
  printerIp = '192.168.1.37',
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const toggleOpen = controlledOnToggle || (() => setInternalIsOpen((prev) => !prev));

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isOpen && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const handleCopyLogs = async () => {
    const formatted = logs
      .map((l) => `[${l.timestamp}] [${l.category}] [${l.level.toUpperCase()}]: ${l.message}${l.details ? ' ' + JSON.stringify(l.details) : ''}`)
      .join('\n');

    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const getBadgeStyle = (category: string, level: string) => {
    if (level === 'error') return 'bg-rose-950/60 text-rose-300 border-rose-600/40';
    if (level === 'success') return 'bg-emerald-950/60 text-emerald-300 border-emerald-600/40';
    if (level === 'warn') return 'bg-amber-950/60 text-amber-300 border-amber-600/40';

    switch (category) {
      case 'NET':
        return 'bg-blue-950/60 text-blue-300 border-blue-600/40';
      case 'UPLOAD':
        return 'bg-purple-950/60 text-purple-300 border-purple-600/40';
      case 'PRINTER':
        return 'bg-cyan-950/60 text-cyan-300 border-cyan-600/40';
      case 'DISPATCH':
        return 'bg-indigo-950/60 text-indigo-300 border-indigo-600/40';
      case 'WORKER':
        return 'bg-teal-950/60 text-teal-300 border-teal-600/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const errorCount = logs.filter((l) => l.level === 'error').length;

  return (
    <div className="w-full rounded-2xl bg-slate-950/95 border border-slate-800 shadow-2xl overflow-hidden backdrop-blur-md">
      {/* Console Header Bar */}
      <div
        onClick={toggleOpen}
        className="px-4 py-3 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between cursor-pointer select-none hover:bg-slate-900 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <Terminal className="h-4 w-4 text-brand-400" />
            <span className="text-xs font-mono font-bold text-slate-200">
              Live Console & Diagnostics
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-slate-300">
              {logs.length} logs
            </span>
            {errorCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/50 text-[10px] font-mono text-rose-300 font-bold">
                {errorCount} error{errorCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleCopyLogs}
            title="Copy all console logs to clipboard"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-[11px] font-mono transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 text-slate-400" />
                <span>Copy Logs</span>
              </>
            )}
          </button>

          <button
            onClick={onClear}
            title="Clear console entries"
            className="p-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-rose-300 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={toggleOpen}
            className="p-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-400 transition-colors"
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Quick Diagnostics Meta Header */}
      {isOpen && (
        <div className="px-4 py-2 bg-slate-900/40 border-b border-slate-800/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <Radio className="h-3 w-3 text-brand-400" />
            <span className="text-slate-500">Cloud API:</span>
            <span className="text-slate-200 truncate max-w-[200px]" title={backendUrl}>{backendUrl}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Wifi className="h-3 w-3 text-emerald-400" />
            <span className="text-slate-500">Target Printer:</span>
            <span className="text-slate-200">{printerIp}:9100 / 631</span>
          </div>
        </div>
      )}

      {/* Console Scrollable Window */}
      {isOpen && (
        <div
          ref={logContainerRef}
          className="p-3 max-h-64 sm:max-h-72 overflow-y-auto space-y-1 font-mono text-[11px] select-text"
        >
          {logs.length === 0 ? (
            <div className="py-6 text-center text-slate-500 italic">
              No console logs recorded yet. Upload a PDF or interact with the printer to capture live telemetry.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 py-0.5 px-1.5 rounded hover:bg-slate-900/60 transition-colors"
              >
                <span className="text-slate-500 shrink-0 select-none">{log.timestamp}</span>

                <span
                  className={`px-1.5 py-0.2 rounded border text-[9px] font-bold uppercase shrink-0 ${getBadgeStyle(
                    log.category,
                    log.level
                  )}`}
                >
                  {log.category}
                </span>

                <span
                  className={`break-all leading-relaxed ${
                    log.level === 'error'
                      ? 'text-rose-300 font-semibold'
                      : log.level === 'success'
                      ? 'text-emerald-300'
                      : log.level === 'warn'
                      ? 'text-amber-300'
                      : 'text-slate-300'
                  }`}
                >
                  {log.message}
                </span>

                {log.details && (
                  <pre className="mt-0.5 ml-2 p-1 rounded bg-black/40 text-[10px] text-slate-400 overflow-x-auto block">
                    {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
