import { describe, it, expect } from 'vitest';
import { buildExerciseQuery } from './exercises';

describe('buildExerciseQuery', () => {
  it('devuelve cadena vacía sin filtros', () => {
    expect(buildExerciseQuery({})).toBe('');
  });

  it('omite valores vacíos, nulos o indefinidos', () => {
    expect(buildExerciseQuery({ category: '', search: undefined, type: '' })).toBe('');
  });

  it('serializa filtros en orden determinista', () => {
    expect(buildExerciseQuery({ category: 'pecho', search: 'press', page: 2 })).toBe(
      '?category=pecho&search=press&page=2',
    );
  });

  it('incluye tipo, nivel y límite', () => {
    expect(buildExerciseQuery({ type: 'gym', level: 'BEGINNER', limit: 10 })).toBe(
      '?type=gym&level=BEGINNER&limit=10',
    );
  });

  it('codifica caracteres especiales en la búsqueda', () => {
    expect(buildExerciseQuery({ search: 'press banca' })).toBe('?search=press+banca');
  });
});
