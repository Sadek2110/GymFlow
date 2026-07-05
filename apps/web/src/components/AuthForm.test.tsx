import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthForm from './AuthForm';
import { tokenStore } from '../lib/tokens';

// Mock del cliente API: no queremos red real en un test de componente.
vi.mock('../lib/api', () => {
  class ApiRequestError extends Error {
    status: number;
    body: any;
    constructor(status: number, body: any) {
      super('api error');
      this.status = status;
      this.body = body;
    }
  }
  return {
    ApiRequestError,
    api: {
      post: vi.fn(),
      patch: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
    },
  };
});

import { api } from '../lib/api';

describe('AuthForm (login)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Sustituimos location por un objeto plano inspeccionable.
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
  });

  it('envía credenciales, guarda los tokens y navega al dashboard', async () => {
    (api.post as any).mockResolvedValue({
      accessToken: 'acc',
      refreshToken: 'ref',
      user: { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'USER' },
    });

    render(<AuthForm mode="login" />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ana@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'Password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/login', {
        email: 'ana@example.com',
        password: 'Password123',
      });
    });
    expect(tokenStore.getAccess()).toBe('acc');
    expect(tokenStore.getRefresh()).toBe('ref');
    expect(window.location.href).toBe('/dashboard');
  });

  it('muestra el mensaje de error de la API si el login falla', async () => {
    const { ApiRequestError } = await import('../lib/api');
    (api.post as any).mockRejectedValue(
      new (ApiRequestError as any)(401, { message: 'Credenciales inválidas' }),
    );

    render(<AuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ana@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'bad' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas');
    expect(tokenStore.getAccess()).toBeNull();
  });
});
