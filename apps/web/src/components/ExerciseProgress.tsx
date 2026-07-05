import { useEffect, useState } from 'react';
import { fetchExerciseSeries, sparklinePoints, type SeriesPoint } from '../lib/progress';

/** Mini-gráfica del e1RM estimado por sesión para un ejercicio (guía §6.2). */
export default function ExerciseProgress({ exerciseId }: { exerciseId: string }) {
  const [series, setSeries] = useState<SeriesPoint[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchExerciseSeries(exerciseId)
      .then(setSeries)
      .catch(() => setError(true));
  }, [exerciseId]);

  if (error) return null;
  if (!series) return <p className="text-sm text-slate-400">Cargando progreso…</p>;

  if (series.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Aún no has entrenado este ejercicio. Aparecerá aquí tras tu primera sesión.
      </p>
    );
  }

  const e1rms = series.map((s) => s.e1rm);
  const points = sparklinePoints(e1rms, 300, 80, 6);
  const best = Math.max(...e1rms);
  const latest = series[series.length - 1];

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">e1RM estimado (última)</p>
          <p className="text-2xl font-bold text-slate-900">{latest.e1rm} kg</p>
        </div>
        <p className="text-sm text-slate-500">Mejor: {best} kg</p>
      </div>

      <svg viewBox="0 0 300 80" className="mt-3 h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Evolución del e1RM">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-brand-500"
        />
      </svg>

      <p className="mt-1 text-center text-xs text-slate-400">
        {series.length} {series.length === 1 ? 'sesión' : 'sesiones'} registradas
      </p>
    </div>
  );
}
