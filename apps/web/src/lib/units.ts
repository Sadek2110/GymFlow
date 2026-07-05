export type Units = 'kg' | 'lb';

const KG_PER_LB = 0.45359237;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** En la DB los pesos SIEMPRE están en kg; la conversión vive en el frontend. */
export function kgToLb(kg: number): number {
  return round1(kg / KG_PER_LB);
}

export function lbToKg(lb: number): number {
  return round1(lb * KG_PER_LB);
}

/** Convierte un peso en kg (fuente de verdad) al valor que ve el usuario. */
export function toDisplayWeight(kg: number, units: Units): number {
  return units === 'lb' ? kgToLb(kg) : round1(kg);
}

/** Normaliza un valor introducido por el usuario a kg para persistirlo. */
export function toKg(value: number, units: Units): number {
  return units === 'lb' ? lbToKg(value) : round1(value);
}

export function formatWeight(kg: number, units: Units): string {
  return `${toDisplayWeight(kg, units)} ${units}`;
}
