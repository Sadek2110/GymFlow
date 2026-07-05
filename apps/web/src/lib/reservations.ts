import { api } from './api';

export interface Reservation {
  id: string;
  facility: string;
  service: string;
  date: string;
  timeSlot: string;
  status: 'pending' | 'confirmed' | 'failed' | 'dry_run' | 'skipped' | 'cancelled';
  rawLog?: string | null;
  createdAt: string;
}

export interface ReservaGymHealth {
  ok: boolean;
  service?: string;
  status?: string;
}

export interface AutoReserveState {
  enabled: boolean;
  times: string[];
}

export interface GymCredentialsState {
  configured: boolean;
  updatedAt: string | null;
}

export interface ShouldRunResponse {
  autoReserveEnabled: boolean;
  shouldReserve: boolean;
  reason?: 'no-active-routine' | 'day-not-in-routine' | 'rest-day' | 'empty-day';
  dayTitle?: string;
}

export const RESERVATION_STATUS_LABEL: Record<Reservation['status'], string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  failed: 'Fallida',
  dry_run: 'Prueba (dry run)',
  skipped: 'Omitida (descanso)',
  cancelled: 'Cancelada',
};

export const RESERVATION_STATUS_BADGE: Record<Reservation['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  dry_run: 'bg-slate-100 text-slate-600',
  skipped: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-slate-200 text-slate-600 line-through',
};

export const fetchReservationHealth = () =>
  api.get<ReservaGymHealth>('/reservations/health');

export const fetchReservations = () => api.get<Reservation[]>('/reservations');

export const runReservation = (body: { dryRun?: boolean; time?: string }) =>
  api.post<Reservation>('/reservations/run', body);

export const fetchAutoReserve = () =>
  api.get<AutoReserveState>('/reservations/auto-reserve');

export const updateAutoReserve = (body: AutoReserveState) =>
  api.patch<AutoReserveState>('/reservations/auto-reserve', body);

export const fetchGymCredentials = () =>
  api.get<GymCredentialsState>('/reservations/credentials');

export const saveGymCredentials = (body: { dni: string; password: string }) =>
  api.put<{ configured: true }>('/reservations/credentials', body);

export const testGymCredentials = () =>
  api.post<{ ok: boolean; message: string }>('/reservations/credentials/test');

export const deleteGymCredentials = () =>
  api.del<{ configured: false }>('/reservations/credentials');

export const cancelReservation = (id: string, dryRun = false) =>
  api.post<Reservation | { ok: true; dryRun: true }>(
    `/reservations/${encodeURIComponent(id)}/cancel`,
    { dryRun },
  );

export const fetchShouldRunTomorrow = () =>
  api.get<ShouldRunResponse>('/reservations/should-run');
