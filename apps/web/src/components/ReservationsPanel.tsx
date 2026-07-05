import { useEffect, useState } from 'react';
import { ApiRequestError } from '../lib/api';
import {
  fetchReservationHealth,
  fetchReservations,
  runReservation,
  fetchAutoReserve,
  updateAutoReserve,
  RESERVATION_STATUS_BADGE,
  RESERVATION_STATUS_LABEL,
  type Reservation,
  type ReservaGymHealth,
} from '../lib/reservations';

export default function ReservationsPanel() {
  const [available, setAvailable] = useState(true);
  const [health, setHealth] = useState<ReservaGymHealth | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Auto-reserve settings states
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoTime, setAutoTime] = useState('09:00 - 10:00');
  const [savingAuto, setSavingAuto] = useState(false);

  async function loadHistory() {
    setReservations(await fetchReservations());
  }

  useEffect(() => {
    (async () => {
      try {
        // Si el módulo está desactivado, la API responde 404.
        const [h, autoRes] = await Promise.all([
          fetchReservationHealth(),
          fetchAutoReserve().catch(() => ({ enabled: false, time: '09:00 - 10:00' })),
          loadHistory(),
        ]);
        setHealth(h);
        setAutoEnabled(autoRes.enabled);
        if (autoRes.time) setAutoTime(autoRes.time);
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          setAvailable(false);
        } else if (err instanceof ApiRequestError && err.status === 502) {
          // El microservicio no responde, pero el módulo sí existe.
          setHealth({ ok: false });
        } else {
          setError(err instanceof ApiRequestError ? err.message : 'No se pudo cargar reservas.');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleRun() {
    if (!dryRun) {
      const ok = window.confirm(
        '¿Reservar de verdad para mañana? Se confirmará la plaza en el gimnasio.',
      );
      if (!ok) return;
    }
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const res = await runReservation({ dryRun });
      setNotice(
        res.status === 'dry_run'
          ? 'Prueba completada: el flujo funciona (no se confirmó ninguna reserva).'
          : 'Reserva enviada correctamente.',
      );
      await loadHistory();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'No se pudo completar la reserva.',
      );
      // Aun con error, el intento queda registrado en el historial.
      try {
        await loadHistory();
      } catch {
        /* noop */
      }
    } finally {
      setRunning(false);
    }
  }

  async function saveAutoSettings(nextEnabled: boolean, nextTime: string) {
    setSavingAuto(true);
    setError(null);
    try {
      const saved = await updateAutoReserve({ enabled: nextEnabled, time: nextTime });
      setAutoEnabled(saved.enabled);
      if (saved.time) setAutoTime(saved.time);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'No se pudo guardar la configuración.');
    } finally {
      setSavingAuto(false);
    }
  }

  if (loading) return <p className="py-10 text-center text-slate-500">Cargando…</p>;

  if (!available) {
    return (
      <div className="py-10 text-center">
        <p className="text-4xl">🔒</p>
        <h1 className="mt-3 text-xl font-bold text-slate-900">Reservas</h1>
        <p className="mt-1 text-slate-500">
          El módulo de reservas no está disponible en esta instalación.
        </p>
        <a href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-brand-600">
          ← Volver al inicio
        </a>
      </div>
    );
  }

  const online = health?.ok !== false && (health?.status === 'online' || health?.ok);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Reservas del gimnasio</h1>
        <p className="text-sm text-slate-500">Automatiza tu reserva diaria del C.D. Díaz Flor.</p>
      </header>

      <section className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
        <span className="text-sm font-medium text-slate-600">Estado del servicio</span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {online ? 'En línea' : 'No responde'}
        </span>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between">
          <div className="pr-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Reservas automáticas
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Reservaremos de forma automática a las 05:00 si mañana entrenas en tu rutina activa.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input
              type="checkbox"
              checked={autoEnabled}
              onChange={(e) => saveAutoSettings(e.target.checked, autoTime)}
              disabled={savingAuto}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
          </label>
        </div>

        {autoEnabled && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <label className="block">
              <span className="text-sm font-medium text-slate-600">Franja horaria deseada</span>
              <p className="text-xs text-slate-400 mb-2">Formato de 24h, por ejemplo: 09:00 - 10:00</p>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition"
                value={autoTime}
                onBlur={(e) => saveAutoSettings(autoEnabled, e.target.value)}
                onChange={(e) => setAutoTime(e.target.value)}
                placeholder="09:00 - 10:00"
              />
            </label>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Reservar mañana manualmente
        </h2>
        <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-brand-500 focus:ring-brand-100"
          />
          Modo prueba (no confirma la reserva)
        </label>

        <button
          onClick={handleRun}
          disabled={running || !online}
          className={`touch-target mt-3 w-full rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-40 transition ${
            dryRun ? 'bg-brand-500 hover:bg-brand-600' : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {running ? 'Procesando…' : dryRun ? 'Probar reserva (dry run)' : 'Reservar de verdad'}
        </button>

        {notice && (
          <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</p>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Historial de intentos
        </h2>
        {reservations.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-slate-500 shadow-sm border border-slate-100">
            Todavía no has lanzado ninguna reserva.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reservations.map((r) => (
              <li key={r.id} className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">{r.timeSlot}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RESERVATION_STATUS_BADGE[r.status]}`}>
                    {RESERVATION_STATUS_LABEL[r.status]}
                  </span>
                </div>
                {r.rawLog && (
                  <details className="mt-2 text-xs text-slate-500 bg-slate-50 p-2 rounded-lg cursor-pointer">
                    <summary className="font-medium text-slate-600 hover:text-slate-900">Ver detalles del log</summary>
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] overflow-x-auto">{r.rawLog}</pre>
                  </details>
                )}
                <p className="mt-1 text-sm text-slate-400">
                  {new Date(r.createdAt).toLocaleString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
