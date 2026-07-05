import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReservationsPanel from './ReservationsPanel';

vi.mock('../lib/api', () => {
  class ApiRequestError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown = null) {
      super('api error');
      this.status = status;
      this.body = body;
    }
  }
  return { ApiRequestError };
});
vi.mock('../lib/reservations', async () => {
  const actual = await vi.importActual<typeof import('../lib/reservations')>('../lib/reservations');
  return {
    ...actual,
    fetchReservationHealth: vi.fn(),
    fetchReservations: vi.fn(),
    runReservation: vi.fn(),
  };
});

import { ApiRequestError } from '../lib/api';
import { fetchReservationHealth, fetchReservations, runReservation } from '../lib/reservations';

describe('ReservationsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra estado "no disponible" si el módulo está desactivado (404)', async () => {
    (fetchReservationHealth as any).mockRejectedValue(new ApiRequestError(404, null));
    (fetchReservations as any).mockRejectedValue(new ApiRequestError(404, null));

    render(<ReservationsPanel />);

    expect(await screen.findByText(/no está disponible/i)).toBeInTheDocument();
  });

  it('con el módulo activo, lanza una reserva de prueba y refresca el historial', async () => {
    (fetchReservationHealth as any).mockResolvedValue({ ok: true, status: 'online' });
    (fetchReservations as any).mockResolvedValue([]);
    (runReservation as any).mockResolvedValue({ id: 'r1', status: 'dry_run' });

    render(<ReservationsPanel />);

    // Botón de prueba disponible tras cargar el estado online.
    const btn = await screen.findByRole('button', { name: /Probar reserva/i });
    fireEvent.click(btn);

    await waitFor(() => expect(runReservation).toHaveBeenCalledWith({ dryRun: true }));
    // Se refresca el historial (segunda llamada a fetchReservations).
    await waitFor(() => expect(fetchReservations).toHaveBeenCalledTimes(2));
  });
});
