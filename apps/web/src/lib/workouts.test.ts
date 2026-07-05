import { describe, it, expect } from 'vitest';
import { formatClock, nextSetNumber, groupByExercise } from './workouts';

describe('formatClock', () => {
  it('formatea minutos y segundos con relleno', () => {
    expect(formatClock(90)).toBe('1:30');
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(600)).toBe('10:00');
  });

  it('nunca devuelve negativos', () => {
    expect(formatClock(-10)).toBe('0:00');
  });
});

describe('nextSetNumber', () => {
  it('empieza en 1 cuando no hay series de ese ejercicio', () => {
    expect(nextSetNumber([], 'e1')).toBe(1);
    expect(nextSetNumber([{ exerciseId: 'e2', setNumber: 3 }], 'e1')).toBe(1);
  });

  it('devuelve el máximo setNumber del ejercicio + 1', () => {
    const logs = [
      { exerciseId: 'e1', setNumber: 1 },
      { exerciseId: 'e1', setNumber: 2 },
      { exerciseId: 'e2', setNumber: 5 },
    ];
    expect(nextSetNumber(logs, 'e1')).toBe(3);
    expect(nextSetNumber(logs, 'e2')).toBe(6);
  });
});

describe('groupByExercise', () => {
  it('agrupa las series por ejercicio conservando el orden de aparición', () => {
    const logs = [
      { exerciseId: 'e1', setNumber: 1 },
      { exerciseId: 'e2', setNumber: 1 },
      { exerciseId: 'e1', setNumber: 2 },
    ];
    const groups = groupByExercise(logs);
    expect(groups.map((g) => g.exerciseId)).toEqual(['e1', 'e2']);
    expect(groups[0].logs).toHaveLength(2);
    expect(groups[1].logs).toHaveLength(1);
  });

  it('devuelve vacío sin series', () => {
    expect(groupByExercise([])).toEqual([]);
  });
});
