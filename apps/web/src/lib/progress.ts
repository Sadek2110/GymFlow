import { api } from './api';
import type { Goal } from './routines';

export interface TodayPlanExercise {
  id: string;
  exerciseId: string;
  order: number;
  targetSets: number;
  targetReps: string;
  targetWeight: string | number | null;
  restSeconds: number;
  exercise: { id: string; name: string; category: string; imageUrl?: string | null };
}

export interface Overview {
  today: {
    dayOfWeek: number;
    routineId: string;
    routineDayId: string;
    title: string | null;
    isRestDay: boolean;
    exercises: TodayPlanExercise[];
  } | null;
  activeRoutine: { id: string; name: string } | null;
  week: { completed: number; target: number; weekStart: string };
  lastWeightKg: number | null;
  lastSession: { id: string; date: string; status: string } | null;
  activeSession: { id: string; routineDayId: string | null; date: string } | null;
}

export interface RecordEntry {
  exerciseId: string;
  exerciseName: string;
  weightKg: number;
  reps: number;
  date: string;
  e1rm: number;
}

export interface SeriesPoint {
  sessionId: string;
  date: string;
  weightKg: number;
  reps: number;
  e1rm: number;
}

export interface WeeklySummary {
  weekStart: string;
  daysTrained: number;
  target: number;
  totalVolume: number;
  sessions: number;
}

export const GOAL_LABEL_SHORT: Partial<Record<Goal, string>> = {
  HYPERTROPHY: 'Hipertrofia',
  STRENGTH: 'Fuerza',
};

// --- Helpers puros (testeables) ---

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Genera los `points` de una polyline SVG escalando los valores entre su min y max. */
export function sparklinePoints(values: number[], width = 100, height = 30, pad = 2): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1; // evita dividir por cero con valores constantes
  const n = values.length;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  return values
    .map((v, i) => {
      const x = n === 1 ? width / 2 : pad + (i / (n - 1)) * innerW;
      const y = pad + innerH - ((v - min) / range) * innerH;
      return `${round(x)},${round(y)}`;
    })
    .join(' ');
}

/** stroke-dasharray para un anillo de progreso: parte visible según completed/target. */
export function ringDash(completed: number, target: number, circumference: number): string {
  const fraction = target > 0 ? Math.min(1, completed / target) : 0;
  return `${round(circumference * fraction)} ${round(circumference)}`;
}

// --- Cliente API de progreso (guía §5.6) ---

export const fetchOverview = () => api.get<Overview>('/progress/overview');
export const fetchRecords = () => api.get<RecordEntry[]>('/progress/records');
export const fetchExerciseSeries = (exerciseId: string) =>
  api.get<SeriesPoint[]>(`/progress/exercises/${exerciseId}`);
export const fetchWeekly = (weekStart?: string) =>
  api.get<WeeklySummary>(`/progress/weekly${weekStart ? `?weekStart=${weekStart}` : ''}`);
