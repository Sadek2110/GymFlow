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
  BEGINNER: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400',
  INTERMEDIATE: 'bg-amber-500/10 border border-amber-500/20 text-amber-400',
  ADVANCED: 'bg-red-500/10 border border-red-500/20 text-red-400',
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
        <h1 className="font-headline text-3xl font-bold text-white tracking-tight">Ejercicios</h1>
        <p className="text-sm text-slate-400 mt-1">Explora el repertorio y aprende la técnica.</p>
      </header>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar (p. ej. press banca)"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
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
        <p role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-slate-500 font-semibold">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-slate-500 font-semibold">No hay ejercicios que coincidan.</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {items.map((ex) => (
            <li key={ex.id}>
              <a
                href={`/exercises/${ex.id}`}
                className="block glass-card p-4 rounded-2xl transition hover:scale-[1.01] duration-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-headline font-bold text-white text-base">{ex.name}</h2>
                    <p className="mt-1 text-xs capitalize text-slate-400 font-semibold">
                      {ex.category} · {ex.type}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold border ${LEVEL_BADGE[ex.level]}`}
                  >
                    {LEVEL_LABEL[ex.level]}
                  </span>
                </div>
                {ex.mainMuscles.length > 0 && (
                  <p className="mt-2 text-xs text-slate-500 font-semibold">{ex.mainMuscles.join(', ')}</p>
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
            className="touch-target rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10 active:scale-95 disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-sm text-slate-400 font-semibold">
            Página {meta.page} de {meta.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            disabled={page >= meta.totalPages}
            className="touch-target rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10 active:scale-95 disabled:opacity-40"
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
      className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold capitalize transition-all duration-200 cursor-pointer ${
        active 
          ? 'bg-brand-500 text-white shadow-[0_0_12px_rgba(47,127,255,0.3)] border border-brand-500' 
          : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}
