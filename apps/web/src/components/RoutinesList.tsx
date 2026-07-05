import { useEffect, useState } from 'react';
import { ApiRequestError } from '../lib/api';
import {
  fetchRoutines,
  createRoutine,
  activateRoutine,
  duplicateRoutine,
  deleteRoutine,
  GOAL_LABEL,
  GOAL_OPTIONS,
  type Goal,
  type RoutineSummary,
} from '../lib/routines';

export default function RoutinesList() {
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [goal, setGoal] = useState<Goal | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setRoutines(await fetchRoutines());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'No se pudieron cargar las rutinas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createRoutine({ name: trimmed, ...(goal ? { goal } : {}) });
      // Al crear se abre directamente el editor para montar la semana.
      window.location.href = `/routines/${created.id}`;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'No se pudo crear la rutina.');
      setSubmitting(false);
    }
  }

  async function withBusy(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'La operación no se pudo completar.');
    } finally {
      setBusyId(null);
    }
  }

  function handleDelete(routine: RoutineSummary) {
    if (!window.confirm(`¿Borrar la rutina "${routine.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    void withBusy(routine.id, () => deleteRoutine(routine.id));
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Rutinas</h1>
        <p className="text-sm text-slate-500">Crea tu semana de entrenamiento y actívala.</p>
      </header>

      <form onSubmit={handleCreate} className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Nueva rutina
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <label htmlFor="routine-name" className="mb-1 block text-sm font-medium text-slate-700">
              Nombre
            </label>
            <input
              id="routine-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="p. ej. Push Pull Legs"
              maxLength={80}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label htmlFor="routine-goal" className="mb-1 block text-sm font-medium text-slate-700">
              Objetivo (opcional)
            </label>
            <select
              id="routine-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value as Goal | '')}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Sin objetivo</option>
              {GOAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting || name.trim().length < 2}
            className="touch-target rounded-xl bg-brand-500 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
          >
            {submitting ? 'Creando…' : 'Crear rutina'}
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-slate-500">Cargando…</p>
      ) : routines.length === 0 ? (
        <p className="py-10 text-center text-slate-500">
          Aún no tienes rutinas. Crea la primera arriba.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {routines.map((r) => (
            <li key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-900">{r.name}</h3>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {r.goal ? GOAL_LABEL[r.goal] : 'Sin objetivo'}
                  </p>
                </div>
                {r.isActive && (
                  <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                    Activa
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`/routines/${r.id}`}
                  className="touch-target rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
                >
                  Editar
                </a>
                {!r.isActive && (
                  <button
                    onClick={() => withBusy(r.id, () => activateRoutine(r.id))}
                    disabled={busyId === r.id}
                    className="touch-target rounded-xl border border-brand-500 px-3 py-2 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-40"
                  >
                    Activar
                  </button>
                )}
                <button
                  onClick={() => withBusy(r.id, () => duplicateRoutine(r.id))}
                  disabled={busyId === r.id}
                  className="touch-target rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40"
                >
                  Duplicar
                </button>
                <button
                  onClick={() => handleDelete(r)}
                  disabled={busyId === r.id}
                  className="touch-target rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40"
                >
                  Borrar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
