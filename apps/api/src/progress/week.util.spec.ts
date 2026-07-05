import { epley1rm, appDayOfWeek, startOfWeekMonday } from './week.util';

describe('epley1rm', () => {
  it('estima el 1RM con la fórmula de Epley: peso × (1 + reps/30)', () => {
    expect(epley1rm(60, 10)).toBe(80); // 60 * 1.3333 = 80.0
    expect(epley1rm(100, 5)).toBe(116.7); // 100 * 1.1667 = 116.7 (1 decimal)
    expect(epley1rm(50, 1)).toBe(51.7);
  });

  it('con 0 reps devuelve el propio peso', () => {
    expect(epley1rm(80, 0)).toBe(80);
  });

  it('con peso nulo devuelve 0', () => {
    expect(epley1rm(0, 10)).toBe(0);
  });
});

describe('appDayOfWeek', () => {
  // 0 = lunes … 6 = domingo (convención del proyecto).
  it('lunes es 0', () => {
    expect(appDayOfWeek(new Date(2024, 0, 1))).toBe(0); // 1-ene-2024 fue lunes
  });
  it('miércoles es 2', () => {
    expect(appDayOfWeek(new Date(2024, 0, 3))).toBe(2);
  });
  it('domingo es 6', () => {
    expect(appDayOfWeek(new Date(2024, 0, 7))).toBe(6); // 7-ene-2024 fue domingo
  });
});

describe('startOfWeekMonday', () => {
  it('devuelve el lunes 00:00 de la semana de la fecha dada', () => {
    const res = startOfWeekMonday(new Date(2024, 0, 3, 15, 30, 45)); // miércoles
    expect(res.getFullYear()).toBe(2024);
    expect(res.getMonth()).toBe(0);
    expect(res.getDate()).toBe(1); // lunes
    expect(res.getHours()).toBe(0);
    expect(res.getMinutes()).toBe(0);
    expect(res.getSeconds()).toBe(0);
  });

  it('un domingo cuenta como fin de esa misma semana (no salta a la siguiente)', () => {
    const res = startOfWeekMonday(new Date(2024, 0, 7, 23, 59)); // domingo
    expect(res.getDate()).toBe(1); // lunes anterior
  });

  it('un lunes se normaliza a su propia medianoche', () => {
    const res = startOfWeekMonday(new Date(2024, 0, 8, 9, 0)); // lunes
    expect(res.getDate()).toBe(8);
    expect(res.getHours()).toBe(0);
  });
});
