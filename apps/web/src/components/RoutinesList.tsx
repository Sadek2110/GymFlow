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
        <h1 className="font-headline text-3xl font-bold text-white tracking-tight">Rutinas</h1>
        <p className="text-sm text-slate-400 mt-1">Crea tu semana de entrenamiento y actívala.</p>
      </header>

      <form onSubmit={handleCreate} className="glass-card rounded-2xl p-5 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-24 h-24 bg-brand-500/10 rounded-full blur-3xl"></div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Nueva rutina
        </h2>
        <div className="mt-4 flex flex-col gap-3.5">
          <div>
            <label htmlFor="routine-name" className="mb-1.5 block text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Nombre
            </label>
            <input
              id="routine-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="p. ej. Push Pull Legs"
              maxLength={80}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label htmlFor="routine-goal" className="mb-1.5 block text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Objetivo (opcional)
            </label>
            <select
              id="routine-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value as Goal | '')}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="" className="bg-slate-900 text-white">Sin objetivo</option>
              {GOAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-slate-900 text-white">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting || name.trim().length < 2}
            className="touch-target mt-2 grid place-items-center rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-3.5 text-base font-bold text-white shadow-[0_0_15px_rgba(47,127,255,0.25)] border border-white/10 transition-all hover:shadow-[0_0_20px_rgba(47,127,255,0.4)] active:scale-95 disabled:opacity-40 cursor-pointer"
          >
            {submitting ? 'Creando…' : 'Crear rutina'}
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 font-semibold">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-slate-500 font-semibold">Cargando…</p>
      ) : routines.length === 0 ? (
        <p className="py-10 text-center text-slate-500 font-semibold">
          Aún no tienes rutinas. Crea la primera arriba.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {routines.map((r) => (
            <li key={r.id} className="glass-card rounded-2xl p-5 relative overflow-hidden flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-headline font-bold text-white text-lg">{r.name}</h3>
                  <p className="mt-1 text-sm text-slate-400 font-semibold">
                    {r.goal ? GOAL_LABEL[r.goal] : 'Sin objetivo'}
                  </p>
                </div>
                {r.isActive && (
                  <span className="shrink-0 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    Activa
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2.5">
                <a
                  href={`/routines/${r.id}`}
                  className="touch-target grid place-items-center rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white shadow-[0_0_12px_rgba(47,127,255,0.2)] border border-white/10 hover:bg-brand-600 active:scale-95 transition-all"
                >
                  Editar
                </a>
                {!r.isActive && (
                  <button
                    onClick={() => withBusy(r.id, () => activateRoutine(r.id))}
                    disabled={busyId === r.id}
                    className="touch-target rounded-xl border border-brand-500/30 px-4 py-2 text-sm font-bold text-brand-400 hover:bg-brand-500/10 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                  >
                    Activar
                  </button>
                )}
                <button
                  onClick={() => withBusy(r.id, () => duplicateRoutine(r.id))}
                  disabled={busyId === r.id}
                  className="touch-target rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                >
                  Duplicar
                </button>
                <button
                  onClick={() => handleDelete(r)}
                  disabled={busyId === r.id}
                  className="touch-target rounded-xl border border-red-500/20 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/10 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
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
