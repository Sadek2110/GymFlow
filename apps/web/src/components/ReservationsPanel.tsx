import { useEffect, useState } from 'react';
import {
  RESERVATION_STATUS_BADGE,
  RESERVATION_STATUS_LABEL,
  cancelReservation,
  fetchAutoReserve,
  fetchGymCredentials,
  fetchReservationHealth,
  fetchReservations,
  runReservation,
  updateAutoReserve,
  type AutoReserveState,
  type Reservation,
} from '../lib/reservations';
import { ApiRequestError } from '../lib/api';

const TIME_SLOTS = [
  '08:00 - 09:00',
  '09:00 - 10:00',
  '10:00 - 11:00',
  '17:00 - 18:00',
  '18:00 - 19:00',
  '19:00 - 20:00',
];

export default function ReservationsPanel() {
  const [online, setOnline] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [history, setHistory] = useState<Reservation[]>([]);
  const [auto, setAuto] = useState<AutoReserveState>({
    enabled: false,
    times: [],
  });
  const [manualTime, setManualTime] = useState('');
  const [candidateTime, setCandidateTime] = useState(TIME_SLOTS[0]);
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const [health, reservations, credentials, autoReserve] =
      await Promise.all([
        fetchReservationHealth(),
        fetchReservations(),
        fetchGymCredentials(),
        fetchAutoReserve(),
      ]);
    setOnline(health.ok && health.status === 'online');
    setHistory(reservations);
    setConfigured(credentials.configured);
    setAuto(autoReserve);
  }

  useEffect(() => {
    load().catch((caught) => {
      setOnline(false);
      setError(
        caught instanceof ApiRequestError && caught.status === 404
          ? 'El módulo de reservas no está disponible.'
          : 'No se pudo cargar la información de reservas.',
      );
    });
  }, []);

  async function saveAuto(next: AutoReserveState) {
    setBusy(true);
    setError(null);
    try {
      setAuto(await updateAutoReserve(next));
      setNotice('Preferencias de auto-reserva guardadas.');
    } catch {
      setError('No se pudieron guardar las preferencias.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRun() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await runReservation({
        dryRun,
        time: manualTime || undefined,
      });
      setNotice(dryRun ? 'Prueba completada.' : 'Reserva confirmada.');
      setHistory(await fetchReservations());
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'No se pudo completar la reserva.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm('¿Cancelar esta reserva en el portal del ICD?')) return;
    setBusy(true);
    setError(null);
    try {
      await cancelReservation(id, false);
      setNotice('Reserva cancelada.');
      setHistory(await fetchReservations());
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'No se pudo cancelar la reserva.',
      );
    } finally {
      setBusy(false);
    }
  }

  function addTime() {
    if (
      auto.times.length >= 3 ||
      auto.times.includes(candidateTime)
    ) return;
    void saveAuto({ ...auto, times: [...auto.times, candidateTime] });
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">
          Reservas del gimnasio
        </h1>
        <p className="mt-1 text-sm/6 text-slate-600">
          Reserva una o varias franjas para mañana en el C.D. Díaz Flor.
        </p>
      </header>

      <section className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <span className="text-sm font-medium text-slate-700">
          Estado del servicio
        </span>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            online
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          {online ? 'Disponible' : 'No responde'}
        </span>
      </section>

      {!configured && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm/6 text-amber-900">
            Configura tus credenciales del portal antes de reservar.
          </p>
          <a
            href="/profile"
            className="mt-2 inline-flex min-h-11 items-center font-semibold text-amber-900 underline decoration-2 underline-offset-4"
          >
            Configurar credenciales
          </a>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">
              Reservas automáticas
            </h2>
            <p className="mt-1 text-sm/6 text-slate-600">
              Máximo tres franjas, ejecutadas de forma secuencial.
            </p>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={auto.enabled}
              disabled={busy || !configured}
              onChange={(event) =>
                void saveAuto({ ...auto, enabled: event.target.checked })
              }
              className="size-5 rounded border-slate-300 text-brand-500 focus:ring-brand-300"
            />
            Activar
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {auto.times.map((time) => (
            <button
              key={time}
              type="button"
              disabled={busy}
              onClick={() =>
                void saveAuto({
                  ...auto,
                  times: auto.times.filter((item) => item !== time),
                })
              }
              className="min-h-11 rounded-full bg-brand-50 px-4 text-sm font-medium text-brand-800 hover:bg-brand-100"
              aria-label={`Eliminar franja ${time}`}
            >
              {time} ×
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="auto-time">
            Nueva franja automática
          </label>
          <select
            id="auto-time"
            value={candidateTime}
            onChange={(event) => setCandidateTime(event.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-slate-300 px-3"
          >
            {TIME_SLOTS.map((time) => (
              <option key={time}>{time}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || auto.times.length >= 3}
            onClick={addTime}
            className="touch-target rounded-xl border border-brand-300 px-4 font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          >
            Añadir franja
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="font-semibold text-slate-900">
          Reservar mañana manualmente
        </h2>
        <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">
          Franja
          <select
            value={manualTime}
            onChange={(event) => setManualTime(event.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3"
          >
            <option value="">Horario por defecto</option>
            {TIME_SLOTS.map((time) => (
              <option key={time}>{time}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 flex min-h-11 items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(event) => setDryRun(event.target.checked)}
            className="size-5 rounded border-slate-300 text-brand-500"
          />
          Modo prueba (no confirma)
        </label>
        <button
          type="button"
          onClick={handleRun}
          disabled={busy || !online || !configured}
          className={`touch-target mt-3 w-full rounded-xl px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
            dryRun
              ? 'bg-brand-500 hover:bg-brand-600'
              : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {busy
            ? 'Procesando…'
            : dryRun
              ? 'Probar reserva'
              : 'Reservar de verdad'}
        </button>
      </section>

      {notice && (
        <p aria-live="polite" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}

      <section>
        <h2 className="font-semibold text-slate-900">Historial</h2>
        {history.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-600">
            Todavía no has lanzado ninguna reserva.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {history.map((reservation) => (
              <li
                key={reservation.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">
                    {reservation.timeSlot}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${RESERVATION_STATUS_BADGE[reservation.status]}`}>
                    {RESERVATION_STATUS_LABEL[reservation.status]}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {new Date(reservation.date).toLocaleDateString('es-ES')}
                </p>
                {reservation.status === 'confirmed' &&
                  new Date(reservation.date).getTime() > Date.now() && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleCancel(reservation.id)}
                      className="touch-target mt-3 rounded-xl border border-red-300 px-4 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
