import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { createPrismaMock } from '../../test/prisma.mock';

describe('AdminService', () => {
  it('lista usuarios paginados sin exponer la relación de credenciales', async () => {
    const prisma = createPrismaMock();
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        email: 'ana@example.com',
        gymCredential: { updatedAt: new Date() },
      },
    ]);
    prisma.user.count.mockResolvedValue(1);
    const service = new AdminService(prisma as any);

    const result = await service.listUsers({ page: 1, limit: 20 });

    expect(result.items[0]).toMatchObject({
      id: 'u1',
      credentialsConfigured: true,
    });
    expect(result.items[0]).not.toHaveProperty('gymCredential');
    expect(result.total).toBe(1);
  });

  it('devuelve 404 al consultar un usuario inexistente', async () => {
    const prisma = createPrismaMock();
    prisma.user.findUnique.mockResolvedValue(null);
    const service = new AdminService(prisma as any);
    await expect(service.getUser('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('agrega contadores de reservas por estado', async () => {
    const prisma = createPrismaMock();
    prisma.user.count.mockResolvedValue(3);
    prisma.reservation.count.mockResolvedValue(7);
    prisma.reservation.groupBy.mockResolvedValue([
      { status: 'confirmed', _count: 5 },
      { status: 'failed', _count: 2 },
    ]);
    const service = new AdminService(prisma as any);
    await expect(service.stats()).resolves.toEqual({
      users: 3,
      reservations: 7,
      byStatus: { confirmed: 5, failed: 2 },
    });
  });
});
