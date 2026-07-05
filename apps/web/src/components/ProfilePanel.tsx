import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiRequestError } from '../lib/api';
import { tokenStore } from '../lib/tokens';
import { toDisplayWeight, toKg, formatWeight, type Units } from '../lib/units';

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
          <h1 className="text-2xl font-bold text-slate-900">{me?.name}</h1>
          <p className="text-sm text-slate-500">{me?.email}</p>
        </div>
        <button
          onClick={logout}
          className="touch-target rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Salir
        </button>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Añadir peso corporal
        </h2>
        <form onSubmit={addWeight} className="mt-3 flex items-end gap-3">
          <div className="flex-1">
            <label htmlFor="newWeight" className="mb-1 block text-sm text-slate-600">
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
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="touch-target rounded-xl bg-brand-500 px-5 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? '…' : 'Guardar'}
          </button>
        </form>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Evolución del peso
        </h2>
        {measurements.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Aún no has registrado tu peso. Añade el primero arriba.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {[...measurements].reverse().map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2.5">
                <span className="font-medium text-slate-800">
                  {formatWeight(Number(m.weightKg), units)}
                </span>
                <span className="text-sm text-slate-400">
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
        className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md"
      >
        <span className="font-medium text-slate-800">🏋️ Reservas del gimnasio</span>
        <span className="text-brand-600">→</span>
      </a>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
