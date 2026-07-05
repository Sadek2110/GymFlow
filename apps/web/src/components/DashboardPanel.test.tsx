import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardPanel from './DashboardPanel';

vi.mock('../lib/api', () => {
  class ApiRequestError extends Error {}
  return { ApiRequestError, api: { get: vi.fn() } };
});
vi.mock('../lib/progress', async () => {
  const actual = await vi.importActual<typeof import('../lib/progress')>('../lib/progress');
  return { ...actual, fetchOverview: vi.fn() };
});

import { api } from '../lib/api';
import { fetchOverview } from '../lib/progress';

const OVERVIEW = {
  today: {
    dayOfWeek: 0,
    routineId: 'r1',
    routineDayId: 'd1',
    title: 'Empuje',
    isRestDay: false,
    exercises: [
      { id: 'rde1', exerciseId: 'e1', order: 0, targetSets: 4, targetReps: '8-12', targetWeight: null, restSeconds: 90, exercise: { id: 'e1', name: 'Press banca', category: 'pecho' } },
    ],
  },
  activeRoutine: { id: 'r1', name: 'PPL' },
  week: { completed: 2, target: 4, weekStart: '2026-06-29' },
  lastWeightKg: 80,
  lastSession: null,
  activeSession: null,
};

describe('DashboardPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as any).mockResolvedValue({ name: 'Ana García', profile: { units: 'kg' } });
  });

  it('muestra "hoy toca", el anillo semanal y el CTA hacia el día de hoy', async () => {
    (fetchOverview as any).mockResolvedValue(OVERVIEW);

    render(<DashboardPanel />);

    expect(await screen.findByText(/Ana/)).toBeInTheDocument();
    expect(screen.getByText('Empuje')).toBeInTheDocument();
    expect(screen.getByText(/Press banca/)).toBeInTheDocument();
    expect(screen.getByText('2/4')).toBeInTheDocument();

    const cta = screen.getByRole('link', { name: /Empezar entrenamiento/i });
    expect(cta.getAttribute('href')).toBe('/train?routineDayId=d1');
  });

  it('si hay sesión en curso el CTA invita a continuar', async () => {
    (fetchOverview as any).mockResolvedValue({
      ...OVERVIEW,
      activeSession: { id: 's1', routineDayId: 'd1', date: '' },
    });

    render(<DashboardPanel />);

    expect(await screen.findByRole('link', { name: /Continuar entrenamiento/i })).toBeInTheDocument();
  });
});
