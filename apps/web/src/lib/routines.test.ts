import { describe, it, expect } from 'vitest';
import { moveInArray, DAY_LABELS, GOAL_LABEL, summarizeDay } from './routines';

describe('moveInArray', () => {
  it('mueve un elemento hacia arriba intercambiándolo con el anterior', () => {
    expect(moveInArray(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
  });

  it('mueve un elemento hacia abajo intercambiándolo con el siguiente', () => {
    expect(moveInArray(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('no hace nada si se sube el primero', () => {
    expect(moveInArray(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
  });

  it('no hace nada si se baja el último', () => {
    expect(moveInArray(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('no muta el array original', () => {
    const original = ['a', 'b'];
    moveInArray(original, 0, 1);
    expect(original).toEqual(['a', 'b']);
  });
});

describe('DAY_LABELS', () => {
  it('empieza en lunes y termina en domingo (índices 0..6)', () => {
    expect(DAY_LABELS).toHaveLength(7);
    expect(DAY_LABELS[0]).toBe('Lunes');
    expect(DAY_LABELS[6]).toBe('Domingo');
  });
});

describe('GOAL_LABEL', () => {
  it('traduce los objetivos a español', () => {
    expect(GOAL_LABEL.HYPERTROPHY).toBe('Hipertrofia');
    expect(GOAL_LABEL.STRENGTH).toBe('Fuerza');
  });
});

describe('summarizeDay', () => {
  it('describe un día de descanso', () => {
    expect(summarizeDay({ isRestDay: true, exercises: [] } as any)).toBe('Descanso');
  });

  it('describe un día vacío', () => {
    expect(summarizeDay({ isRestDay: false, exercises: [] } as any)).toBe('Sin ejercicios');
  });

  it('cuenta los ejercicios en singular y plural', () => {
    expect(summarizeDay({ isRestDay: false, exercises: [{}] } as any)).toBe('1 ejercicio');
    expect(summarizeDay({ isRestDay: false, exercises: [{}, {}] } as any)).toBe('2 ejercicios');
  });
});
