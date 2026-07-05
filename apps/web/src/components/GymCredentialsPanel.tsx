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
    <section className="glass-card rounded-2xl p-5 relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-headline text-lg font-bold text-white">
          Credenciales del gimnasio
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold border uppercase tracking-wider ${
            state?.configured
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
          }`}
        >
          {state?.configured ? 'Configuradas' : 'Sin configurar'}
        </span>
      </div>
      <p className="mt-2 text-sm/6 text-slate-400 font-semibold">
        Tus credenciales del portal del ICD se guardan cifradas y solo se usan
        para hacer tus reservas. Puedes eliminarlas cuando quieras.
      </p>

      <form onSubmit={save} className="mt-5 grid gap-4">
        <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
          DNI o carnet
          <input
            required
            minLength={5}
            maxLength={20}
            autoComplete="username"
            value={dni}
            onChange={(event) => setDni(event.target.value)}
            className="min-h-11 rounded-xl border border-white/10 bg-white/5 text-white px-4 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 mt-1"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
          Contraseña del portal
          <input
            required
            minLength={4}
            maxLength={100}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-11 rounded-xl border border-white/10 bg-white/5 text-white px-4 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 mt-1"
          />
        </label>
        <div className="flex flex-wrap gap-2.5 mt-2">
          <button
            disabled={busy}
            className="touch-target rounded-xl bg-brand-500 px-5 font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 transition-all shadow-[0_0_12px_rgba(47,127,255,0.2)] border border-white/10 cursor-pointer"
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
          {state?.configured && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={testConnection}
                className="touch-target rounded-xl border border-brand-500/30 px-4 font-bold text-brand-400 hover:bg-brand-500/10 disabled:opacity-50 active:scale-95 transition-all cursor-pointer"
              >
                Probar conexión
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="touch-target rounded-xl border border-red-500/30 px-4 font-bold text-red-400 hover:bg-red-500/10 disabled:opacity-50 active:scale-95 transition-all cursor-pointer"
              >
                Eliminar
              </button>
            </>
          )}
        </div>
      </form>
      {message && (
        <p aria-live="polite" className="mt-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm text-emerald-400 font-semibold">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400 font-semibold">
          {error}
        </p>
      )}
    </section>
  );
}
