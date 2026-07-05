import { useEffect, useMemo, useState } from 'react';
import { ApiRequestError } from '../lib/api';
import {
  fetchWorkouts,
  fetchWorkout,
  groupByExercise,
  type WorkoutSession,
} from '../lib/workouts';
import type { Paginated } from '../lib/exercises';

const STATUS_LABEL: Record<string, string> = {
  in_progress: 'En curso',
  completed: 'Completado',
  abandoned: 'Abandonado',
};
const STATUS_BADGE: Record<string, string> = {
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  abandoned: 'bg-slate-100 text-slate-500',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function HistoryPanel() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<WorkoutSession> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkoutSession | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [status]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('page', String(page));
    fetchWorkouts(`?${params.toString()}`)
      .then(setResult)
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : 'No se pudo cargar el historial.'),
      )
      .finally(() => setLoading(false));
  }, [status, page]);

  async function toggle(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await fetchWorkout(id));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const meta = result?.meta;
  const sessions = useMemo(() => result?.data ?? [], [result]);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Historial</h1>
        <p className="text-sm text-slate-500">Todas tus sesiones de entrenamiento.</p>
      </header>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <Chip active={status === ''} onClick={() => setStatus('')} label="Todas" />
        <Chip active={status === 'completed'} onClick={() => setStatus('completed')} label="Completadas" />
        <Chip active={status === 'abandoned'} onClick={() => setStatus('abandoned')} label="Abandonadas" />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-slate-500">Cargando…</p>
      ) : sessions.length === 0 ? (
        <p className="py-10 text-center text-slate-500">Aún no hay entrenamientos registrados.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map((s) => (
            <li key={s.id} className="rounded-2xl bg-white shadow-sm">
              <button
                onClick={() => toggle(s.id)}
                aria-expanded={expandedId === s.id}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <div>
                  <p className="font-semibold capitalize text-slate-900">{formatDate(s.date)}</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {(s._count?.logs ?? s.logs?.length ?? 0)} series
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[s.status]}`}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
              </button>

              {expandedId === s.id && (
                <div className="border-t border-slate-100 p-4">
                  {detailLoading || !detail ? (
                    <p className="text-center text-sm text-slate-400">Cargando detalle…</p>
                  ) : detail.logs.length === 0 ? (
                    <p className="text-center text-sm text-slate-400">Sin series registradas.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {groupByExercise(detail.logs).map((g) => (
                        <div key={g.exerciseId}>
                          <p className="text-sm font-semibold text-slate-800">
                            {g.logs[0]?.exercise?.name ?? 'Ejercicio'}
                          </p>
                          <ul className="mt-1 flex flex-col gap-0.5">
                            {g.logs.map((l) => (
                              <li key={l.id} className="text-sm text-slate-500">
                                Serie {l.setNumber}: {l.weightKg != null ? `${l.weightKg} kg × ` : ''}
                                {l.reps} reps
                                {l.rpe != null ? ` · RPE ${l.rpe}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="touch-target rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-sm text-slate-500">
            Página {meta.page} de {meta.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            disabled={page >= meta.totalPages}
            className="touch-target rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );
}
