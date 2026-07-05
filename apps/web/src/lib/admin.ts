import { api } from './api';
import type { Reservation } from './reservations';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  createdAt?: string;
  autoReserveEnabled: boolean;
  autoReserveTimes?: string[];
  credentialsConfigured: boolean;
  _count: { reservations: number; sessions: number; routines?: number };
}

export interface AdminStats {
  users: number;
  reservations: number;
  byStatus: Record<string, number>;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export type AdminReservation = Reservation & {
  user: Pick<AdminUser, 'id' | 'name' | 'email'>;
};

export const fetchAdminStats = () => api.get<AdminStats>('/admin/stats');
export const fetchAdminUsers = (search = '') =>
  api.get<Page<AdminUser>>(
    `/admin/users?search=${encodeURIComponent(search)}&page=1&limit=20`,
  );
export const fetchAdminUser = (id: string) =>
  api.get<AdminUser>(`/admin/users/${encodeURIComponent(id)}`);
export const fetchAdminReservations = (query = '') =>
  api.get<Page<AdminReservation>>(`/admin/reservations?${query}`);
