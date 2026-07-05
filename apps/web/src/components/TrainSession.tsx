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

  if (loading) return <p className="py-10 text-center text-slate-500">Cargando…</p>;

  if (finished) {
    const sets = finished.logs.length;
    return (
      <div className="py-10 text-center">
        <p className="text-5xl">🎉</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">¡Entrenamiento completado!</h1>
        <p className="mt-1 text-slate-500">
          {sets} {sets === 1 ? 'serie registrada' : 'series registradas'}.
        </p>
        <a
          href="/dashboard"
          className="mt-6 inline-block rounded-xl bg-brand-500 px-5 py-3 text-base font-semibold text-white hover:bg-brand-600"
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
          <h1 className="text-2xl font-bold text-slate-900">Entrenar</h1>
          <p className="text-sm text-slate-500">No tienes ningún entrenamiento en curso.</p>
        </header>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          onClick={startFree}
          disabled={busy}
          className="touch-target rounded-2xl bg-brand-500 px-4 py-4 text-lg font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
        >
          Empezar entrenamiento libre
        </button>
        <p className="text-center text-sm text-slate-400">
          Para entrenar tu rutina de hoy, entra desde <a href="/routines" className="text-brand-600">Rutinas</a>.
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
      <header className="rounded-2xl bg-white p-4 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">
          {session.plan?.title || 'Entrenamiento libre'}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {totalSets} {totalSets === 1 ? 'serie' : 'series'} · en curso
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleFinish}
            disabled={busy}
            className="touch-target flex-1 rounded-xl bg-green-600 px-4 py-3 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-40"
          >
            ✓ Finalizar
          </button>
          <button
            onClick={handleAbandon}
            disabled={busy}
            className="touch-target rounded-xl border border-slate-300 px-4 py-3 text-base font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            Abandonar
          </button>
        </div>
      </header>

      {rest && (
        <RestTimer seconds={rest.seconds} runId={rest.runId} onDone={() => setRest(null)} />
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
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
        className="touch-target rounded-xl border border-dashed border-brand-400 px-4 py-3 text-base font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-40"
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
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{name}</h2>
        <span className="shrink-0 text-sm text-slate-400">Objetivo: {target}</span>
      </div>

      {logs.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {logs.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <span className="text-slate-700">
                <span className="font-medium">Serie {l.setNumber}</span> ·{' '}
                {l.weightKg != null ? `${l.weightKg} kg × ` : ''}
                {l.reps} reps
              </span>
              <button
                onClick={() => onDeleteSet(l.id)}
                disabled={busy}
                aria-label={`Borrar serie ${l.setNumber}`}
                className="touch-target px-2 text-slate-400 hover:text-red-600 disabled:opacity-40"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stepper label="Peso (kg)" value={weight} onChange={setWeight} step={2.5} min={0} />
        <Stepper label="Reps" value={reps} onChange={setReps} step={1} min={0} />
      </div>

      <button
        onClick={done}
        disabled={busy}
        className="touch-target mt-3 w-full rounded-xl bg-brand-500 px-4 py-3 text-base font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
      >
        ✓ Serie {setNumber} hecha
      </button>

      {hint && <p className="mt-2 text-center text-xs text-slate-400">{hint}</p>}
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
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <div className="flex items-stretch overflow-hidden rounded-xl border border-slate-300">
        <button
          type="button"
          onClick={() => bump(-step)}
          aria-label={`Bajar ${label}`}
          className="touch-target px-3 text-xl font-bold text-slate-500 hover:bg-slate-100"
        >
          −
        </button>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 border-x border-slate-200 px-2 py-2.5 text-center text-base outline-none focus:bg-brand-50"
        />
        <button
          type="button"
          onClick={() => bump(step)}
          aria-label={`Subir ${label}`}
          className="touch-target px-3 text-xl font-bold text-slate-500 hover:bg-slate-100"
        >
          +
        </button>
      </div>
    </div>
  );
}
