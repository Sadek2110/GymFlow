import { useEffect, useState, type FormEvent } from 'react';
import {
  deleteGymCredentials,
  fetchGymCredentials,
  saveGymCredentials,
  testGymCredentials,
  type GymCredentialsState,
} from '../lib/reservations';
import { ApiRequestError } from '../lib/api';

export default function GymCredentialsPanel() {
  const [state, setState] = useState<GymCredentialsState | null>(null);
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGymCredentials()
      .then(setState)
      .catch(() => setError('No se pudo consultar el estado de las credenciales.'));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveGymCredentials({ dni, password });
      setState({ configured: true, updatedAt: new Date().toISOString() });
      setDni('');
      setPassword('');
      setMessage('Credenciales guardadas de forma cifrada.');
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'No se pudieron guardar las credenciales.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    setError(null);
    try {
      const result = await testGymCredentials();
      setMessage(result.message);
      if (!result.ok) setError(result.message);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'No se pudo probar la conexión.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('¿Eliminar tus credenciales del gimnasio?')) return;
    setBusy(true);
    try {
      await deleteGymCredentials();
      setState({ configured: false, updatedAt: null });
      setMessage('Credenciales eliminadas.');
    } catch {
      setError('No se pudieron eliminar las credenciales.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">
          Credenciales del gimnasio
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            state?.configured
              ? 'bg-green-100 text-green-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {state?.configured ? 'Configuradas' : 'Sin configurar'}
        </span>
      </div>
      <p className="mt-2 text-sm/6 text-slate-600">
        Tus credenciales del portal del ICD se guardan cifradas y solo se usan
        para hacer tus reservas. Puedes eliminarlas cuando quieras.
      </p>

      <form onSubmit={save} className="mt-4 grid gap-4">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          DNI o carnet
          <input
            required
            minLength={5}
            maxLength={20}
            autoComplete="username"
            value={dni}
            onChange={(event) => setDni(event.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-4 outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Contraseña del portal
          <input
            required
            minLength={4}
            maxLength={100}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-4 outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy}
            className="touch-target rounded-xl bg-brand-500 px-5 font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
          {state?.configured && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={testConnection}
                className="touch-target rounded-xl border border-brand-300 px-4 font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
              >
                Probar conexión
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="touch-target rounded-xl border border-red-300 px-4 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Eliminar
              </button>
            </>
          )}
        </div>
      </form>
      {message && (
        <p aria-live="polite" className="mt-3 text-sm text-green-700">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
