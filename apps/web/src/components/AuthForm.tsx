import { useState, type FormEvent } from 'react';
import { api, ApiRequestError } from '../lib/api';
import { tokenStore } from '../lib/tokens';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; role: string };
}

type Mode = 'login' | 'register';

const LEVELS = [
  { value: 'BEGINNER', label: 'Principiante' },
  { value: 'INTERMEDIATE', label: 'Intermedio' },
  { value: 'ADVANCED', label: 'Avanzado' },
];

const GOALS = [
  { value: 'HYPERTROPHY', label: 'Ganar músculo' },
  { value: 'FAT_LOSS', label: 'Perder grasa' },
  { value: 'STRENGTH', label: 'Fuerza' },
  { value: 'ENDURANCE', label: 'Resistencia' },
  { value: 'STAY_FIT', label: 'Mantenerme en forma' },
];

const fieldClass =
  'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';
const labelClass = 'mb-1 block text-sm font-medium text-slate-400';

export default function AuthForm({ mode }: { mode: Mode }) {
  const isRegister = mode === 'register';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [fitnessLevel, setFitnessLevel] = useState('BEGINNER');
  const [mainGoal, setMainGoal] = useState('STAY_FIT');
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState('3');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isRegister) {
        const auth = await api.post<AuthResponse>('/auth/register', { name, email, password });
        tokenStore.set(auth.accessToken, auth.refreshToken);
        await api.patch('/users/me/profile', {
          ...(heightCm ? { heightCm: Number(heightCm) } : {}),
          fitnessLevel,
          mainGoal,
          trainingDaysPerWeek: Number(trainingDaysPerWeek),
        });
        if (weightKg) {
          await api.post('/users/me/measurements', { weightKg: Number(weightKg) });
        }
      } else {
        const auth = await api.post<AuthResponse>('/auth/login', { email, password });
        tokenStore.set(auth.accessToken, auth.refreshToken);
      }
      window.location.href = '/dashboard';
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const msg = Array.isArray(err.body?.message)
          ? err.body?.message.join('. ')
          : err.body?.message;
        setError(msg ?? 'Algo salió mal. Inténtalo de nuevo.');
      } else {
        setError('No se pudo conectar con el servidor.');
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {isRegister && (
        <div>
          <label className={labelClass} htmlFor="name">Nombre</label>
          <input
            id="name"
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>
      )}

      <div>
        <label className={labelClass} htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          inputMode="email"
          className={fieldClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          className={fieldClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          minLength={8}
          required
        />
        {isRegister && (
          <p className="mt-1 text-xs text-slate-500">Mínimo 8 caracteres.</p>
        )}
      </div>

      {isRegister && (
        <fieldset className="flex flex-col gap-4 rounded-2xl bg-white/5 border border-white/5 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-400">
            Cuéntanos sobre ti
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="weight">Peso (kg)</label>
              <input
                id="weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                className={fieldClass}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="height">Altura (cm)</label>
              <input
                id="height"
                type="number"
                inputMode="numeric"
                className={fieldClass}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="level">Nivel</label>
            <select
              id="level"
              className={fieldClass}
              value={fitnessLevel}
              onChange={(e) => setFitnessLevel(e.target.value)}
            >
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="goal">Objetivo</label>
            <select
              id="goal"
              className={fieldClass}
              value={mainGoal}
              onChange={(e) => setMainGoal(e.target.value)}
            >
              {GOALS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="days">Días de entreno por semana</label>
            <input
              id="days"
              type="number"
              inputMode="numeric"
              min={1}
              max={7}
              className={fieldClass}
              value={trainingDaysPerWeek}
              onChange={(e) => setTrainingDaysPerWeek(e.target.value)}
            />
          </div>
        </fieldset>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="touch-target mt-4 grid place-items-center rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-3.5 text-base font-bold text-white shadow-[0_0_20px_rgba(47,127,255,0.3)] transition-all hover:shadow-[0_0_25px_rgba(47,127,255,0.5)] active:scale-95 disabled:opacity-60 cursor-pointer"
      >
        {loading ? 'Un momento…' : isRegister ? 'Crear cuenta' : 'Entrar'}
      </button>

      <p className="text-center text-sm text-slate-400">
        {isRegister ? (
          <>¿Ya tienes cuenta? <a href="/login" className="font-semibold text-brand-500 hover:underline">Inicia sesión</a></>
        ) : (
          <>¿Nuevo por aquí? <a href="/register" className="font-semibold text-brand-500 hover:underline">Crea tu cuenta</a></>
        )}
      </p>
    </form>
  );
}
