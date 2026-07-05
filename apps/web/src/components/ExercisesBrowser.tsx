import { useEffect, useMemo, useState } from 'react';
import { ApiRequestError } from '../lib/api';
import {
  fetchExercises,
  fetchCategories,
  LEVEL_LABEL,
  type Exercise,
  type Paginated,
} from '../lib/exercises';

const LEVEL_BADGE: Record<string, string> = {
  BEGINNER: 'bg-green-100 text-green-700',
  INTERMEDIATE: 'bg-amber-100 text-amber-700',
  ADVANCED: 'bg-red-100 text-red-700',
};

export default function ExercisesBrowser() {
  const [categories, setCategories] = useState<Array<{ category: string; count: number }>>([]);
  const [category, setCategory] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Paginated<Exercise> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  // Debounce de la búsqueda para no lanzar una petición por tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, category]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchExercises({ category: category || undefined, search: debounced || undefined, page, limit: 20 })
      .then(setResult)
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : 'No se pudieron cargar los ejercicios.'),
      )
      .finally(() => setLoading(false));
  }, [category, debounced, page]);

  const meta = result?.meta;
  const items = useMemo(() => result?.data ?? [], [result]);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Ejercicios</h1>
        <p className="text-sm text-slate-500">Explora el repertorio y aprende la técnica.</p>
      </header>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar (p. ej. press banca)"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <Chip active={category === ''} onClick={() => setCategory('')} label="Todos" />
        {categories.map((c) => (
          <Chip
            key={c.category}
            active={category === c.category}
            onClick={() => setCategory(c.category)}
            label={`${c.category} (${c.count})`}
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-slate-500">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-slate-500">No hay ejercicios que coincidan.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((ex) => (
            <li key={ex.id}>
              <a
                href={`/exercises/${ex.id}`}
                className="block rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">{ex.name}</h2>
                    <p className="mt-0.5 text-sm capitalize text-slate-500">
                      {ex.category} · {ex.type}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${LEVEL_BADGE[ex.level]}`}
                  >
                    {LEVEL_LABEL[ex.level]}
                  </span>
                </div>
                {ex.mainMuscles.length > 0 && (
                  <p className="mt-2 text-xs text-slate-400">{ex.mainMuscles.join(', ')}</p>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="touch-target rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-sm text-slate-500">
            Página {meta.page} de {meta.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            disabled={page >= meta.totalPages}
            className="touch-target rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium capitalize transition-colors ${
        active ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );
}
