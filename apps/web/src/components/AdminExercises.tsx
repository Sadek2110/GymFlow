import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiRequestError } from '../lib/api';
import { fetchExercises, type Exercise } from '../lib/exercises';

interface FormState {
  id?: string;
  name: string;
  category: string;
  type: string;
  level: string;
  equipment: string;
  description: string;
  mainMuscles: string;
  secondaryMuscles: string;
  videoUrl: string;
}

const EMPTY: FormState = {
  name: '',
  category: '',
  type: 'gym',
  level: 'BEGINNER',
  equipment: '',
  description: '',
  mainMuscles: '',
  secondaryMuscles: '',
  videoUrl: '',
};

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500';

function toList(csv: string): string[] {
  return csv.split(',').map((s) => s.trim()).filter(Boolean);
}

export default function AdminExercises() {
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<Exercise[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadList() {
    const res = await fetchExercises({ limit: 100 });
    setItems(res.data);
  }

  useEffect(() => {
    api
      .get<{ role: string }>('/users/me')
      .then(async (me) => {
        setRole(me.role);
        if (me.role === 'ADMIN') await loadList();
      })
      .catch(() => setRole('UNKNOWN'))
      .finally(() => setLoading(false));
  }, []);

  function edit(ex: Exercise) {
    setForm({
      id: ex.id,
      name: ex.name,
      category: ex.category,
      type: ex.type,
      level: ex.level,
      equipment: ex.equipment ?? '',
      description: ex.description ?? '',
      mainMuscles: ex.mainMuscles.join(', '),
      secondaryMuscles: ex.secondaryMuscles.join(', '),
      videoUrl: ex.videoUrl ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      category: form.category,
      type: form.type,
      level: form.level,
      equipment: form.equipment || undefined,
      description: form.description || undefined,
      mainMuscles: toList(form.mainMuscles),
      secondaryMuscles: toList(form.secondaryMuscles),
      videoUrl: form.videoUrl || undefined,
    };
    try {
      if (form.id) {
        await api.patch(`/exercises/${form.id}`, payload);
      } else {
        await api.post('/exercises', payload);
      }
      setForm(EMPTY);
      await loadList();
    } catch (err) {
      const msg =
        err instanceof ApiRequestError
          ? Array.isArray(err.body?.message)
            ? err.body?.message.join('. ')
            : err.body?.message
          : 'No se pudo guardar.';
      setError(msg ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Retirar este ejercicio? (soft delete, no borra historiales)')) return;
    try {
      await api.del(`/exercises/${id}`);
      await loadList();
    } catch {
      setError('No se pudo retirar el ejercicio.');
    }
  }

  if (loading) return <p className="py-10 text-center text-slate-500">Cargando…</p>;

  if (role !== 'ADMIN') {
    return (
      <div className="py-16 text-center">
        <h1 className="text-xl font-bold text-slate-800">Acceso restringido</h1>
        <p className="mt-2 text-sm text-slate-500">Esta sección es solo para administradores.</p>
        <a href="/dashboard" className="mt-3 inline-block text-sm font-semibold text-brand-600">
          ← Volver
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Admin · Ejercicios</h1>
        <a href="/dashboard" className="text-sm text-slate-500">← Salir</a>
      </header>

      <form onSubmit={submit} className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="col-span-2 font-semibold text-slate-800">
          {form.id ? 'Editar ejercicio' : 'Nuevo ejercicio'}
        </h2>
        <input className={input} placeholder="Nombre" value={form.name} required
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={input} placeholder="Categoría (pecho, espalda…)" value={form.category} required
          onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="gym">gym</option>
          <option value="calistenia">calistenia</option>
          <option value="crossfit">crossfit</option>
          <option value="cardio">cardio</option>
        </select>
        <select className={input} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
          <option value="BEGINNER">Principiante</option>
          <option value="INTERMEDIATE">Intermedio</option>
          <option value="ADVANCED">Avanzado</option>
        </select>
        <input className={input} placeholder="Equipamiento" value={form.equipment}
          onChange={(e) => setForm({ ...form, equipment: e.target.value })} />
        <input className={input} placeholder="Vídeo (URL)" value={form.videoUrl}
          onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} />
        <input className={`${input} col-span-2`} placeholder="Músculos principales (separados por coma)"
          value={form.mainMuscles} onChange={(e) => setForm({ ...form, mainMuscles: e.target.value })} />
        <input className={`${input} col-span-2`} placeholder="Músculos secundarios (separados por coma)"
          value={form.secondaryMuscles} onChange={(e) => setForm({ ...form, secondaryMuscles: e.target.value })} />
        <textarea className={`${input} col-span-2`} placeholder="Descripción" rows={2}
          value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
        <div className="col-span-2 flex gap-2">
          <button type="submit" disabled={saving}
            className="rounded-lg bg-brand-500 px-5 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
            {saving ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Crear'}
          </button>
          {form.id && (
            <button type="button" onClick={() => setForm(EMPTY)}
              className="rounded-lg border border-slate-300 px-5 py-2 text-slate-600">
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Categoría</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((ex) => (
              <tr key={ex.id}>
                <td className="px-4 py-2 font-medium text-slate-800">{ex.name}</td>
                <td className="px-4 py-2 capitalize text-slate-500">{ex.category}</td>
                <td className="px-4 py-2 text-slate-500">{ex.type}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => edit(ex)} className="mr-2 text-brand-600 hover:underline">Editar</button>
                  <button onClick={() => remove(ex.id)} className="text-red-600 hover:underline">Retirar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
