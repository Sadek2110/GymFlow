import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TrainSession from './TrainSession';

vi.mock('../lib/workouts', async () => {
  const actual = await vi.importActual<typeof import('../lib/workouts')>('../lib/workouts');
  return {
    ...actual, // conserva los helpers puros (nextSetNumber, groupByExercise…)
    getActiveWorkout: vi.fn(),
    startWorkout: vi.fn(),
    fetchWorkout: vi.fn(),
    addWorkoutLog: vi.fn(),
    removeWorkoutLog: vi.fn(),
    finishWorkout: vi.fn(),
    abandonWorkout: vi.fn(),
  };
});

import {
  getActiveWorkout,
  startWorkout,
  fetchWorkout,
  addWorkoutLog,
} from '../lib/workouts';

const PLAN_SESSION = {
  id: 's1',
  userId: 'u1',
  routineId: 'r1',
  routineDayId: 'd1',
  date: '',
  status: 'in_progress',
  notes: null,
  finishedAt: null,
  logs: [],
  plan: {
    id: 'd1',
    dayOfWeek: 0,
    title: 'Pecho',
    isRestDay: false,
    exercises: [
      {
        id: 'rde1',
        exerciseId: 'e1',
        order: 0,
        targetSets: 3,
        targetReps: '8-12',
        targetWeight: 60,
        restSeconds: 90,
        exercise: { id: 'e1', name: 'Press banca', category: 'pecho', type: 'gym', imageUrl: null },
      },
    ],
  },
};

describe('TrainSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: { href: '', search: '' },
      writable: true,
    });
  });

  it('sin sesión activa muestra el botón de empezar y arranca una sesión libre', async () => {
    (getActiveWorkout as any).mockResolvedValue(null);
    (startWorkout as any).mockResolvedValue({ ...PLAN_SESSION, plan: null });

    render(<TrainSession />);

    const startBtn = await screen.findByRole('button', { name: /Empezar entrenamiento libre/i });
    fireEvent.click(startBtn);

    await waitFor(() => expect(startWorkout).toHaveBeenCalledWith({}));
    // Tras arrancar, aparece la cabecera de la sesión en curso.
    expect(await screen.findByText(/en curso/i)).toBeInTheDocument();
  });

  it('con sesión activa de rutina renderiza el ejercicio del plan y registra una serie', async () => {
    (getActiveWorkout as any).mockResolvedValue(PLAN_SESSION);
    (addWorkoutLog as any).mockResolvedValue({
      log: { id: 'l1' },
      previousBest: { weightKg: 80, reps: 5 },
    });
    // Tras registrar la serie se recarga la sesión con la nueva serie.
    (fetchWorkout as any).mockResolvedValue({
      ...PLAN_SESSION,
      logs: [
        {
          id: 'l1',
          sessionId: 's1',
          exerciseId: 'e1',
          setNumber: 1,
          weightKg: 60,
          reps: 10,
          rpe: null,
          restSeconds: 90,
          notes: null,
        },
      ],
    });

    render(<TrainSession />);

    expect(await screen.findByText('Press banca')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Serie 1 hecha/i }));

    await waitFor(() =>
      expect(addWorkoutLog).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ exerciseId: 'e1', setNumber: 1 }),
      ),
    );
    // La serie registrada aparece en la lista.
    expect(await screen.findByText(/Serie 1/i)).toBeInTheDocument();
  });
});
