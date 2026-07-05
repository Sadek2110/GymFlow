import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiRequestError } from '../lib/api';
import { tokenStore } from '../lib/tokens';
import { toDisplayWeight, toKg, formatWeight, type Units } from '../lib/units';
import GymCredentialsPanel from './GymCredentialsPanel';

interface Me {
  id: string;
  name: string;
  email: string;
  role: string;
  profile: { units: string } | null;
  lastWeightKg: number | null;
}

interface Measurement {
  id: string;
  weightKg: string | number;
  date: string;
  note?: string | null;
}

export default function ProfilePanel() {
  const [me, setMe] = useState<Me | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [newWeight, setNewWeight] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const units: Units = (me?.profile?.units as Units) ?? 'kg';

  async function load() {
    try {
      const [meRes, list] = await Promise.all([
        api.get<Me>('/users/me'),
        api.get<Measurement[]>('/users/me/measurements'),
      ]);
      setMe(meRes);
      setMeasurements(list);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'No se pudo cargar el perfil.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addWeight(e: FormEvent) {
    e.preventDefault();
    const value = Number(newWeight);
    if (!value || value <= 0) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/users/me/measurements', { weightKg: toKg(value, units) });
      setNewWeight('');
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'No se pudo guardar el peso.');
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    try {
      const refreshToken = tokenStore.getRefresh();
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch {
      // Cierre de sesión idempotente: continuamos aunque falle.
    } finally {
      tokenStore.clear();
      window.location.href = '/login';
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-slate-500">Cargando…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-headline text-3xl font-bold text-white tracking-tight">{me?.name}</h1>
          <p className="text-sm text-slate-400 font-semibold mt-0.5">{me?.email}</p>
        </div>
        <button
          onClick={logout}
          className="touch-target rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
        >
          Salir
        </button>
      </header>

      {error && (
        <p role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 font-semibold">
          {error}
        </p>
      )}

      <section className="glass-card rounded-2xl p-5 relative overflow-hidden">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Añadir peso corporal
        </h2>
        <form onSubmit={addWeight} className="mt-4 flex items-end gap-3">
          <div className="flex-1">
            <label htmlFor="newWeight" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400">
              Peso actual ({units})
            </label>
            <input
              id="newWeight"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={newWeight}
              onChange={(e) => setNewWeight(e.target.value)}
              placeholder={me?.lastWeightKg ? String(toDisplayWeight(me.lastWeightKg, units)) : '—'}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="touch-target rounded-xl bg-brand-500 px-5 py-3 font-bold text-white hover:bg-brand-600 disabled:opacity-60 cursor-pointer transition-all active:scale-95 shadow-[0_0_12px_rgba(47,127,255,0.2)] border border-white/10"
          >
            {saving ? '…' : 'Guardar'}
          </button>
        </form>
      </section>

      <GymCredentialsPanel />

      <section className="glass-card rounded-2xl p-5 relative overflow-hidden">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Evolución del peso
        </h2>
        {measurements.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400 font-semibold">
            Aún no has registrado tu peso. Añade el primero arriba.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/5">
            {[...measurements].reverse().map((m) => (
              <li key={m.id} className="flex items-center justify-between py-3">
                <span className="font-bold text-white">
                  {formatWeight(Number(m.weightKg), units)}
                </span>
                <span className="text-sm text-slate-500 font-semibold">
                  {new Date(m.date).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <a
        href="/reservations"
        className="glass-card flex items-center justify-between rounded-2xl p-4 transition duration-200 hover:scale-[1.01]"
      >
        <span className="font-bold text-white">Reservas del gimnasio</span>
        <span className="text-sm font-bold text-brand-400">Abrir</span>
      </a>

      {me?.role === 'ADMIN' && (
        <a
          href="/admin"
          className="flex min-h-11 items-center justify-between rounded-2xl border border-brand-500/25 bg-brand-500/10 p-4 font-bold text-brand-400 hover:bg-brand-500/15 duration-200 transition"
        >
          Administración
          <span className="text-sm">Abrir</span>
        </a>
      )}
    </div>
  );
}
