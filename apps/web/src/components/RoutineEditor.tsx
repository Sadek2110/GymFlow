import { useEffect, useState } from 'react';
import { ApiRequestError } from '../lib/api';
import type { Exercise } from '../lib/exercises';
import {
  fetchRoutine,
  updateRoutine,
  activateRoutine,
  updateRoutineDay,
  addRoutineExercise,
  updateRoutineExercise,
  removeRoutineExercise,
  reorderRoutineExercises,
  moveInArray,
  summarizeDay,
  DAY_LABELS,
  DAY_SHORT,
  GOAL_LABEL,
  type RoutineDetail,
  type RoutineDay,
  type RoutineExerciseEntry,
} from '../lib/routines';
import AddExerciseModal from './AddExerciseModal';

export default function RoutineEditor({ id }: { id: string }) {
  const [routine, setRoutine] = useState<RoutineDetail | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  async function reload() {
    try {
      setRoutine(await fetchRoutine(id));
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        setError('Esta rutina no existe o no es tuya.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'No se pudo cargar la rutina.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Ejecuta una mutación mostrando estado de ocupado y refresca al terminar.
  async function run(fn: () => Promise<unknown>, refresh = true) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (refresh) await reload();
      return result;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'La operación no se pudo completar.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="py-10 text-center text-slate-500">Cargando…</p>;

  if (error && !routine) {
    return (
      <div className="py-10 text-center">
        <p className="text-slate-600">{error}</p>
        <a href="/routines" className="mt-3 inline-block text-sm font-semibold text-brand-600">
          ← Volver a rutinas
        </a>
      </div>
    );
  }
  if (!routine) return null;

  const day = routine.days.find((d) => d.dayOfWeek === selectedDay);

  function rename() {
    const next = window.prompt('Nuevo nombre de la rutina', routine!.name);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed.length < 2) return;
    void run(() => updateRoutine(id, { name: trimmed }));
  }

  async function addExercise(exercise: Exercise) {
    await run(() => addRoutineExercise(id, selectedDay, { exerciseId: exercise.id }));
    setModalOpen(false);
  }

  function reorder(index: number, direction: -1 | 1) {
    if (!day) return;
    const ids = day.exercises.map((e) => e.id);
    const next = moveInArray(ids, index, direction);
    if (next === ids) return; // borde: sin cambios
    void run(async () => setRoutine(await reorderRoutineExercises(id, selectedDay, next)), false);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <a href="/routines" className="text-sm font-semibold text-brand-600">
          ← Rutinas
        </a>
      </div>

      <header className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-slate-900">{routine.name}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {routine.goal ? GOAL_LABEL[routine.goal] : 'Sin objetivo'}
            </p>
          </div>
          {routine.isActive ? (
            <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
              Activa
            </span>
          ) : (
            <button
              onClick={() => run(() => activateRoutine(id))}
              disabled={busy}
              className="shrink-0 rounded-xl border border-brand-500 px-3 py-2 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-40"
            >
              Activar
            </button>
          )}
        </div>
        <button
          onClick={rename}
          disabled={busy}
          className="mt-3 text-sm font-medium text-slate-500 underline underline-offset-2 hover:text-slate-800 disabled:opacity-40"
        >
          Renombrar
        </button>
      </header>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Selector de días */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Días">
        {routine.days.map((d) => (
          <button
            key={d.dayOfWeek}
            role="tab"
            aria-selected={d.dayOfWeek === selectedDay}
            onClick={() => setSelectedDay(d.dayOfWeek)}
            className={`flex shrink-0 flex-col items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              d.dayOfWeek === selectedDay
                ? 'bg-brand-500 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>{DAY_SHORT[d.dayOfWeek]}</span>
            <span
              className={`mt-0.5 text-[10px] ${
                d.dayOfWeek === selectedDay ? 'text-white/80' : 'text-slate-400'
              }`}
            >
              {d.isRestDay ? 'Descanso' : d.exercises.length || '—'}
            </span>
          </button>
        ))}
      </div>

      {day && (
        <DayPanel
          key={day.id}
          day={day}
          busy={busy}
          onSaveDay={(patch) => run(() => updateRoutineDay(id, day.dayOfWeek, patch))}
          onAddClick={() => setModalOpen(true)}
          onReorder={reorder}
          onSaveExercise={(rdeId, patch) =>
            run(() => updateRoutineExercise(id, day.dayOfWeek, rdeId, patch))
          }
          onRemoveExercise={(rdeId) =>
            run(() => removeRoutineExercise(id, day.dayOfWeek, rdeId))
          }
        />
      )}

      {modalOpen && (
        <AddExerciseModal
          adding={busy}
          onPick={addExercise}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

// --- Panel del día seleccionado ---

interface DayPanelProps {
  day: RoutineDay;
  busy: boolean;
  onSaveDay: (patch: { title?: string; isRestDay?: boolean }) => void;
  onAddClick: () => void;
  onReorder: (index: number, direction: -1 | 1) => void;
  onSaveExercise: (rdeId: string, patch: Record<string, unknown>) => void;
  onRemoveExercise: (rdeId: string) => void;
}

function DayPanel({
  day,
  busy,
  onSaveDay,
  onAddClick,
  onReorder,
  onSaveExercise,
  onRemoveExercise,
}: DayPanelProps) {
  const [title, setTitle] = useState(day.title ?? '');

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {DAY_LABELS[day.dayOfWeek]}
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if ((day.title ?? '') !== title) onSaveDay({ title });
            }}
            placeholder="Título del día (p. ej. Pecho y tríceps)"
            maxLength={80}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={day.isRestDay}
              onChange={(e) => onSaveDay({ isRestDay: e.target.checked })}
              className="h-5 w-5 rounded border-slate-300 text-brand-500 focus:ring-brand-100"
            />
            Día de descanso
          </label>
        </div>
      </div>

      {day.isRestDay ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-500 shadow-sm">
          Día de descanso 💤
        </p>
      ) : (
        <>
          {day.exercises.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-center text-slate-500 shadow-sm">
              Sin ejercicios todavía.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {day.exercises.map((ex, index) => (
                <ExerciseRow
                  key={ex.id}
                  entry={ex}
                  index={index}
                  total={day.exercises.length}
                  busy={busy}
                  onReorder={onReorder}
                  onSave={onSaveExercise}
                  onRemove={onRemoveExercise}
                />
              ))}
            </ul>
          )}

          <button
            onClick={onAddClick}
            disabled={busy}
            className="touch-target rounded-xl border border-dashed border-brand-400 px-4 py-3 text-base font-semibold text-brand-600 transition-colors hover:bg-brand-50 disabled:opacity-40"
          >
            + Añadir ejercicio
          </button>
        </>
      )}
    </section>
  );
}

// --- Fila de un ejercicio con edición de objetivos ---

interface ExerciseRowProps {
  entry: RoutineExerciseEntry;
  index: number;
  total: number;
  busy: boolean;
  onReorder: (index: number, direction: -1 | 1) => void;
  onSave: (rdeId: string, patch: Record<string, unknown>) => void;
  onRemove: (rdeId: string) => void;
}

function ExerciseRow({ entry, index, total, busy, onReorder, onSave, onRemove }: ExerciseRowProps) {
  const [editing, setEditing] = useState(false);
  const [sets, setSets] = useState(String(entry.targetSets));
  const [reps, setReps] = useState(entry.targetReps);
  const [weight, setWeight] = useState(entry.targetWeight != null ? String(entry.targetWeight) : '');
  const [rest, setRest] = useState(String(entry.restSeconds));

  function save() {
    const patch: Record<string, unknown> = {
      targetSets: Number(sets) || 1,
      targetReps: reps.trim() || '8-12',
      restSeconds: Number(rest) || 0,
    };
    const w = weight.trim();
    if (w !== '') patch.targetWeight = Number(w);
    onSave(entry.id, patch);
    setEditing(false);
  }

  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-900">{entry.exercise.name}</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {entry.targetSets} × {entry.targetReps}
            {entry.targetWeight != null && ` · ${entry.targetWeight} kg`}
            {` · ${entry.restSeconds}s descanso`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center">
          <button
            onClick={() => onReorder(index, -1)}
            disabled={busy || index === 0}
            aria-label="Subir"
            className="touch-target px-2 text-lg leading-none text-slate-500 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            onClick={() => onReorder(index, 1)}
            disabled={busy || index === total - 1}
            aria-label="Bajar"
            className="touch-target px-2 text-lg leading-none text-slate-500 disabled:opacity-30"
          >
            ↓
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Series" value={sets} onChange={setSets} inputMode="numeric" />
          <Field label="Reps" value={reps} onChange={setReps} />
          <Field label="Peso (kg)" value={weight} onChange={setWeight} inputMode="decimal" />
          <Field label="Descanso (s)" value={rest} onChange={setRest} inputMode="numeric" />
          <div className="col-span-2 mt-1 flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="touch-target flex-1 rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
            >
              Guardar
            </button>
            <button
              onClick={() => setEditing(false)}
              className="touch-target rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setEditing(true)}
            disabled={busy}
            className="touch-target rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
          >
            Editar
          </button>
          <button
            onClick={() => onRemove(entry.id)}
            disabled={busy}
            className="touch-target rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            Quitar
          </button>
        </div>
      )}
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: 'numeric' | 'decimal';
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      <input
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}
