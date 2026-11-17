import axios from 'axios';
import { User, Printer, PrintJob, WorkerInfo, SystemLogItem, DashboardStats } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to inject JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth Services
export const authService = {
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const res = await api.post('/api/auth/login', { email, password });
    if (res.data.token) {
      localStorage.setItem('token', res.data.token);
    }
    return res.data;
  },

  async register(name: string, email: string, password: string): Promise<{ token: string; user: User }> {
    const res = await api.post('/api/auth/register', { name, email, password });
    if (res.data.token) {
      localStorage.setItem('token', res.data.token);
    }
    return res.data;
  },

  async getMe(): Promise<{ user: User }> {
    const res = await api.get('/api/auth/me');
    return res.data;
  },

  logout(): void {
    localStorage.removeItem('token');
  },
};

// Printer Services
export const printerService = {
  async getPrinters(): Promise<Printer[]> {
    const res = await api.get('/api/printers');
    return res.data.printers;
  },

  async getPrinterById(id: string): Promise<Printer> {
    const res = await api.get(`/api/printers/${id}`);
    return res.data.printer;
  },

  async createPrinter(data: Partial<Printer>): Promise<Printer> {
    const res = await api.post('/api/printers', data);
    return res.data.printer;
  },

  async updatePrinter(id: string, data: Partial<Printer>): Promise<Printer> {
    const res = await api.put(`/api/printers/${id}`, data);
    return res.data.printer;
  },

  async deletePrinter(id: string): Promise<void> {
    await api.delete(`/api/printers/${id}`);
  },

  async testConnection(id: string): Promise<any> {
    const res = await api.post(`/api/printers/${id}/test-connection`);
    return res.data;
  },

  async detectCapabilities(id: string): Promise<any> {
    const res = await api.get(`/api/printers/${id}/detect-capabilities`);
    return res.data;
  },
};

// Print Job Services
export const jobService = {
  async createJob(formData: FormData, onUploadProgress?: (progress: number) => void): Promise<{ job: PrintJob; preview: any }> {
    const res = await api.post('/api/jobs', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onUploadProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onUploadProgress(percent);
        }
      },
    });
    return res.data;
  },

  async getJobs(params?: { page?: number; limit?: number; status?: string; printerId?: string; search?: string }): Promise<{ jobs: PrintJob[]; pagination: any }> {
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

// Admin Services
export const adminService = {
  async getStats(): Promise<DashboardStats> {
    const res = await api.get('/api/admin/stats');
    return res.data.stats;
  },

  async getUsers(): Promise<User[]> {
    const res = await api.get('/api/admin/users');
    return res.data.users;
  },

  async updateUserRole(id: string, role: 'admin' | 'user'): Promise<User> {
    const res = await api.patch(`/api/admin/users/${id}/role`, { role });
    return res.data.user;
  },

  async getWorkers(): Promise<WorkerInfo[]> {
    const res = await api.get('/api/admin/workers');
    return res.data.workers;
  },

  async getLogs(params?: { level?: string; eventType?: string; page?: number; limit?: number }): Promise<{ logs: SystemLogItem[]; pagination: any }> {
    const res = await api.get('/api/admin/logs', { params });
    return res.data;
  },
};

// Network Services
export const networkService = {
  async getConfig(): Promise<any> {
    const res = await api.get('/api/network/config');
    return res.data;
  },

  async updateConfig(data: any): Promise<any> {
    const res = await api.put('/api/network/config', data);
    return res.data;
  },

  async getGuide(brand: string): Promise<any> {
    const res = await api.get('/api/network/guide', { params: { brand } });
    return res.data;
  },

  async runDiagnostics(printerIp: string): Promise<any> {
    const res = await api.post('/api/network/diagnostics', { printerIp });
    return res.data;
  },
};
