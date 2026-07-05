import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminDashboard from './AdminDashboard';

vi.mock('../lib/admin', () => ({
  fetchAdminStats: vi.fn().mockResolvedValue({
    users: 2,
    reservations: 5,
    byStatus: { confirmed: 3, failed: 2 },
  }),
  fetchAdminUsers: vi.fn().mockResolvedValue({
    items: [
      {
        id: 'u1',
        name: 'Ana',
        email: 'ana@example.com',
        role: 'USER',
        credentialsConfigured: true,
        autoReserveEnabled: true,
        _count: { reservations: 3, sessions: 4 },
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  }),
}));

describe('AdminDashboard', () => {
  it('muestra estadísticas y usuarios sin credenciales sensibles', async () => {
    render(<AdminDashboard />);
    expect(await screen.findByText('ana@example.com')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/Configuradas/i)).toBeInTheDocument();
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
  });
});
