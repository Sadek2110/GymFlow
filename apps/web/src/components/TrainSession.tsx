import { useEffect, useState } from 'react';
import { ApiRequestError } from '../lib/api';
import type { Exercise } from '../lib/exercises';
import {
  getActiveWorkout,
  startWorkout,
  fetchWorkout,
  addWorkoutLog,
  removeWorkoutLog,
  finishWorkout,
  abandonWorkout,
  nextSetNumber,
  groupByExercise,
  type WorkoutSession,
  type WorkoutLog,
  type PlanExercise,
  type PreviousBest,
} from '../lib/workouts';
import RestTimer from './RestTimer';
import AddExerciseModal from './AddExerciseModal';

const DEFAULT_REST = 90;

/** Primer entero de un objetivo de reps ("8-12" → 8); usado para precargar el input. */
function parseFirstInt(value: string, fallback: number): number {
  const m = value.match(/\d+/);
  return m ? Number(m[0]) : fallback;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export default function TrainSession() {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<WorkoutSession | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [extraExercises, setExtraExercises] = useState<Exercise[]>([]);
  const [hints, setHints] = useState<Record<string, string>>({});

  // Temporizador de descanso.
  const [rest, setRest] = useState<{ seconds: number; runId: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const active = await getActiveWorkout();
        if (cancelled) return;
        if (active) {
          setSession(active);
        } else {
          // Si venimos con ?routineDayId=… arrancamos ese día directamente.
          const params = new URLSearchParams(window.location.search);
          const routineDayId = params.get('routineDayId') ?? undefined;
          if (routineDayId) {
            setSession(await startWorkout({ routineDayId }));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : 'No se pudo cargar el entrenamiento.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reload(id: string) {
    setSession(await fetchWorkout(id));
  }

  async function startFree() {
    setBusy(true);
    setError(null);
    try {
      setSession(await startWorkout({}));
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        // Ya había una sesión en curso: la cargamos para continuar.
        setSession(await getActiveWorkout());
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'No se pudo empezar el entrenamiento.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function logSet(
    exerciseId: string,
    payload: { weightKg: number | null; reps: number; setNumber: number; restSeconds: number },
  ) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const { previousBest } = await addWorkoutLog(session.id, {
        exerciseId,
        setNumber: payload.setNumber,
        reps: payload.reps,
        ...(payload.weightKg != null ? { weightKg: payload.weightKg } : {}),
        restSeconds: payload.restSeconds,
      });
      setHints((h) => ({ ...h, [exerciseId]: describePrevious(previousBest) }));
      setRest({ seconds: payload.restSeconds || DEFAULT_REST, runId: Date.now() });
      await reload(session.id);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'No se pudo registrar la serie.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSet(logId: string) {
    if (!session) return;
    setBusy(true);
    try {
      await removeWorkoutLog(session.id, logId);
      await reload(session.id);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'No se pudo borrar la serie.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFinish() {
    if (!session) return;
    setBusy(true);
    try {
      setFinished(await finishWorkout(session.id));
      setSession(null);
      setRest(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'No se pudo finalizar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAbandon() {
    if (!session) return;
    if (!window.confirm('¿Abandonar el entrenamiento? Las series ya registradas se conservan.')) return;
    setBusy(true);
    try {
      await abandonWorkout(session.id);
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'No se pudo abandonar.');
      setBusy(false);
    }
  }

  function addExerciseToSession(exercise: Exercise) {
    setExtraExercises((prev) =>
      prev.some((e) => e.id === exercise.id) ? prev : [...prev, exercise],
    );
    setModalOpen(false);
  }

  if (finished) {
    const sets = finished.logs.length;
    return (
      <div className="py-12 text-center glass-card rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-brand-500/10 blur-3xl"></div>
        <p className="text-5xl">🎉</p>
        <h1 className="font-headline mt-3 text-2xl font-bold text-white">¡Entrenamiento completado!</h1>
        <p className="mt-1 text-sm font-semibold text-slate-400">
          {sets} {sets === 1 ? 'serie registrada' : 'series registradas'}.
        </p>
        <a
          href="/dashboard"
          className="mt-6 inline-block rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-3 text-sm font-bold text-white hover:shadow-[0_0_20px_rgba(47,127,255,0.4)] transition-all duration-300 border border-white/10 active:scale-95 cursor-pointer"
        >
          Volver al inicio
        </a>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col gap-5">
        <header>
          <h1 className="font-headline text-3xl font-bold text-white tracking-tight">Entrenar</h1>
          <p className="text-sm text-slate-400 mt-1">No tienes ningún entrenamiento en curso.</p>
        </header>
        {error && (
          <p role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        )}
        <button
          onClick={startFree}
          disabled={busy}
          className="touch-target rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-4 text-base font-bold text-white shadow-[0_0_20px_rgba(47,127,255,0.3)] hover:shadow-[0_0_25px_rgba(47,127,255,0.5)] active:scale-95 transition-all duration-300 border border-white/10 cursor-pointer"
        >
          Empezar entrenamiento libre
        </button>
        <p className="text-center text-sm text-slate-500">
          Para entrenar tu rutina de hoy, entra desde <a href="/routines" className="text-brand-500 font-semibold hover:underline">Rutinas</a>.
        </p>
      </div>
    );
  }

  // Ejercicios a mostrar: los del plan + los añadidos manualmente en sesión libre.
  const planExercises = session.plan?.exercises ?? [];
  const planIds = new Set(planExercises.map((p) => p.exerciseId));
  // En sesión libre sin plan, mostramos también los que ya tienen series registradas.
  const loggedOnly = groupByExercise(session.logs)
    .map((g) => g.logs[0]?.exercise)
    .filter((ex): ex is NonNullable<typeof ex> => !!ex && !planIds.has(ex.id));
  const extraCards = [
    ...loggedOnly,
    ...extraExercises.filter((e) => !planIds.has(e.id) && !loggedOnly.some((l) => l.id === e.id)),
  ];

  const totalSets = session.logs.length;

  return (
    <div className="flex flex-col gap-4">
      <header className="glass-card rounded-2xl p-5 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-24 h-24 bg-brand-500/10 rounded-full blur-3xl"></div>
        <h1 className="font-headline text-xl font-bold text-white">
          {session.plan?.title || 'Entrenamiento libre'}
        </h1>
        <p className="mt-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {totalSets} {totalSets === 1 ? 'serie' : 'series'} · en curso
        </p>
        <div className="mt-4 flex gap-2.5">
          <button
            onClick={handleFinish}
            disabled={busy}
            className="touch-target flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.25)] border border-white/10 hover:bg-emerald-700 active:scale-95 transition-all duration-200 cursor-pointer"
          >
            ✓ Finalizar
          </button>
          <button
            onClick={handleAbandon}
            disabled={busy}
            className="touch-target rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 active:scale-95 transition-all duration-200 cursor-pointer"
          >
            Abandonar
          </button>
        </div>
      </header>

      {rest && (
        <RestTimer seconds={rest.seconds} runId={rest.runId} onDone={() => setRest(null)} />
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {planExercises.map((pe) => (
        <ExerciseCard
          key={pe.id}
          exerciseId={pe.exerciseId}
          name={pe.exercise.name}
          target={`${pe.targetSets} × ${pe.targetReps}`}
          defaultReps={parseFirstInt(pe.targetReps, 10)}
          defaultWeight={toNum(pe.targetWeight)}
          restSeconds={pe.restSeconds}
          logs={session.logs.filter((l) => l.exerciseId === pe.exerciseId)}
          hint={hints[pe.exerciseId]}
          busy={busy}
          onLog={logSet}
          onDeleteSet={deleteSet}
        />
      ))}

      {extraCards.map((ex) => (
        <ExerciseCard
          key={ex.id}
          exerciseId={ex.id}
          name={ex.name}
          target="libre"
          defaultReps={10}
          defaultWeight={null}
          restSeconds={DEFAULT_REST}
          logs={session.logs.filter((l) => l.exerciseId === ex.id)}
          hint={hints[ex.id]}
          busy={busy}
          onLog={logSet}
          onDeleteSet={deleteSet}
        />
      ))}

      <button
        onClick={() => setModalOpen(true)}
        disabled={busy}
        className="touch-target rounded-xl border border-dashed border-brand-500/40 bg-brand-500/5 px-4 py-3.5 text-base font-bold text-brand-400 hover:bg-brand-500/10 active:scale-95 transition-all duration-200 cursor-pointer"
      >
        + Añadir ejercicio
      </button>

      {modalOpen && (
        <AddExerciseModal
          adding={busy}
          onPick={addExerciseToSession}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function describePrevious(best: PreviousBest | null): string {
  if (!best) return 'Sin marca previa';
  const w = best.weightKg != null ? `${best.weightKg} kg × ` : '';
  return `Marca previa: ${w}${best.reps}`;
}

// --- Tarjeta de un ejercicio con registro de series ---

interface ExerciseCardProps {
  exerciseId: string;
  name: string;
  target: string;
  defaultReps: number;
  defaultWeight: number | null;
  restSeconds: number;
  logs: WorkoutLog[];
  hint?: string;
  busy: boolean;
  onLog: (
    exerciseId: string,
    payload: { weightKg: number | null; reps: number; setNumber: number; restSeconds: number },
  ) => void;
  onDeleteSet: (logId: string) => void;
}

function ExerciseCard({
  exerciseId,
  name,
  target,
  defaultReps,
  defaultWeight,
  restSeconds,
  logs,
  hint,
  busy,
  onLog,
  onDeleteSet,
}: ExerciseCardProps) {
  const last = logs[logs.length - 1];
  const [weight, setWeight] = useState<string>(
    last?.weightKg != null ? String(last.weightKg) : defaultWeight != null ? String(defaultWeight) : '',
  );
  const [reps, setReps] = useState<string>(String(last?.reps ?? defaultReps));

  const setNumber = nextSetNumber(logs, exerciseId);

  function done() {
    onLog(exerciseId, {
      weightKg: toNum(weight),
      reps: Number(reps) || 0,
      setNumber,
      restSeconds,
    });
  }

  return (
    <section className="glass-card rounded-2xl p-5 border-l-4 border-l-brand-500 relative overflow-hidden">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-headline font-bold text-white text-base">{name}</h2>
        <span className="shrink-0 text-xs font-semibold text-slate-500">Objetivo: {target}</span>
      </div>

      {logs.length > 0 && (
        <ul className="mt-3.5 flex flex-col gap-1.5">
          {logs.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-xl bg-white/5 border border-white/5 px-3 py-2 text-sm text-slate-200"
            >
              <span>
                <span className="font-bold text-slate-400">Serie {l.setNumber}</span> ·{' '}
                {l.weightKg != null ? `${l.weightKg} kg × ` : ''}
                {l.reps} reps
              </span>
              <button
                onClick={() => onDeleteSet(l.id)}
                disabled={busy}
                aria-label={`Borrar serie ${l.setNumber}`}
                className="touch-target px-2 text-slate-500 hover:text-red-400 active:scale-95 disabled:opacity-40"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3.5">
        <Stepper label="Peso (kg)" value={weight} onChange={setWeight} step={2.5} min={0} />
        <Stepper label="Reps" value={reps} onChange={setReps} step={1} min={0} />
      </div>

      <button
        onClick={done}
        disabled={busy}
        className="touch-target mt-4 w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600 active:scale-95 transition-all shadow-[0_0_15px_rgba(47,127,255,0.3)] border border-white/10 cursor-pointer"
      >
        ✓ Serie {setNumber} hecha
      </button>

      {hint && <p className="mt-2.5 text-center text-xs font-semibold text-slate-500">{hint}</p>}
    </section>
  );
}

function Stepper({
  label,
  value,
  onChange,
  step,
  min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  min: number;
}) {
  function bump(delta: number) {
    const current = Number(value) || 0;
    const next = Math.max(min, Math.round((current + delta) * 100) / 100);
    onChange(String(next));
  }
  return (
    <div>
      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <div className="flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <button
          type="button"
          onClick={() => bump(-step)}
          aria-label={`Bajar ${label}`}
          className="touch-target px-3.5 text-xl font-bold text-slate-300 hover:bg-white/10 active:scale-95 transition-all"
        >
          −
        </button>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 border-x border-white/10 bg-transparent px-2 py-2.5 text-center text-base text-white outline-none focus:bg-brand-500/10"
        />
        <button
          type="button"
          onClick={() => bump(step)}
          aria-label={`Subir ${label}`}
          className="touch-target px-3.5 text-xl font-bold text-slate-300 hover:bg-white/10 active:scale-95 transition-all"
        >
          +
        </button>
      </div>
    </div>
  );
}
