import { NotFoundException } from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { createPrismaMock } from '../../test/prisma.mock';

function build() {
  const prisma = createPrismaMock();
  const service = new ExercisesService(prisma as any);
  return { service, prisma };
}

describe('ExercisesService', () => {
  describe('list', () => {
    it('por defecto solo devuelve activos, página 1, límite 20, y meta de paginación', async () => {
      const { service, prisma } = build();
      prisma.exercise.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
      prisma.exercise.count.mockResolvedValue(2);

      const res = await service.list({});

      const arg = prisma.exercise.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ isActive: true });
      expect(arg.skip).toBe(0);
      expect(arg.take).toBe(20);
      expect(prisma.exercise.count).toHaveBeenCalledWith({ where: { isActive: true } });
      expect(res.data).toHaveLength(2);
      expect(res.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });
    });

    it('aplica filtros de categoría, tipo, nivel y búsqueda (insensible a mayúsculas) con paginación', async () => {
      const { service, prisma } = build();
      prisma.exercise.findMany.mockResolvedValue([]);
      prisma.exercise.count.mockResolvedValue(35);

      const res = await service.list({
        category: 'pecho',
        type: 'gym',
        level: 'BEGINNER' as any,
        search: 'press',
        page: 2,
        limit: 10,
      });

      const arg = prisma.exercise.findMany.mock.calls[0][0];
      expect(arg.where).toMatchObject({
        isActive: true,
        category: 'pecho',
        type: 'gym',
        level: 'BEGINNER',
        name: { contains: 'press', mode: 'insensitive' },
      });
      expect(arg.skip).toBe(10); // (page-1)*limit
      expect(arg.take).toBe(10);
      expect(res.meta).toEqual({ total: 35, page: 2, limit: 10, totalPages: 4 });
    });
  });

  describe('findOne', () => {
    it('devuelve la ficha de un ejercicio activo', async () => {
      const { service, prisma } = build();
      prisma.exercise.findFirst.mockResolvedValue({ id: 'e1', name: 'Press banca', isActive: true });

      const res = await service.findOne('e1');

      expect(prisma.exercise.findFirst).toHaveBeenCalledWith({
        where: { id: 'e1', isActive: true },
      });
      expect(res.name).toBe('Press banca');
    });

    it('lanza NotFound si no existe o está desactivado', async () => {
      const { service, prisma } = build();
      prisma.exercise.findFirst.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('categories', () => {
    it('devuelve las categorías activas con su conteo', async () => {
      const { service, prisma } = build();
      prisma.exercise.groupBy.mockResolvedValue([
        { category: 'pecho', _count: { _all: 5 } },
        { category: 'espalda', _count: { _all: 3 } },
      ]);

      const res = await service.categories();

      const arg = prisma.exercise.groupBy.mock.calls[0][0];
      expect(arg.by).toEqual(['category']);
      expect(arg.where).toEqual({ isActive: true });
      expect(res).toEqual([
        { category: 'pecho', count: 5 },
        { category: 'espalda', count: 3 },
      ]);
    });
  });

  describe('create (admin)', () => {
    it('crea un ejercicio con los datos indicados', async () => {
      const { service, prisma } = build();
      prisma.exercise.create.mockImplementation(async ({ data }: any) => ({ id: 'e1', ...data }));

      const res = await service.create({
        name: 'Sentadilla',
        category: 'piernas',
        type: 'gym',
        mainMuscles: ['cuádriceps'],
        secondaryMuscles: [],
      } as any);

      expect(prisma.exercise.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Sentadilla' }) }),
      );
      expect(res.id).toBe('e1');
    });
  });

  describe('update (admin)', () => {
    it('actualiza un ejercicio existente', async () => {
      const { service, prisma } = build();
      prisma.exercise.findUnique.mockResolvedValue({ id: 'e1' });
      prisma.exercise.update.mockResolvedValue({ id: 'e1', name: 'Nuevo' });

      const res = await service.update('e1', { name: 'Nuevo' } as any);

      expect(prisma.exercise.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { name: 'Nuevo' },
      });
      expect(res.name).toBe('Nuevo');
    });

    it('lanza NotFound si el ejercicio no existe', async () => {
      const { service, prisma } = build();
      prisma.exercise.findUnique.mockResolvedValue(null);
      await expect(service.update('nope', { name: 'X' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.exercise.update).not.toHaveBeenCalled();
    });
  });

  describe('softDelete (admin)', () => {
    it('marca isActive=false sin borrar físicamente (no rompe historiales)', async () => {
      const { service, prisma } = build();
      prisma.exercise.findUnique.mockResolvedValue({ id: 'e1', isActive: true });
      prisma.exercise.update.mockResolvedValue({ id: 'e1', isActive: false });

      await service.softDelete('e1');

      expect(prisma.exercise.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { isActive: false },
      });
    });

    it('lanza NotFound si el ejercicio no existe', async () => {
      const { service, prisma } = build();
      prisma.exercise.findUnique.mockResolvedValue(null);
      await expect(service.softDelete('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
