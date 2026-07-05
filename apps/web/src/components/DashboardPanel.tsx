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
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-slate-400">Hola de nuevo,</p>
        <h1 className="font-headline text-3xl font-bold text-white tracking-tight">{firstName} 👋</h1>
      </header>

      {error && (
        <p role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Qué toca hoy */}
      <section className="glass-card rounded-2xl p-5 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-brand-500/10 rounded-full blur-3xl"></div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Hoy</p>
        {!overview?.activeRoutine ? (
          <div className="mt-2">
            <p className="text-slate-300 text-sm">No tienes ninguna rutina activa.</p>
            <a href="/routines" className="mt-2 inline-block text-sm font-semibold text-brand-500 hover:underline">
              Crear o activar una rutina →
            </a>
          </div>
        ) : today?.isRestDay ? (
          <p className="mt-2 text-lg font-bold text-slate-200 flex items-center gap-2">
            Hoy descansas <span className="text-xl">💤</span>
          </p>
        ) : today && today.exercises.length > 0 ? (
          <>
            <h2 className="font-headline mt-1.5 text-xl font-bold text-white">
              {today.title || 'Entrenamiento de hoy'}
            </h2>
            <ul className="mt-3.5 flex flex-col gap-2">
              {today.exercises.map((e) => (
                <li key={e.id} className="text-sm text-slate-200 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shadow-[0_0_6px_rgba(47,127,255,0.8)]"></span>
                  <span className="font-medium">{e.exercise.name}</span>{' '}
                  <span className="text-xs text-slate-500 font-semibold">
                    ({e.targetSets}×{e.targetReps})
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-slate-300 text-sm">
            Hoy no hay ejercicios planificados. ¡Puedes entrenar libre!
          </p>
        )}

        {shouldRun?.autoReserveEnabled && (
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Auto-reserva para mañana:</span>
            {shouldRun.shouldReserve ? (
              <span className="inline-flex items-center gap-1 font-semibold text-neon-lime bg-neon-lime/10 border border-neon-lime/25 px-2.5 py-1 rounded-lg">
                ✅ Planificada
              </span>
            ) : shouldRun.reason === 'rest-day' ? (
              <span className="inline-flex items-center gap-1 font-semibold text-brand-400 bg-brand-500/10 border border-brand-500/20 px-2.5 py-1 rounded-lg">
                💤 Descanso
              </span>
            ) : shouldRun.reason === 'no-active-routine' ? (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                ⚠️ Sin rutina
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold text-slate-300 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg">
                🚫 Omitida
              </span>
            )}
          </div>
        )}
      </section>

      <a
        href={ctaHref}
        className="touch-target grid place-items-center rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-4.5 text-base font-bold text-white shadow-[0_0_20px_rgba(47,127,255,0.3)] hover:scale-[1.01] hover:shadow-[0_0_25px_rgba(47,127,255,0.5)] active:scale-95 transition-all duration-300 border border-white/15 cursor-pointer text-center"
      >
        {ctaLabel}
      </a>

      {/* Progreso semanal + último peso */}
      <div className="grid grid-cols-2 gap-4">
        <section className="glass-card flex flex-col items-center rounded-2xl p-5 relative overflow-hidden">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400 self-start">
            Esta semana
          </p>
          {week && <WeekRing completed={week.completed} target={week.target} />}
        </section>

        <section className="glass-card flex flex-col justify-between rounded-2xl p-5 relative overflow-hidden">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Último peso</p>
            <p className="mt-2 text-3xl font-extrabold text-white tracking-tight">
              {overview?.lastWeightKg != null ? formatWeight(overview.lastWeightKg, units) : '—'}
            </p>
          </div>
          <a href="/profile" className="mt-4 text-xs font-semibold text-brand-500 hover:underline self-start">
            Actualizar →
          </a>
        </section>
      </div>

      <a href="/history" className="text-center text-sm font-semibold text-slate-400 hover:text-white transition-colors py-2">
        Ver historial de entrenamientos →
      </a>
    </div>
  );
}

function WeekRing({ completed, target }: { completed: number; target: number }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative grid h-24 w-24 place-items-center mt-2">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          className="text-brand-500 drop-shadow-[0_0_8px_rgba(47,127,255,0.6)]"
          strokeDasharray={ringDash(completed, target, C)}
        />
      </svg>
      <span className="absolute text-lg font-extrabold text-white">
        {completed}/{target}
      </span>
    </div>
  );
}
