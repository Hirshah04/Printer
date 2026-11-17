import axios from 'axios';
import { Printer, PrintJob } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // 2-minute ceiling to allow Render free tier wake-up from another network
});

// Single Printer Service (HP LaserJet M126nw @ 192.168.1.37)
export const printerService = {
  async getPrinter(): Promise<Printer> {
    const res = await api.get('/api/printer');
    return res.data.printer;
  },

  async testConnection(): Promise<any> {
    const res = await api.post('/api/printer/test-connection');
    return res.data;
  },

  async checkNow(): Promise<Printer> {
    const res = await api.post('/api/printer/check-now');
    return res.data.printer;
  },
};

// Print Job Service
export const jobService = {
  async createJob(formData: FormData, onUploadProgress?: (progress: number) => void): Promise<{ job: PrintJob; preview: any }> {
    const res = await api.post('/api/jobs', formData, {
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onUploadProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onUploadProgress(percent);
        }
      },
    });
    return res.data;
  },

  async getJobs(params?: { status?: string; search?: string }): Promise<{ jobs: PrintJob[]; total: number }> {
    const res = await api.get('/api/jobs', { params });
    return res.data;
  },

  async getJobById(id: string): Promise<PrintJob> {
    const res = await api.get(`/api/jobs/${id}`);
    return res.data.job;
  },

  async retryJob(id: string): Promise<PrintJob> {
    const res = await api.post(`/api/jobs/${id}/retry`);
    return res.data.job;
  },

  async cancelJob(id: string): Promise<PrintJob> {
    const res = await api.post(`/api/jobs/${id}/cancel`);
    return res.data.job;
  },
};
