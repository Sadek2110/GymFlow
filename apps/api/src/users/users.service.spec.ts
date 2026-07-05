import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { createPrismaMock } from '../../test/prisma.mock';

function build() {
  const prisma = createPrismaMock();
  const service = new UsersService(prisma as any);
  return { service, prisma };
}

describe('UsersService', () => {
  describe('getMe', () => {
    it('devuelve usuario + perfil + último peso, sin passwordHash', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        name: 'Ana',
        email: 'ana@example.com',
        role: 'USER',
        passwordHash: 'secreto',
        profile: { id: 'p1', units: 'kg' },
      });
      prisma.bodyMeasurement.findFirst.mockResolvedValue({ weightKg: 80.5, date: new Date() });

      const res = await service.getMe('u1');

      expect(res).toMatchObject({ id: 'u1', email: 'ana@example.com' });
      expect(res.profile).toMatchObject({ units: 'kg' });
      expect(res.lastWeightKg).toBe(80.5);
      expect((res as any).passwordHash).toBeUndefined();
    });

    it('lanza NotFound si el usuario no existe', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getMe('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateMe', () => {
    it('actualiza el nombre', async () => {
      const { service, prisma } = build();
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        name: 'Ana María',
        email: 'ana@example.com',
        role: 'USER',
      });

      const res = await service.updateMe('u1', { name: 'Ana María' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ name: 'Ana María' }) }),
      );
      expect(res.name).toBe('Ana María');
    });

    it('rechaza cambiar a un email ya usado por otro usuario', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({ id: 'other', email: 'taken@example.com' });

      await expect(
        service.updateMe('u1', { email: 'taken@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updateProfile', () => {
    it('hace upsert del perfil con los campos indicados', async () => {
      const { service, prisma } = build();
      prisma.userProfile.upsert.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        heightCm: 175,
        units: 'lb',
      });

      const res = await service.updateProfile('u1', { heightCm: 175, units: 'lb' });

      expect(prisma.userProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' } }),
      );
      expect(res.heightCm).toBe(175);
    });
  });

  describe('measurements', () => {
    it('añade un registro de peso para el usuario', async () => {
      const { service, prisma } = build();
      prisma.bodyMeasurement.create.mockImplementation(async ({ data }: any) => ({ id: 'm1', ...data }));

      const res = await service.addMeasurement('u1', { weightKg: 79.3, note: 'mañana' });

      expect(prisma.bodyMeasurement.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', weightKg: 79.3 }) }),
      );
      expect(res.id).toBe('m1');
    });

    it('lista el historial del usuario ordenado por fecha', async () => {
      const { service, prisma } = build();
      prisma.bodyMeasurement.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);

      const res = await service.getMeasurements('u1', {});

      const arg = prisma.bodyMeasurement.findMany.mock.calls[0][0];
      expect(arg.where.userId).toBe('u1');
      expect(arg.orderBy).toEqual({ date: 'asc' });
      expect(res).toHaveLength(2);
    });

    it('borra un registro propio', async () => {
      const { service, prisma } = build();
      prisma.bodyMeasurement.findFirst.mockResolvedValue({ id: 'm1', userId: 'u1' });

      await service.deleteMeasurement('u1', 'm1');

      expect(prisma.bodyMeasurement.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });

    it('NO permite borrar un registro de otro usuario (aislamiento)', async () => {
      const { service, prisma } = build();
      // findFirst con {id, userId} no encuentra nada porque no es suyo.
      prisma.bodyMeasurement.findFirst.mockResolvedValue(null);

      await expect(service.deleteMeasurement('u1', 'ajeno')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.bodyMeasurement.delete).not.toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    it('elimina la cuenta del usuario', async () => {
      const { service, prisma } = build();
      prisma.user.delete.mockResolvedValue({ id: 'u1' });

      await service.deleteAccount('u1');

      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });
});
