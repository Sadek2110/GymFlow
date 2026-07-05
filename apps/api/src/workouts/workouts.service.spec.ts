import { ConflictException, NotFoundException } from '@nestjs/common';
import { WorkoutsService } from './workouts.service';
import { createPrismaMock } from '../../test/prisma.mock';

const USER = 'user-1';
const OTHER = 'user-2';

function build() {
  const prisma = createPrismaMock();
  const service = new WorkoutsService(prisma as any);
  return { service, prisma };
}

describe('WorkoutsService', () => {
  describe('start', () => {
    it('lanza 409 si ya hay una sesión en curso y no crea otra', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue({ id: 's-old', status: 'in_progress' });

      await expect(service.start(USER, {})).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.workoutSession.create).not.toHaveBeenCalled();
    });

    it('crea una sesión libre (sin routineDayId): routineId null y sin plan', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue(null); // no hay activa
      prisma.workoutSession.create.mockResolvedValue({ id: 's1', routineDayId: null, logs: [] });

      const res = await service.start(USER, {});

      const arg = prisma.workoutSession.create.mock.calls[0][0];
      expect(arg.data.userId).toBe(USER);
      expect(arg.data.routineId).toBeNull();
      expect(res.plan).toBeNull();
      expect(prisma.routineDay.findFirst).not.toHaveBeenCalled();
    });

    it('precarga el plan del día de rutina y deriva el routineId', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      // 1ª llamada: validar propiedad del día. 2ª: attachPlan.
      prisma.routineDay.findFirst
        .mockResolvedValueOnce({ id: 'd1', routineId: 'r1' })
        .mockResolvedValueOnce({ id: 'd1', routineId: 'r1', exercises: [{ id: 'rde1' }] });
      prisma.workoutSession.create.mockResolvedValue({
        id: 's1',
        routineId: 'r1',
        routineDayId: 'd1',
        logs: [],
      });

      const res = await service.start(USER, { routineDayId: 'd1' });

      const findArg = prisma.routineDay.findFirst.mock.calls[0][0];
      // Aislamiento: el día debe pertenecer a una rutina del usuario.
      expect(findArg.where).toEqual({ id: 'd1', routine: { userId: USER } });
      const createArg = prisma.workoutSession.create.mock.calls[0][0];
      expect(createArg.data.routineId).toBe('r1');
      expect(createArg.data.routineDayId).toBe('d1');
      expect(res.plan).toMatchObject({ id: 'd1' });
    });

    it('lanza NotFound si el día de rutina no es del usuario', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      prisma.routineDay.findFirst.mockResolvedValue(null);

      await expect(service.start(OTHER, { routineDayId: 'd1' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.workoutSession.create).not.toHaveBeenCalled();
    });
  });

  describe('getActive', () => {
    it('devuelve null si no hay sesión en curso', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      expect(await service.getActive(USER)).toBeNull();
    });

    it('devuelve la sesión en curso del usuario con su plan', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue({
        id: 's1',
        status: 'in_progress',
        routineDayId: 'd1',
        logs: [],
      });
      prisma.routineDay.findFirst.mockResolvedValue({ id: 'd1', exercises: [] });

      const res = await service.getActive(USER);

      const arg = prisma.workoutSession.findFirst.mock.calls[0][0];
      expect(arg.where).toEqual({ userId: USER, status: 'in_progress' });
      expect(res?.plan).toMatchObject({ id: 'd1' });
    });
  });

  describe('findOne', () => {
    it('filtra por userId y lanza NotFound si no es del usuario', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      await expect(service.findOne(OTHER, 's1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('addLog', () => {
    it('registra una serie y devuelve la mejor marca previa de ese ejercicio', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue({ id: 's1', userId: USER, status: 'in_progress' });
      prisma.exercise.findFirst.mockResolvedValue({ id: 'e1', isActive: true });
      prisma.workoutExerciseLog.create.mockImplementation(async ({ data }: any) => ({ id: 'l1', ...data }));
      prisma.workoutExerciseLog.findFirst.mockResolvedValue({ weightKg: 80, reps: 5 });

      const res = await service.addLog(USER, 's1', { exerciseId: 'e1', setNumber: 1, reps: 8, weightKg: 60 });

      const createArg = prisma.workoutExerciseLog.create.mock.calls[0][0];
      expect(createArg.data.sessionId).toBe('s1');
      expect(createArg.data.exerciseId).toBe('e1');
      // La mejor marca previa excluye la sesión actual y se limita al propio usuario.
      const bestArg = prisma.workoutExerciseLog.findFirst.mock.calls[0][0];
      expect(bestArg.where).toMatchObject({
        exerciseId: 'e1',
        sessionId: { not: 's1' },
        session: { userId: USER },
      });
      expect(res.previousBest).toEqual({ weightKg: 80, reps: 5 });
      expect(res.log.id).toBe('l1');
    });

    it('devuelve previousBest null si no hay marcas anteriores', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue({ id: 's1', userId: USER, status: 'in_progress' });
      prisma.exercise.findFirst.mockResolvedValue({ id: 'e1', isActive: true });
      prisma.workoutExerciseLog.create.mockResolvedValue({ id: 'l1' });
      prisma.workoutExerciseLog.findFirst.mockResolvedValue(null);

      const res = await service.addLog(USER, 's1', { exerciseId: 'e1', setNumber: 1, reps: 8 });
      expect(res.previousBest).toBeNull();
    });

    it('lanza NotFound si el ejercicio no existe o está inactivo', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue({ id: 's1', userId: USER, status: 'in_progress' });
      prisma.exercise.findFirst.mockResolvedValue(null);
      await expect(
        service.addLog(USER, 's1', { exerciseId: 'nope', setNumber: 1, reps: 8 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.workoutExerciseLog.create).not.toHaveBeenCalled();
    });

    it('lanza 409 si la sesión ya no está en curso', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue({ id: 's1', userId: USER, status: 'completed' });
      await expect(
        service.addLog(USER, 's1', { exerciseId: 'e1', setNumber: 1, reps: 8 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lanza NotFound si la sesión no es del usuario', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue(null);
      await expect(
        service.addLog(OTHER, 's1', { exerciseId: 'e1', setNumber: 1, reps: 8 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateLog', () => {
    it('corrige una serie propia', async () => {
      const { service, prisma } = build();
      prisma.workoutExerciseLog.findFirst.mockResolvedValue({ id: 'l1', sessionId: 's1' });
      prisma.workoutExerciseLog.update.mockResolvedValue({ id: 'l1', reps: 10 });

      await service.updateLog(USER, 's1', 'l1', { reps: 10 });

      const findArg = prisma.workoutExerciseLog.findFirst.mock.calls[0][0];
      // Aislamiento: la serie pertenece a una sesión del usuario.
      expect(findArg.where).toEqual({ id: 'l1', sessionId: 's1', session: { userId: USER } });
      expect(prisma.workoutExerciseLog.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { reps: 10 },
      });
    });

    it('lanza NotFound si la serie no es del usuario', async () => {
      const { service, prisma } = build();
      prisma.workoutExerciseLog.findFirst.mockResolvedValue(null);
      await expect(service.updateLog(OTHER, 's1', 'l1', { reps: 10 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.workoutExerciseLog.update).not.toHaveBeenCalled();
    });
  });

  describe('removeLog', () => {
    it('borra una serie propia', async () => {
      const { service, prisma } = build();
      prisma.workoutExerciseLog.findFirst.mockResolvedValue({ id: 'l1', sessionId: 's1' });
      prisma.workoutExerciseLog.delete.mockResolvedValue({ id: 'l1' });

      await service.removeLog(USER, 's1', 'l1');

      expect(prisma.workoutExerciseLog.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    });

    it('lanza NotFound si la serie no es del usuario', async () => {
      const { service, prisma } = build();
      prisma.workoutExerciseLog.findFirst.mockResolvedValue(null);
      await expect(service.removeLog(OTHER, 's1', 'l1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.workoutExerciseLog.delete).not.toHaveBeenCalled();
    });
  });

  describe('finish', () => {
    it('marca la sesión como completed con finishedAt', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue({ id: 's1', userId: USER, status: 'in_progress' });
      prisma.workoutSession.update.mockResolvedValue({ id: 's1', status: 'completed' });

      await service.finish(USER, 's1', { notes: 'buena' });

      const arg = prisma.workoutSession.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 's1' });
      expect(arg.data).toMatchObject({ status: 'completed', notes: 'buena' });
      expect(arg.data.finishedAt).toBeInstanceOf(Date);
    });

    it('lanza 409 si la sesión no está en curso', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue({ id: 's1', userId: USER, status: 'completed' });
      await expect(service.finish(USER, 's1', {})).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.workoutSession.update).not.toHaveBeenCalled();
    });
  });

  describe('abandon', () => {
    it('marca la sesión como abandoned conservando las series', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findFirst.mockResolvedValue({ id: 's1', userId: USER, status: 'in_progress' });
      prisma.workoutSession.update.mockResolvedValue({ id: 's1', status: 'abandoned' });

      await service.abandon(USER, 's1');

      const arg = prisma.workoutSession.update.mock.calls[0][0];
      expect(arg.data.status).toBe('abandoned');
      expect(arg.data.finishedAt).toBeInstanceOf(Date);
      expect(prisma.workoutExerciseLog.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('list (historial)', () => {
    it('aplica filtros de estado, fechas, rutina y ejercicio con paginación', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findMany.mockResolvedValue([{ id: 's1' }]);
      prisma.workoutSession.count.mockResolvedValue(1);

      const res = await service.list(USER, {
        status: 'completed',
        from: '2026-01-01',
        to: '2026-02-01',
        routineId: 'r1',
        exerciseId: 'e1',
        page: 2,
        limit: 10,
      });

      const arg = prisma.workoutSession.findMany.mock.calls[0][0];
      expect(arg.where).toMatchObject({
        userId: USER,
        status: 'completed',
        routineId: 'r1',
        logs: { some: { exerciseId: 'e1' } },
      });
      expect(arg.where.date.gte).toBeInstanceOf(Date);
      expect(arg.where.date.lte).toBeInstanceOf(Date);
      expect(arg.skip).toBe(10);
      expect(arg.take).toBe(10);
      expect(res.meta).toEqual({ total: 1, page: 2, limit: 10, totalPages: 1 });
    });

    it('sin filtros: solo el userId, página 1 y límite 20', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findMany.mockResolvedValue([]);
      prisma.workoutSession.count.mockResolvedValue(0);

      const res = await service.list(USER, {});

      const arg = prisma.workoutSession.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ userId: USER });
      expect(arg.skip).toBe(0);
      expect(arg.take).toBe(20);
      expect(res.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 1 });
    });
  });
});
