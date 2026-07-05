import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RoutinesList from './RoutinesList';

// Mock del cliente de rutinas: sin red real (patrón de AuthForm.test).
vi.mock('../lib/routines', async () => {
  const actual = await vi.importActual<typeof import('../lib/routines')>('../lib/routines');
  return {
    ...actual,
    fetchRoutines: vi.fn(),
    createRoutine: vi.fn(),
    activateRoutine: vi.fn(),
    duplicateRoutine: vi.fn(),
    deleteRoutine: vi.fn(),
  };
});

import {
  fetchRoutines,
  createRoutine,
  activateRoutine,
} from '../lib/routines';

const ROUTINES = [
  { id: 'r1', name: 'Full body', goal: 'STRENGTH', isActive: true, createdAt: '', updatedAt: '' },
  { id: 'r2', name: 'Push Pull Legs', goal: null, isActive: false, createdAt: '', updatedAt: '' },
];

describe('RoutinesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
  });

  it('carga y muestra las rutinas, con badge en la activa', async () => {
    (fetchRoutines as any).mockResolvedValue(ROUTINES);

    render(<RoutinesList />);

    expect(await screen.findByText('Full body')).toBeInTheDocument();
    expect(screen.getByText('Push Pull Legs')).toBeInTheDocument();
    // La rutina activa muestra el badge "Activa" (string exacto: /Activa/i casaría con "Activar").
    expect(screen.getByText('Activa')).toBeInTheDocument();
  });

  it('crea una rutina y navega a su editor', async () => {
    (fetchRoutines as any).mockResolvedValue([]);
    (createRoutine as any).mockResolvedValue({ id: 'nueva', name: 'Mi rutina', days: [] });

    render(<RoutinesList />);
    await screen.findByText(/Nueva rutina/i);

    fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Mi rutina' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear rutina/i }));

    await waitFor(() =>
      expect(createRoutine).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mi rutina' })),
    );
    await waitFor(() => expect(window.location.href).toBe('/routines/nueva'));
  });

  it('activa una rutina inactiva', async () => {
    (fetchRoutines as any).mockResolvedValue(ROUTINES);
    (activateRoutine as any).mockResolvedValue({ ...ROUTINES[1], isActive: true });

    render(<RoutinesList />);
    await screen.findByText('Push Pull Legs');

    fireEvent.click(screen.getByRole('button', { name: /Activar/i }));

    await waitFor(() => expect(activateRoutine).toHaveBeenCalledWith('r2'));
  });
});
