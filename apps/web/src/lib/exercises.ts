import { api } from './api';

export interface Exercise {
  id: string;
  name: string;
  category: string;
  type: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  equipment?: string | null;
  description?: string | null;
  technique?: string | null;
  commonMistakes?: string | null;
  mainMuscles: string[];
  secondaryMuscles: string[];
  videoUrl?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface ExerciseFilters {
  category?: string;
  type?: string;
  level?: string;
  search?: string;
  page?: number;
  limit?: number;
}

const ORDER: (keyof ExerciseFilters)[] = ['category', 'type', 'level', 'search', 'page', 'limit'];

/** Construye el querystring de /exercises omitiendo valores vacíos. */
export function buildExerciseQuery(filters: ExerciseFilters): string {
  const params = new URLSearchParams();
  for (const key of ORDER) {
    const value = filters[key];
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function fetchExercises(filters: ExerciseFilters): Promise<Paginated<Exercise>> {
  return api.get<Paginated<Exercise>>(`/exercises${buildExerciseQuery(filters)}`);
}

export function fetchCategories(): Promise<Array<{ category: string; count: number }>> {
  return api.get('/exercises/categories');
}

export function fetchExercise(id: string): Promise<Exercise> {
  return api.get<Exercise>(`/exercises/${id}`);
}

export const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: 'Principiante',
  INTERMEDIATE: 'Intermedio',
  ADVANCED: 'Avanzado',
};
