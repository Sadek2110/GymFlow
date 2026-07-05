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
      className="sticky top-2 z-40 flex items-center justify-between gap-3 rounded-2xl bg-brand-600/90 backdrop-blur-md px-4 py-3 text-white shadow-[0_4px_25px_rgba(47,127,255,0.45)] border border-brand-500/30 transition-all duration-300"
    >
      <span className="text-sm font-bold uppercase tracking-wider flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-neon-lime animate-pulse shadow-[0_0_6px_rgba(178,255,5,0.8)]"></span>
        Descanso
      </span>
      <span className="font-mono text-2xl font-black tabular-nums neon-text-primary">{formatClock(remaining)}</span>
      <div className="flex gap-2">
        <button
          onClick={() => setRemaining((r) => r + 30)}
          className="touch-target rounded-xl bg-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/25 active:scale-95 transition-all"
        >
          +30s
        </button>
        <button
          onClick={onDone}
          className="touch-target rounded-xl bg-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/25 active:scale-95 transition-all"
        >
          Saltar
        </button>
      </div>
    </div>
  );
}
