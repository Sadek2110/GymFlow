import { api } from './api';

export interface Reservation {
  id: string;
  facility: string;
  service: string;
  date: string;
  timeSlot: string;
  status: 'pending' | 'confirmed' | 'failed' | 'dry_run';
  rawLog?: string | null;
  createdAt: string;
}

export interface ReservaGymHealth {
  ok: boolean;
  service?: string;
  status?: string;
}

export const RESERVATION_STATUS_LABEL: Record<Reservation['status'], string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  failed: 'Fallida',
  dry_run: 'Prueba (dry run)',
};

export const RESERVATION_STATUS_BADGE: Record<Reservation['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  dry_run: 'bg-slate-100 text-slate-600',
};

export const fetchReservationHealth = () =>
  api.get<ReservaGymHealth>('/reservations/health');

export const fetchReservations = () => api.get<Reservation[]>('/reservations');

export const runReservation = (body: { dryRun?: boolean; time?: string }) =>
  api.post<Reservation>('/reservations/run', body);
