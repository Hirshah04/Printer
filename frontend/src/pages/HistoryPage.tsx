import React, { useState, useEffect } from 'react';
import { jobService } from '../services/api';
import { PrintJob } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { JobDetailsModal } from '../components/JobDetailsModal';
import {
  History,
  Search,
  Filter,
  FileText,
  Printer,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  Calendar,
} from 'lucide-react';

export const HistoryPage: React.FC = () => {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalJobs, setTotalJobs] = useState<number>(0);
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const res = await jobService.getJobs({
        page,
        limit: 15,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
      });

      setJobs(res.jobs);
      setTotalPages(res.pagination.totalPages);
      setTotalJobs(res.pagination.total);
    } catch (err) {
      console.error('Failed to fetch print jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchJobs();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <History className="h-6 w-6 text-brand-400" />
            Print Job History
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Total of {totalJobs} document{totalJobs === 1 ? '' : 's'} submitted
          </p>
        </div>

        <button
          onClick={fetchJobs}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-300 transition-colors w-fit"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by document name..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </form>

        <div className="flex items-center gap-2 sm:w-64">
          <Filter className="h-4 w-4 text-slate-500 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="PRINTING">Printing</option>
            <option value="PRINTER_ACCEPTED">Printer Accepted</option>
            <option value="PROCESSING">Processing</option>
            <option value="QUEUED">Queued</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
        {jobs.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <h4 className="text-sm font-semibold text-slate-300">No print jobs found</h4>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your filters or search keywords.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 uppercase font-mono text-[10px] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Document Name</th>
                  <th className="px-5 py-3.5">Printer</th>
                  <th className="px-5 py-3.5">Pages & Format</th>
                  <th className="px-5 py-3.5">Date & Time</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {jobs.map((job) => {
                  const printer = typeof job.printerId === 'object' ? job.printerId : null;
                  return (
                    <tr
                      key={job._id}
                      onClick={() => setSelectedJob(job)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-4 font-medium text-white flex items-center gap-2.5">
                        <FileText className="h-4 w-4 text-brand-400 shrink-0" />
                        <div>
                          <div className="truncate max-w-xs font-semibold">{job.documentName}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {(job.fileSizeBytes / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-200">{printer ? printer.name : 'Printer'}</div>
                        {printer && <div className="text-[10px] text-slate-400 font-mono">{printer.lanIp}</div>}
                      </td>
                      <td className="px-5 py-4 font-mono text-slate-300">
                        {job.pageCount} p &bull; {job.copies}x &bull; {job.paperSize}
                      </td>
                      <td className="px-5 py-4 text-slate-400">
                        <div>{new Date(job.createdAt).toLocaleDateString()}</div>
                        <div className="text-[10px] text-slate-500">{new Date(job.createdAt).toLocaleTimeString()}</div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={job.status} size="sm" />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div>
              Page <span className="font-semibold text-white">{page}</span> of{' '}
              <span className="font-semibold text-white">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <JobDetailsModal
        isOpen={Boolean(selectedJob)}
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onJobUpdated={fetchJobs}
      />
    </div>
  );
};
