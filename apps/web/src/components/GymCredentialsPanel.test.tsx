import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GymCredentialsPanel from './GymCredentialsPanel';

vi.mock('../lib/reservations', () => ({
  fetchGymCredentials: vi.fn(),
  saveGymCredentials: vi.fn(),
  testGymCredentials: vi.fn(),
  deleteGymCredentials: vi.fn(),
}));

import {
  deleteGymCredentials,
  fetchGymCredentials,
  saveGymCredentials,
  testGymCredentials,
} from '../lib/reservations';

describe('GymCredentialsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('guarda credenciales sin volver a mostrar su contenido', async () => {
    (fetchGymCredentials as any).mockResolvedValue({
      configured: false,
      updatedAt: null,
    });
    (saveGymCredentials as any).mockResolvedValue({ configured: true });
    render(<GymCredentialsPanel />);

    fireEvent.change(await screen.findByLabelText(/DNI o carnet/i), {
      target: { value: '12345678A' },
    });
    fireEvent.change(screen.getByLabelText(/Contraseña del portal/i), {
      target: { value: 'secreta' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/i }));

    await waitFor(() =>
      expect(saveGymCredentials).toHaveBeenCalledWith({
        dni: '12345678A',
        password: 'secreta',
      }),
    );
    expect(screen.getByLabelText(/Contraseña del portal/i)).toHaveValue('');
  });

  it('permite probar y eliminar credenciales configuradas', async () => {
    (fetchGymCredentials as any).mockResolvedValue({
      configured: true,
      updatedAt: '2026-07-05T10:00:00Z',
    });
    (testGymCredentials as any).mockResolvedValue({
      ok: true,
      message: 'Login correcto en el portal',
    });
    (deleteGymCredentials as any).mockResolvedValue({ configured: false });
    render(<GymCredentialsPanel />);

    fireEvent.click(
      await screen.findByRole('button', { name: /Probar conexión/i }),
    );
    expect(
      await screen.findByText(/Login correcto en el portal/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Eliminar/i }));
    await waitFor(() => expect(deleteGymCredentials).toHaveBeenCalled());
  });
});
