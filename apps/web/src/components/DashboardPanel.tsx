import { useEffect, useState } from 'react';
import { api, ApiRequestError } from '../lib/api';
import { formatWeight, type Units } from '../lib/units';
import { fetchOverview, ringDash, type Overview } from '../lib/progress';
import { fetchShouldRunTomorrow, type ShouldRunResponse } from '../lib/reservations';

interface Me {
  name: string;
  profile: { units: string } | null;
}

export default function DashboardPanel() {
  const [me, setMe] = useState<Me | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [shouldRun, setShouldRun] = useState<ShouldRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Me>('/users/me'),
      fetchOverview(),
      fetchShouldRunTomorrow().catch(() => null),
    ])
      .then(([meRes, ov, runTomorrow]) => {
        setMe(meRes);
        setOverview(ov);
        setShouldRun(runTomorrow);
      })
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : 'No se pudo cargar tu inicio.'),
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="py-10 text-center text-slate-500">Cargando…</p>;

  const units: Units = (me?.profile?.units as Units) ?? 'kg';
  const firstName = me?.name?.split(' ')[0] ?? '';
  const today = overview?.today;
  const active = overview?.activeSession;
  const week = overview?.week;

  // Destino y texto del botón principal.
  let ctaHref = '/train';
  let ctaLabel = 'Empezar entrenamiento libre';
  if (active) {
    ctaLabel = 'Continuar entrenamiento';
  } else if (today && !today.isRestDay) {
    ctaHref = `/train?routineDayId=${today.routineDayId}`;
    ctaLabel = 'Empezar entrenamiento';
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-slate-500">Hola de nuevo,</p>
        <h1 className="text-2xl font-bold text-slate-900">{firstName} 👋</h1>
      </header>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Qué toca hoy */}
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Hoy</p>
        {!overview?.activeRoutine ? (
          <div className="mt-2">
            <p className="text-slate-600">No tienes ninguna rutina activa.</p>
            <a href="/routines" className="mt-1 inline-block text-sm font-semibold text-brand-600">
              Crear o activar una rutina →
            </a>
          </div>
        ) : today?.isRestDay ? (
          <p className="mt-2 text-lg font-semibold text-slate-800">Hoy descansas 💤</p>
        ) : today && today.exercises.length > 0 ? (
          <>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {today.title || 'Entrenamiento de hoy'}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {today.exercises.map((e) => (
                <li key={e.id} className="text-sm text-slate-600">
                  · {e.exercise.name}{' '}
                  <span className="text-slate-400">
                    ({e.targetSets}×{e.targetReps})
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-slate-600">
            Hoy no hay ejercicios planificados. ¡Puedes entrenar libre!
          </p>
        )}

        {shouldRun?.autoReserveEnabled && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Auto-reserva para mañana:</span>
            {shouldRun.shouldReserve ? (
              <span className="inline-flex items-center gap-1 font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-lg">
                ✅ Planificada ({shouldRun.dayTitle || 'Entrenamiento'})
              </span>
            ) : shouldRun.reason === 'rest-day' ? (
              <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
                💤 Omitida (descanso)
              </span>
            ) : shouldRun.reason === 'no-active-routine' ? (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">
                ⚠️ Omitida (sin rutina activa)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg">
                🚫 Omitida ({shouldRun.reason})
              </span>
            )}
          </div>
        )}
      </section>

      <a
        href={ctaHref}
        className="touch-target grid place-items-center rounded-2xl bg-brand-500 px-6 py-5 text-lg font-bold text-white shadow-md shadow-brand-500/25 transition-colors hover:bg-brand-600"
      >
        {ctaLabel}
      </a>

      {/* Progreso semanal + último peso */}
      <div className="grid grid-cols-2 gap-4">
        <section className="flex flex-col items-center rounded-2xl bg-white p-5 shadow-sm">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Esta semana
          </p>
          {week && <WeekRing completed={week.completed} target={week.target} />}
        </section>

        <section className="flex flex-col justify-center rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Último peso</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {overview?.lastWeightKg != null ? formatWeight(overview.lastWeightKg, units) : '—'}
          </p>
          <a href="/profile" className="mt-1 text-sm font-semibold text-brand-600">
            Actualizar →
          </a>
        </section>
      </div>

      <a href="/history" className="text-center text-sm font-semibold text-brand-600">
        Ver historial de entrenamientos →
      </a>
    </div>
  );
}

function WeekRing({ completed, target }: { completed: number; target: number }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative grid h-24 w-24 place-items-center">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={R} fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100" />
        <circle
          cx="40"
          cy="40"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          className="text-brand-500"
          strokeDasharray={ringDash(completed, target, C)}
        />
      </svg>
      <span className="absolute text-lg font-bold text-slate-900">
        {completed}/{target}
      </span>
    </div>
  );
}
