import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReservationsPanel from './ReservationsPanel';

vi.mock('../lib/reservations', async () => {
  const actual = await vi.importActual<typeof import('../lib/reservations')>(
    '../lib/reservations',
  );
  return {
    ...actual,
    fetchReservationHealth: vi.fn(),
    fetchReservations: vi.fn(),
    fetchAutoReserve: vi.fn(),
    fetchShouldRunTomorrow: vi.fn(),
    fetchGymCredentials: vi.fn(),
    updateAutoReserve: vi.fn(),
    runReservation: vi.fn(),
    cancelReservation: vi.fn(),
  };
});

import * as reservations from '../lib/reservations';

function defaults() {
  (reservations.fetchReservationHealth as any).mockResolvedValue({
    ok: true,
    status: 'online',
  });
  (reservations.fetchReservations as any).mockResolvedValue([]);
  (reservations.fetchAutoReserve as any).mockResolvedValue({
    enabled: false,
    times: [],
  });
  (reservations.fetchShouldRunTomorrow as any).mockResolvedValue({
    autoReserveEnabled: false,
    shouldReserve: true,
  });
}

describe('ReservationsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
    defaults();
  });

  it('bloquea la reserva y enlaza a ajustes si faltan credenciales', async () => {
    (reservations.fetchGymCredentials as any).mockResolvedValue({
      configured: false,
      updatedAt: null,
    });
    render(<ReservationsPanel />);
    expect(
      await screen.findByRole('link', { name: /Configurar credenciales/i }),
    ).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('button', { name: /Probar reserva/i })).toBeDisabled();
  });

  it('lanza una franja manual y permite cancelar una confirmada', async () => {
    (reservations.fetchGymCredentials as any).mockResolvedValue({
      configured: true,
      updatedAt: null,
    });
    (reservations.fetchReservations as any).mockResolvedValue([
      {
        id: 'r1',
        facility: 'CD',
        service: 'Sala',
        date: '2099-07-07T00:00:00Z',
        timeSlot: '09:00 - 10:00',
        status: 'confirmed',
        createdAt: '2026-07-05T10:00:00Z',
      },
    ]);
    (reservations.runReservation as any).mockResolvedValue({
      id: 'r2',
      status: 'dry_run',
    });
    (reservations.cancelReservation as any).mockResolvedValue({
      id: 'r1',
      status: 'cancelled',
    });
    render(<ReservationsPanel />);

    fireEvent.click(
      await screen.findByRole('button', { name: /Probar reserva/i }),
    );
    await waitFor(() =>
      expect(reservations.runReservation).toHaveBeenCalledWith({
        dryRun: true,
        time: undefined,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Cancelar$/i }));
    await waitFor(() =>
      expect(reservations.cancelReservation).toHaveBeenCalledWith('r1', false),
    );
  });
});
