import { useEffect, useState } from 'react';
import { ApiRequestError } from '../lib/api';
import { fetchExercise, LEVEL_LABEL, type Exercise } from '../lib/exercises';
import ExerciseProgress from './ExerciseProgress';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-2 text-slate-700">{children}</div>
    </section>
  );
}

export default function ExerciseDetail({ id }: { id: string }) {
  const [ex, setEx] = useState<Exercise | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExercise(id)
      .then(setEx)
      .catch((err) => {
        if (err instanceof ApiRequestError && err.status === 404) {
          setError('Ese ejercicio no existe o fue retirado.');
        } else {
          setError(err instanceof ApiRequestError ? err.message : 'No se pudo cargar el ejercicio.');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="py-10 text-center text-slate-500">Cargando…</p>;

  if (error || !ex) {
    return (
      <div className="py-10 text-center">
        <p className="text-slate-600">{error ?? 'No encontrado.'}</p>
        <a href="/exercises" className="mt-3 inline-block text-sm font-semibold text-brand-600">
          ← Volver al repertorio
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <a href="/exercises" className="text-sm font-medium text-slate-500">← Ejercicios</a>

      <header>
        <h1 className="text-2xl font-bold text-slate-900">{ex.name}</h1>
        <p className="mt-1 text-sm capitalize text-slate-500">
          {ex.category} · {ex.type} · {LEVEL_LABEL[ex.level]}
          {ex.equipment ? ` · ${ex.equipment}` : ''}
        </p>
      </header>

      {ex.videoUrl && (
        <a
          href={ex.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="touch-target grid place-items-center rounded-xl bg-brand-500 px-6 py-3 font-semibold text-white hover:bg-brand-600"
        >
          ▶ Ver vídeo
        </a>
      )}

      {ex.description && <Section title="Descripción">{ex.description}</Section>}
      {ex.technique && <Section title="Técnica">{ex.technique}</Section>}
      {ex.commonMistakes && (
        <Section title="Errores comunes">{ex.commonMistakes}</Section>
      )}

      <Section title="Músculos principales">
        <div className="flex flex-wrap gap-2">
          {ex.mainMuscles.map((m) => (
            <span key={m} className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700">
              {m}
            </span>
          ))}
        </div>
      </Section>

      {ex.secondaryMuscles.length > 0 && (
        <Section title="Músculos secundarios">
          <div className="flex flex-wrap gap-2">
            {ex.secondaryMuscles.map((m) => (
              <span key={m} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {m}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Tu progreso">
        <ExerciseProgress exerciseId={ex.id} />
      </Section>
    </div>
  );
}
