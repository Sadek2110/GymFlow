import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { createPrismaMock } from '../../test/prisma.mock';

const USER = 'user-1';
const OTHER = 'user-2';

function build() {
  const prisma = createPrismaMock();
  const service = new RoutinesService(prisma as any);
  return { service, prisma };
}

describe('RoutinesService', () => {
  describe('list', () => {
    it('devuelve solo las rutinas del usuario, con la activa primero', async () => {
      const { service, prisma } = build();
      prisma.routine.findMany.mockResolvedValue([{ id: 'r1', isActive: true }]);

      const res = await service.list(USER);

      const arg = prisma.routine.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ userId: USER });
      // La activa primero, luego las más recientes.
      expect(arg.orderBy).toEqual([{ isActive: 'desc' }, { createdAt: 'desc' }]);
      expect(res).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('devuelve la rutina con días y ejercicios, filtrando por userId', async () => {
      const { service, prisma } = build();
      prisma.routine.findFirst.mockResolvedValue({ id: 'r1', userId: USER, days: [] });

      const res = await service.findOne(USER, 'r1');

      const arg = prisma.routine.findFirst.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'r1', userId: USER });
      // Debe incluir los días con sus ejercicios (y el ejercicio embebido).
      expect(arg.include).toBeDefined();
      expect(res.id).toBe('r1');
    });

    it('lanza NotFound si la rutina no existe o es de otro usuario', async () => {
      const { service, prisma } = build();
      prisma.routine.findFirst.mockResolvedValue(null);
      await expect(service.findOne(OTHER, 'r1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('crea la rutina con 7 días vacíos (dayOfWeek 0..6)', async () => {
      const { service, prisma } = build();
      prisma.routine.create.mockResolvedValue({ id: 'r1', userId: USER });

      await service.create(USER, { name: 'Full body', goal: 'HYPERTROPHY' as any });

      const arg = prisma.routine.create.mock.calls[0][0];
      expect(arg.data.userId).toBe(USER);
      expect(arg.data.name).toBe('Full body');
      expect(arg.data.goal).toBe('HYPERTROPHY');
      const days = arg.data.days.create;
      expect(days).toHaveLength(7);
      expect(days.map((d: any) => d.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });
  });

  describe('update', () => {
    it('renombra la rutina cuando pertenece al usuario', async () => {
      const { service, prisma } = build();
      prisma.routine.findFirst.mockResolvedValue({ id: 'r1', userId: USER });
      prisma.routine.update.mockResolvedValue({ id: 'r1', name: 'Nuevo' });

      const res = await service.update(USER, 'r1', { name: 'Nuevo' });

      expect(prisma.routine.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { name: 'Nuevo' },
      });
      expect(res.name).toBe('Nuevo');
    });

    it('lanza NotFound y no actualiza si la rutina es de otro usuario', async () => {
      const { service, prisma } = build();
      prisma.routine.findFirst.mockResolvedValue(null);
      await expect(service.update(OTHER, 'r1', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.routine.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('borra la rutina propia (cascade a días y ejercicios)', async () => {
      const { service, prisma } = build();
      prisma.routine.findFirst.mockResolvedValue({ id: 'r1', userId: USER });
      prisma.routine.delete.mockResolvedValue({ id: 'r1' });

      await service.remove(USER, 'r1');

      expect(prisma.routine.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    });

    it('lanza NotFound y no borra si no es del usuario', async () => {
      const { service, prisma } = build();
      prisma.routine.findFirst.mockResolvedValue(null);
      await expect(service.remove(OTHER, 'r1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.routine.delete).not.toHaveBeenCalled();
    });
  });

  describe('activate', () => {
    it('desactiva las demás y activa la indicada en una transacción', async () => {
      const { service, prisma } = build();
      prisma.routine.findFirst
        .mockResolvedValueOnce({ id: 'r1', userId: USER }) // ownership
        .mockResolvedValueOnce({ id: 'r1', userId: USER, isActive: true, days: [] }); // findOne final
      prisma.routine.updateMany.mockResolvedValue({ count: 1 });
      prisma.routine.update.mockResolvedValue({ id: 'r1', isActive: true });

      await service.activate(USER, 'r1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.routine.updateMany).toHaveBeenCalledWith({
        where: { userId: USER, isActive: true },
        data: { isActive: false },
      });
      expect(prisma.routine.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { isActive: true },
      });
    });

    it('lanza NotFound si la rutina no es del usuario', async () => {
      const { service, prisma } = build();
      prisma.routine.findFirst.mockResolvedValue(null);
      await expect(service.activate(OTHER, 'r1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('duplicate', () => {
    it('copia la rutina completa con sus días y ejercicios, inactiva y con sufijo (copia)', async () => {
      const { service, prisma } = build();
      prisma.routine.findFirst.mockResolvedValue({
        id: 'r1',
        userId: USER,
        name: 'Full body',
        goal: 'STRENGTH',
        days: [
          {
            dayOfWeek: 0,
            title: 'Pecho',
            isRestDay: false,
            exercises: [
              {
                exerciseId: 'e1',
                order: 0,
                targetSets: 4,
                targetReps: '8-12',
                targetWeight: 60,
                restSeconds: 90,
              },
            ],
          },
          { dayOfWeek: 1, title: null, isRestDay: true, exercises: [] },
        ],
      });
      prisma.routine.create.mockResolvedValue({ id: 'r2' });

      await service.duplicate(USER, 'r1');

      const arg = prisma.routine.create.mock.calls[0][0];
      expect(arg.data.userId).toBe(USER);
      expect(arg.data.isActive).toBe(false);
      expect(arg.data.name).toBe('Full body (copia)');
      expect(arg.data.goal).toBe('STRENGTH');
      const days = arg.data.days.create;
      expect(days).toHaveLength(2);
      // El primer día conserva su ejercicio con los mismos objetivos.
      expect(days[0].dayOfWeek).toBe(0);
      expect(days[0].exercises.create[0]).toMatchObject({
        exerciseId: 'e1',
        order: 0,
        targetSets: 4,
        targetReps: '8-12',
        restSeconds: 90,
      });
    });

    it('lanza NotFound si la rutina de origen no es del usuario', async () => {
      const { service, prisma } = build();
      prisma.routine.findFirst.mockResolvedValue(null);
      await expect(service.duplicate(OTHER, 'r1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.routine.create).not.toHaveBeenCalled();
    });
  });

  describe('updateDay', () => {
    it('marca un día como descanso comprobando propiedad vía la rutina', async () => {
      const { service, prisma } = build();
      prisma.routineDay.findFirst.mockResolvedValue({ id: 'd1', routineId: 'r1', dayOfWeek: 2 });
      prisma.routineDay.update.mockResolvedValue({ id: 'd1', isRestDay: true });

      await service.updateDay(USER, 'r1', 2, { isRestDay: true, title: 'Descanso' });

      const findArg = prisma.routineDay.findFirst.mock.calls[0][0];
      // La query filtra por dayOfWeek + rutina propietaria (aislamiento por usuario).
      expect(findArg.where).toEqual({
        dayOfWeek: 2,
        routineId: 'r1',
        routine: { userId: USER },
      });
      expect(prisma.routineDay.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { isRestDay: true, title: 'Descanso' },
      });
    });

    it('lanza BadRequest si dayOfWeek está fuera de 0..6', async () => {
      const { service, prisma } = build();
      await expect(service.updateDay(USER, 'r1', 7, { isRestDay: true })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.routineDay.findFirst).not.toHaveBeenCalled();
    });

    it('lanza NotFound si el día no existe o la rutina no es del usuario', async () => {
      const { service, prisma } = build();
      prisma.routineDay.findFirst.mockResolvedValue(null);
      await expect(service.updateDay(OTHER, 'r1', 2, { isRestDay: true })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('addExercise', () => {
    it('añade un ejercicio al final del día (order = número de ejercicios existentes)', async () => {
      const { service, prisma } = build();
      prisma.routineDay.findFirst.mockResolvedValue({ id: 'd1', routineId: 'r1', dayOfWeek: 0 });
      prisma.exercise.findFirst.mockResolvedValue({ id: 'e1', isActive: true });
      prisma.routineDayExercise.count.mockResolvedValue(2);
      prisma.routineDayExercise.create.mockImplementation(async ({ data }: any) => ({
        id: 'rde3',
        ...data,
      }));

      const res = await service.addExercise(USER, 'r1', 0, {
        exerciseId: 'e1',
        targetSets: 3,
        targetReps: '10',
      });

      const arg = prisma.routineDayExercise.create.mock.calls[0][0];
      expect(arg.data.routineDayId).toBe('d1');
      expect(arg.data.exerciseId).toBe('e1');
      expect(arg.data.order).toBe(2); // se coloca al final
      expect(res.order).toBe(2);
    });

    it('lanza NotFound si el ejercicio no existe o está inactivo', async () => {
      const { service, prisma } = build();
      prisma.routineDay.findFirst.mockResolvedValue({ id: 'd1', routineId: 'r1', dayOfWeek: 0 });
      prisma.exercise.findFirst.mockResolvedValue(null);

      await expect(
        service.addExercise(USER, 'r1', 0, { exerciseId: 'nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.routineDayExercise.create).not.toHaveBeenCalled();
    });

    it('lanza NotFound si el día no pertenece al usuario', async () => {
      const { service, prisma } = build();
      prisma.routineDay.findFirst.mockResolvedValue(null);
      await expect(
        service.addExercise(OTHER, 'r1', 0, { exerciseId: 'e1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateExercise', () => {
    it('edita los objetivos de un ejercicio del día', async () => {
      const { service, prisma } = build();
      prisma.routineDay.findFirst.mockResolvedValue({ id: 'd1', routineId: 'r1', dayOfWeek: 0 });
      prisma.routineDayExercise.findFirst.mockResolvedValue({ id: 'rde1', routineDayId: 'd1' });
      prisma.routineDayExercise.update.mockResolvedValue({ id: 'rde1', targetSets: 5 });

      await service.updateExercise(USER, 'r1', 0, 'rde1', { targetSets: 5 });

      const findArg = prisma.routineDayExercise.findFirst.mock.calls[0][0];
      expect(findArg.where).toEqual({ id: 'rde1', routineDayId: 'd1' });
      // Se actualiza y se devuelve con el ejercicio embebido.
      expect(prisma.routineDayExercise.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rde1' }, data: { targetSets: 5 } }),
      );
    });

    it('lanza NotFound si el ejercicio no está en ese día', async () => {
      const { service, prisma } = build();
      prisma.routineDay.findFirst.mockResolvedValue({ id: 'd1', routineId: 'r1', dayOfWeek: 0 });
      prisma.routineDayExercise.findFirst.mockResolvedValue(null);
      await expect(
        service.updateExercise(USER, 'r1', 0, 'nope', { targetSets: 5 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.routineDayExercise.update).not.toHaveBeenCalled();
    });
  });

  describe('removeExercise', () => {
    it('quita un ejercicio del día', async () => {
      const { service, prisma } = build();
      prisma.routineDay.findFirst.mockResolvedValue({ id: 'd1', routineId: 'r1', dayOfWeek: 0 });
      prisma.routineDayExercise.findFirst.mockResolvedValue({ id: 'rde1', routineDayId: 'd1' });
      prisma.routineDayExercise.delete.mockResolvedValue({ id: 'rde1' });

      await service.removeExercise(USER, 'r1', 0, 'rde1');

      expect(prisma.routineDayExercise.delete).toHaveBeenCalledWith({ where: { id: 'rde1' } });
    });

    it('lanza NotFound si el ejercicio no está en ese día', async () => {
      const { service, prisma } = build();
      prisma.routineDay.findFirst.mockResolvedValue({ id: 'd1', routineId: 'r1', dayOfWeek: 0 });
      prisma.routineDayExercise.findFirst.mockResolvedValue(null);
      await expect(service.removeExercise(USER, 'r1', 0, 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.routineDayExercise.delete).not.toHaveBeenCalled();
    });
  });

  describe('reorderExercises', () => {
    it('reasigna el order según la posición en orderedIds, en una transacción', async () => {
      const { service, prisma } = build();
      prisma.routineDay.findFirst.mockResolvedValue({ id: 'd1', routineId: 'r1', dayOfWeek: 0 });
      prisma.routineDayExercise.findMany.mockResolvedValue([
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ]);
      prisma.routineDayExercise.update.mockResolvedValue({});
      // La operación devuelve la rutina completa (findOne) al terminar.
      prisma.routine.findFirst.mockResolvedValue({ id: 'r1', userId: USER, days: [] });

      await service.reorderExercises(USER, 'r1', 0, ['c', 'a', 'b']);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // c→0, a→1, b→2
      expect(prisma.routineDayExercise.update).toHaveBeenCalledWith({
        where: { id: 'c' },
        data: { order: 0 },
      });
      expect(prisma.routineDayExercise.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { order: 1 },
      });
      expect(prisma.routineDayExercise.update).toHaveBeenCalledWith({
        where: { id: 'b' },
        data: { order: 2 },
      });
    });

    it('lanza BadRequest si orderedIds no coincide exactamente con los ejercicios del día', async () => {
      const { service, prisma } = build();
      prisma.routineDay.findFirst.mockResolvedValue({ id: 'd1', routineId: 'r1', dayOfWeek: 0 });
      prisma.routineDayExercise.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

      await expect(
        service.reorderExercises(USER, 'r1', 0, ['a', 'x']),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
