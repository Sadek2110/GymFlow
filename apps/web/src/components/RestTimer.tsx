import { useEffect, useState } from 'react';
import { formatClock } from '../lib/workouts';

interface Props {
  seconds: number;
  runId: number; // cambiar este valor reinicia la cuenta atrás
  onDone: () => void;
}

/** Cuenta atrás de descanso entre series. Vibra al terminar si el dispositivo lo permite. */
export default function RestTimer({ seconds, runId, onDone }: Props) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(interval);
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate?.(200);
          }
          onDone();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return (
    <div
      role="timer"
      aria-label="Descanso"
      className="sticky top-2 z-40 flex items-center justify-between gap-3 rounded-2xl bg-brand-600 px-4 py-3 text-white shadow-lg"
    >
      <span className="text-sm font-medium">Descanso</span>
      <span className="font-mono text-2xl font-bold tabular-nums">{formatClock(remaining)}</span>
      <div className="flex gap-2">
        <button
          onClick={() => setRemaining((r) => r + 30)}
          className="touch-target rounded-lg bg-white/20 px-3 py-1 text-sm font-semibold hover:bg-white/30"
        >
          +30s
        </button>
        <button
          onClick={onDone}
          className="touch-target rounded-lg bg-white/20 px-3 py-1 text-sm font-semibold hover:bg-white/30"
        >
          Saltar
        </button>
      </div>
    </div>
  );
}
