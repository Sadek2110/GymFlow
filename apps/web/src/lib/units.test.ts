import { describe, it, expect } from 'vitest';
import { kgToLb, lbToKg, toDisplayWeight, toKg, formatWeight } from './units';

describe('units', () => {
  it('convierte kg a lb', () => {
    expect(kgToLb(100)).toBe(220.5);
    expect(kgToLb(0)).toBe(0);
  });

  it('convierte lb a kg', () => {
    expect(lbToKg(220.5)).toBe(100);
  });

  it('toDisplayWeight respeta las unidades del usuario', () => {
    expect(toDisplayWeight(80, 'kg')).toBe(80);
    expect(toDisplayWeight(80, 'lb')).toBe(176.4);
  });

  it('toKg normaliza siempre a kg antes de guardar', () => {
    expect(toKg(80, 'kg')).toBe(80);
    expect(toKg(176.4, 'lb')).toBe(80);
  });

  it('formatWeight añade la unidad', () => {
    expect(formatWeight(80, 'kg')).toBe('80 kg');
    expect(formatWeight(80, 'lb')).toBe('176.4 lb');
  });
});
