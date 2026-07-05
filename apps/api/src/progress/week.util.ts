/**
 * Utilidades puras de fechas y estimación de 1RM para el módulo de progreso.
 * Se mantienen aparte del servicio para poder probarlas de forma determinista.
 */

/** 1RM estimado con la fórmula de Epley: peso × (1 + reps/30). Redondeado a 1 decimal. */
export function epley1rm(weightKg: number, reps: number): number {
  if (!weightKg) return 0;
  const value = weightKg * (1 + reps / 30);
  return Math.round(value * 10) / 10;
}

/** Día de la semana en la convención del proyecto: 0 = lunes … 6 = domingo. */
export function appDayOfWeek(date: Date): number {
  // getDay(): 0 = domingo … 6 = sábado → desplazamos para que lunes sea 0.
  return (date.getDay() + 6) % 7;
}

/** Lunes 00:00 (hora local) de la semana a la que pertenece la fecha. */
export function startOfWeekMonday(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - appDayOfWeek(date));
  result.setHours(0, 0, 0, 0);
  return result;
}
