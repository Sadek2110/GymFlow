import { useEffect, useState, type FormEvent } from 'react';
import { fetchAdminReservations, type AdminReservation } from '../lib/admin';
import {
  RESERVATION_STATUS_BADGE,
  RESERVATION_STATUS_LABEL,
} from '../lib/reservations';

export default function AdminReservations({ userId }: { userId?: string }) {
  const [items, setItems] = useState<AdminReservation[]>([]);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load(event?: FormEvent) {
    event?.preventDefault();
    const query = new URLSearchParams({ page: '1', limit: '100' });
    if (userId) query.set('userId', userId);
    if (status) query.set('status', status);
    if (from) query.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) query.set('to', new Date(`${to}T23:59:59`).toISOString());
    try {
      setItems((await fetchAdminReservations(query.toString())).items);
    } catch {
      setError('No se pudieron cargar las reservas.');
    }
  }
  useEffect(() => {
    void load();
  }, [userId]);

  return (
    <section className="grid gap-4">
      <form onSubmit={load} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium">Estado
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-11 rounded-xl border border-slate-300 px-3">
            <option value="">Todos</option>
            {Object.entries(RESERVATION_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-11 rounded-xl border border-slate-300 px-3" />
        </label>
        <label className="grid gap-1 text-sm font-medium">Hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-11 rounded-xl border border-slate-300 px-3" />
        </label>
        <button className="touch-target self-end rounded-xl bg-brand-500 px-4 font-semibold text-white">Filtrar</button>
      </form>
      <div className="grid gap-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{item.user?.name ?? 'Usuario eliminado'}</p>
                <p className="text-sm text-slate-600">{item.user?.email}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${RESERVATION_STATUS_BADGE[item.status]}`}>
                {RESERVATION_STATUS_LABEL[item.status]}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-700">{item.timeSlot} · {new Date(item.date).toLocaleDateString('es-ES')}</p>
            {item.rawLog && (
              <details className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                <summary className="cursor-pointer font-medium">Ver rawLog</summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{item.rawLog}</pre>
              </details>
            )}
          </article>
        ))}
      </div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </section>
  );
}
