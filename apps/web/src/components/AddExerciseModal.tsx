import { useEffect, useState } from 'react';
import { ApiRequestError } from '../lib/api';
import { fetchExercises, type Exercise } from '../lib/exercises';

interface Props {
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
  adding: boolean;
}

/** Modal de búsqueda para añadir un ejercicio a un día de la rutina. */
export default function AddExerciseModal({ onPick, onClose, adding }: Props) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchExercises({ search: debounced || undefined, limit: 20 })
      .then((res) => setItems(res.data))
      .catch((err) =>
        setError(err instanceof ApiRequestError ? err.message : 'No se pudieron cargar los ejercicios.'),
      )
      .finally(() => setLoading(false));
  }, [debounced]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Añadir ejercicio"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Añadir ejercicio</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="touch-target rounded-lg px-2 text-2xl leading-none text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        <input
          type="search"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ejercicio…"
          className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <ul className="mt-3 flex-1 overflow-y-auto">
          {loading ? (
            <li className="py-8 text-center text-slate-500">Cargando…</li>
          ) : items.length === 0 ? (
            <li className="py-8 text-center text-slate-500">No hay ejercicios que coincidan.</li>
          ) : (
            items.map((ex) => (
              <li key={ex.id}>
                <button
                  onClick={() => onPick(ex)}
                  disabled={adding}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-100 disabled:opacity-40"
                >
                  <span>
                    <span className="block font-medium text-slate-900">{ex.name}</span>
                    <span className="block text-sm capitalize text-slate-500">
                      {ex.category} · {ex.type}
                    </span>
                  </span>
                  <span className="shrink-0 text-brand-600">+</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
