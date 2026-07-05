import { api } from './api';
import type { Paginated } from './exercises';

export type WorkoutStatus = 'in_progress' | 'completed' | 'abandoned';

export interface WorkoutExerciseRef {
  id: string;
  name: string;
  category: string;
  type: string;
  imageUrl?: string | null;
}

export interface WorkoutLog {
  id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  weightKg: string | number | null;
  reps: number;
  rpe: number | null;
  restSeconds: number | null;
  notes: string | null;
  exercise?: WorkoutExerciseRef;
}

export interface PlanExercise {
  id: string;
  exerciseId: string;
  order: number;
  targetSets: number;
  targetReps: string;
  targetWeight: string | number | null;
  restSeconds: number;
  exercise: WorkoutExerciseRef;
}

export interface WorkoutPlan {
  id: string;
  dayOfWeek: number;
  title: string | null;
  isRestDay: boolean;
  exercises: PlanExercise[];
}

export interface WorkoutSession {
  id: string;
  userId: string;
  routineId: string | null;
  routineDayId: string | null;
  date: string;
  status: WorkoutStatus;
  notes: string | null;
  finishedAt: string | null;
  logs: WorkoutLog[];
  plan?: WorkoutPlan | null;
  _count?: { logs: number };
}

export interface PreviousBest {
  weightKg: number | null;
  reps: number;
}

export interface AddLogInput {
  exerciseId: string;
  setNumber: number;
  weightKg?: number;
  reps: number;
  rpe?: number;
  restSeconds?: number;
  notes?: string;
}

export interface AddLogResult {
  log: WorkoutLog;
  previousBest: PreviousBest | null;
}

// --- Helpers puros (testeables) ---

/** Segundos → "M:SS" (cronómetro de descanso). Nunca negativo. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Siguiente número de serie para un ejercicio a partir de las series ya registradas. */
export function nextSetNumber(
  logs: Array<{ exerciseId: string; setNumber: number }>,
  exerciseId: string,
): number {
  const forEx = logs.filter((l) => l.exerciseId === exerciseId);
  if (forEx.length === 0) return 1;
  return Math.max(...forEx.map((l) => l.setNumber)) + 1;
}

/** Agrupa series por ejercicio conservando el orden de aparición. */
export function groupByExercise<T extends { exerciseId: string }>(
  logs: T[],
): Array<{ exerciseId: string; logs: T[] }> {
  const map = new Map<string, T[]>();
  for (const log of logs) {
    const arr = map.get(log.exerciseId) ?? [];
    arr.push(log);
    map.set(log.exerciseId, arr);
  }
  return [...map.entries()].map(([exerciseId, entries]) => ({ exerciseId, logs: entries }));
}

// --- Cliente API de entrenamientos (guía §5.5) ---

export const startWorkout = (body: { routineDayId?: string } = {}) =>
  api.post<WorkoutSession>('/workouts/start', body);

export const getActiveWorkout = () => api.get<WorkoutSession | null>('/workouts/active');

export const fetchWorkout = (id: string) => api.get<WorkoutSession>(`/workouts/${id}`);

export const fetchWorkouts = (query = '') =>
  api.get<Paginated<WorkoutSession>>(`/workouts${query}`);

export const addWorkoutLog = (sessionId: string, body: AddLogInput) =>
  api.post<AddLogResult>(`/workouts/${sessionId}/logs`, body);

export const updateWorkoutLog = (
  sessionId: string,
  logId: string,
  body: Partial<Omit<AddLogInput, 'exerciseId'>>,
) => api.patch<WorkoutLog>(`/workouts/${sessionId}/logs/${logId}`, body);

export const removeWorkoutLog = (sessionId: string, logId: string) =>
  api.del<void>(`/workouts/${sessionId}/logs/${logId}`);

export const finishWorkout = (sessionId: string, body: { notes?: string } = {}) =>
  api.post<WorkoutSession>(`/workouts/${sessionId}/finish`, body);

export const abandonWorkout = (sessionId: string) =>
  api.post<WorkoutSession>(`/workouts/${sessionId}/abandon`);
