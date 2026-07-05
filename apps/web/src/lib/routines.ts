import { api } from './api';

export type Goal = 'HYPERTROPHY' | 'FAT_LOSS' | 'STRENGTH' | 'ENDURANCE' | 'STAY_FIT';

export interface RoutineSummary {
  id: string;
  name: string;
  goal: Goal | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoutineExerciseEntry {
  id: string;
  exerciseId: string;
  order: number;
  targetSets: number;
  targetReps: string;
  targetWeight: string | number | null;
  restSeconds: number;
  exercise: {
    id: string;
    name: string;
    category: string;
    type: string;
    level: string;
    equipment?: string | null;
    imageUrl?: string | null;
    videoUrl?: string | null;
    mainMuscles: string[];
  };
}

export interface RoutineDay {
  id: string;
  routineId: string;
  dayOfWeek: number;
  title: string | null;
  isRestDay: boolean;
  exercises: RoutineExerciseEntry[];
}

export interface RoutineDetail extends RoutineSummary {
  days: RoutineDay[];
}

export interface AddExerciseInput {
  exerciseId: string;
  targetSets?: number;
  targetReps?: string;
  targetWeight?: number;
  restSeconds?: number;
}

export type UpdateExerciseInput = Omit<AddExerciseInput, 'exerciseId'>;

// 0 = lunes … 6 = domingo (guía §4).
export const DAY_LABELS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

export const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

export const GOAL_LABEL: Record<Goal, string> = {
  HYPERTROPHY: 'Hipertrofia',
  FAT_LOSS: 'Pérdida de grasa',
  STRENGTH: 'Fuerza',
  ENDURANCE: 'Resistencia',
  STAY_FIT: 'Mantenerse en forma',
};

export const GOAL_OPTIONS: Array<{ value: Goal; label: string }> = (
  Object.keys(GOAL_LABEL) as Goal[]
).map((value) => ({ value, label: GOAL_LABEL[value] }));

/** Intercambia el elemento `index` con su vecino según la dirección (-1 arriba, +1 abajo). Puro, no muta. */
export function moveInArray<T>(arr: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= arr.length) return arr;
  const copy = [...arr];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

/** Resumen legible del contenido de un día para la lista de pestañas. */
export function summarizeDay(day: Pick<RoutineDay, 'isRestDay' | 'exercises'>): string {
  if (day.isRestDay) return 'Descanso';
  const n = day.exercises.length;
  if (n === 0) return 'Sin ejercicios';
  return `${n} ${n === 1 ? 'ejercicio' : 'ejercicios'}`;
}

// --- Cliente API de rutinas (guía §5.4) ---

export const fetchRoutines = () => api.get<RoutineSummary[]>('/routines');

export const fetchRoutine = (id: string) => api.get<RoutineDetail>(`/routines/${id}`);

export const createRoutine = (body: { name: string; goal?: Goal }) =>
  api.post<RoutineDetail>('/routines', body);

export const updateRoutine = (id: string, body: { name?: string; goal?: Goal }) =>
  api.patch<RoutineDetail>(`/routines/${id}`, body);

export const deleteRoutine = (id: string) => api.del<void>(`/routines/${id}`);

export const activateRoutine = (id: string) =>
  api.post<RoutineDetail>(`/routines/${id}/activate`);

export const duplicateRoutine = (id: string) =>
  api.post<RoutineDetail>(`/routines/${id}/duplicate`);

export const updateRoutineDay = (
  id: string,
  dayOfWeek: number,
  body: { title?: string; isRestDay?: boolean },
) => api.patch<RoutineDay>(`/routines/${id}/days/${dayOfWeek}`, body);

export const addRoutineExercise = (id: string, dayOfWeek: number, body: AddExerciseInput) =>
  api.post<RoutineExerciseEntry>(`/routines/${id}/days/${dayOfWeek}/exercises`, body);

export const updateRoutineExercise = (
  id: string,
  dayOfWeek: number,
  rdeId: string,
  body: UpdateExerciseInput,
) =>
  api.patch<RoutineExerciseEntry>(
    `/routines/${id}/days/${dayOfWeek}/exercises/${rdeId}`,
    body,
  );

export const removeRoutineExercise = (id: string, dayOfWeek: number, rdeId: string) =>
  api.del<void>(`/routines/${id}/days/${dayOfWeek}/exercises/${rdeId}`);

export const reorderRoutineExercises = (
  id: string,
  dayOfWeek: number,
  orderedIds: string[],
) =>
  api.patch<RoutineDetail>(`/routines/${id}/days/${dayOfWeek}/exercises/reorder`, {
    orderedIds,
  });
