import { describe, it, expect } from 'vitest';
import { sparklinePoints, ringDash } from './progress';

describe('sparklinePoints', () => {
  it('devuelve cadena vacía sin datos', () => {
    expect(sparklinePoints([], 100, 30)).toBe('');
  });

  it('mapea valores a coordenadas escalando entre min y max', () => {
    // v=0 → abajo (y=alto); v=10 → arriba (y=0). Sin padding.
    expect(sparklinePoints([0, 10], 100, 30, 0)).toBe('0,30 100,0');
  });

  it('un único punto se centra horizontalmente', () => {
    expect(sparklinePoints([5], 100, 30, 0)).toBe('50,30');
  });

  it('valores constantes quedan a media altura (sin división por cero)', () => {
    expect(sparklinePoints([7, 7, 7], 100, 30, 0)).toBe('0,30 50,30 100,30');
  });
});

describe('ringDash', () => {
  it('sin progreso el trazo visible es 0', () => {
    expect(ringDash(0, 5, 100)).toBe('0 100');
  });

  it('a mitad de objetivo, la mitad del trazo', () => {
    expect(ringDash(2, 4, 100)).toBe('50 100');
  });

  it('nunca supera el 100% aunque se superen las sesiones objetivo', () => {
    expect(ringDash(9, 4, 100)).toBe('100 100');
  });

  it('objetivo 0 no divide por cero', () => {
    expect(ringDash(1, 0, 100)).toBe('0 100');
  });
});
