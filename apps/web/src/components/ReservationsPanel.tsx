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
        <h1 className="font-headline text-3xl font-bold text-white tracking-tight">
          Reservas del gimnasio
        </h1>
        <p className="mt-1.5 text-sm/6 text-slate-400 font-medium">
          Reserva una o varias franjas para mañana en el C.D. Díaz Flor.
        </p>
      </header>

      <section className="glass-card flex items-center justify-between rounded-2xl p-4 shadow-sm">
        <span className="text-sm font-semibold text-slate-300">
          Estado del servicio
        </span>
        <span
          className={`rounded-full px-3.5 py-1 text-xs font-bold border ${
            online
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          {online ? 'Disponible' : 'No responde'}
        </span>
      </section>

      {!configured && (
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
          <p className="text-sm/6 text-amber-400 font-medium">
            Configura tus credenciales del portal antes de reservar.
          </p>
          <a
            href="/profile"
            className="mt-2.5 inline-flex min-h-11 items-center font-bold text-amber-300 hover:text-amber-200 transition-colors underline decoration-2 underline-offset-4"
          >
            Configurar credenciales
          </a>
        </section>
      )}

      <section className="glass-card rounded-2xl p-5 relative overflow-hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-headline font-bold text-lg text-white">
              Reservas automáticas
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Máximo tres franjas, ejecutadas de forma secuencial.
            </p>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-slate-300">
            <input
              type="checkbox"
              checked={auto.enabled}
              disabled={busy || !configured}
              onChange={(event) =>
                void saveAuto({ ...auto, enabled: event.target.checked })
              }
              className="size-5 rounded border-white/10 bg-white/5 text-brand-500 focus:ring-brand-500/20"
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
              className="min-h-11 rounded-full bg-brand-500/10 border border-brand-500/20 px-4 text-sm font-semibold text-brand-400 hover:bg-brand-500/25 active:scale-95 transition-all"
              aria-label={`Eliminar franja ${time}`}
            >
              {time} ×
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          <label className="sr-only" htmlFor="auto-time">
            Nueva franja automática
          </label>
          <select
            id="auto-time"
            value={candidateTime}
            onChange={(event) => setCandidateTime(event.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/5 text-white px-3 focus:border-brand-500 focus:ring-brand-500/20 outline-none"
          >
            {TIME_SLOTS.map((time) => (
              <option key={time} className="bg-slate-900 text-white">{time}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || auto.times.length >= 3}
            onClick={addTime}
            className="touch-target rounded-xl border border-brand-500/30 px-5 font-bold text-brand-400 hover:bg-brand-500/10 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Añadir franja
          </button>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-5 relative overflow-hidden">
        <h2 className="font-headline font-bold text-lg text-white">
          Reservar mañana manualmente
        </h2>
        <label className="mt-4 grid gap-1.5 text-sm font-semibold text-slate-400">
          Franja
          <select
            value={manualTime}
            onChange={(event) => setManualTime(event.target.value)}
            className="min-h-11 rounded-xl border border-white/10 bg-white/5 text-white px-3 focus:border-brand-500 focus:ring-brand-500/20 outline-none mt-1"
          >
            <option value="" className="bg-slate-900 text-white">Horario por defecto</option>
            {TIME_SLOTS.map((time) => (
              <option key={time} className="bg-slate-900 text-white">{time}</option>
            ))}
          </select>
        </label>
        <label className="mt-4 flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(event) => setDryRun(event.target.checked)}
            className="size-5 rounded border-white/10 bg-white/5 text-brand-500 focus:ring-brand-500/20"
          />
          Modo prueba (no confirma)
        </label>
        <button
          type="button"
          onClick={handleRun}
          disabled={busy || !online || !configured}
          className={`touch-target mt-4 w-full rounded-xl py-3 font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 active:scale-95 border border-white/15 cursor-pointer ${
            dryRun
              ? 'bg-brand-500 hover:bg-brand-600 shadow-[0_0_20px_rgba(47,127,255,0.35)]'
              : 'bg-red-600 hover:bg-red-700 shadow-[0_0_20px_rgba(220,38,38,0.35)]'
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
        <p aria-live="polite" className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm text-emerald-400 font-semibold">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400 font-semibold">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-headline font-bold text-lg text-white">Historial</h2>
        {history.length === 0 ? (
          <p className="rounded-2xl glass-card p-6 text-center text-slate-400 text-sm font-medium">
            Todavía no has lanzado ninguna reserva.
          </p>
        ) : (
          <ul className="grid gap-3.5">
            {history.map((reservation) => (
              <li
                key={reservation.id}
                className="glass-card rounded-2xl p-4 shadow-sm flex flex-col gap-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-headline font-bold text-white text-base">
                    {reservation.timeSlot}
                  </span>
                  <span className={`rounded-full px-3.5 py-1 text-xs font-bold border ${RESERVATION_STATUS_BADGE[reservation.status]}`}>
                    {RESERVATION_STATUS_LABEL[reservation.status]}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-500">
                  {new Date(reservation.date).toLocaleDateString('es-ES')}
                </p>
                {reservation.status === 'confirmed' &&
                  new Date(reservation.date).getTime() > Date.now() && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleCancel(reservation.id)}
                      className="touch-target mt-2 self-start rounded-xl border border-red-500/30 px-4 py-2 text-sm font-bold text-red-400 hover:bg-red-500/10 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
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
