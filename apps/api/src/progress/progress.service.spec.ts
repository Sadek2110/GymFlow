import { ProgressService } from './progress.service';
import { createPrismaMock } from '../../test/prisma.mock';
import { appDayOfWeek, epley1rm } from './week.util';

const USER = 'user-1';

function build() {
  const prisma = createPrismaMock();
  const service = new ProgressService(prisma as any);
  return { service, prisma };
}

describe('ProgressService', () => {
  describe('overview', () => {
    it('arma "hoy toca" desde la rutina activa, el progreso semanal y el último peso', async () => {
      const { service, prisma } = build();
      const now = new Date(2024, 0, 3, 10, 0); // miércoles
      jest.spyOn(service, 'now').mockReturnValue(now);
      const today = appDayOfWeek(now);

      prisma.routine.findFirst.mockResolvedValue({
        id: 'r1',
        name: 'PPL',
        days: [
          { id: 'd-hoy', dayOfWeek: today, title: 'Pierna', isRestDay: false, exercises: [{ id: 'rde1' }] },
          { id: 'd-otro', dayOfWeek: (today + 1) % 7, title: null, isRestDay: true, exercises: [] },
        ],
      });
      prisma.userProfile.findUnique.mockResolvedValue({ trainingDaysPerWeek: 4 });
      prisma.bodyMeasurement.findFirst.mockResolvedValue({ weightKg: 80 });
      prisma.workoutSession.count.mockResolvedValue(2);
      prisma.workoutSession.findFirst
        .mockResolvedValueOnce({ id: 's-last', date: now, status: 'completed' }) // última
        .mockResolvedValueOnce(null); // activa

      const res = await service.overview(USER);

      expect(res.today).toMatchObject({ routineDayId: 'd-hoy', title: 'Pierna', isRestDay: false });
      expect(res.today!.exercises).toHaveLength(1);
      expect(res.activeRoutine).toMatchObject({ id: 'r1', name: 'PPL' });
      expect(res.week).toMatchObject({ completed: 2, target: 4 });
      expect(res.week.weekStart).toBeInstanceOf(Date);
      expect(res.lastWeightKg).toBe(80);
      expect(res.lastSession).toMatchObject({ id: 's-last', status: 'completed' });
      expect(res.activeSession).toBeNull();

      // El conteo semanal filtra por completadas desde el inicio de semana.
      const countArg = prisma.workoutSession.count.mock.calls[0][0];
      expect(countArg.where).toMatchObject({ userId: USER, status: 'completed' });
      expect(countArg.where.date.gte).toBeInstanceOf(Date);
    });

    it('sin rutina activa: today null y objetivo semanal por defecto 3', async () => {
      const { service, prisma } = build();
      jest.spyOn(service, 'now').mockReturnValue(new Date(2024, 0, 3, 10, 0));
      prisma.routine.findFirst.mockResolvedValue(null);
      prisma.userProfile.findUnique.mockResolvedValue(null);
      prisma.bodyMeasurement.findFirst.mockResolvedValue(null);
      prisma.workoutSession.count.mockResolvedValue(0);
      prisma.workoutSession.findFirst.mockResolvedValue(null);

      const res = await service.overview(USER);

      expect(res.today).toBeNull();
      expect(res.activeRoutine).toBeNull();
      expect(res.week.target).toBe(3);
      expect(res.lastWeightKg).toBeNull();
    });

    it('expone la sesión en curso si la hay', async () => {
      const { service, prisma } = build();
      jest.spyOn(service, 'now').mockReturnValue(new Date(2024, 0, 3, 10, 0));
      prisma.routine.findFirst.mockResolvedValue(null);
      prisma.userProfile.findUnique.mockResolvedValue(null);
      prisma.bodyMeasurement.findFirst.mockResolvedValue(null);
      prisma.workoutSession.count.mockResolvedValue(0);
      prisma.workoutSession.findFirst
        .mockResolvedValueOnce(null) // última
        .mockResolvedValueOnce({ id: 's-activa', status: 'in_progress', routineDayId: 'd1' });

      const res = await service.overview(USER);
      expect(res.activeSession).toMatchObject({ id: 's-activa' });
    });
  });

  describe('records (PRs al vuelo)', () => {
    it('calcula el mejor peso por ejercicio, desempatando por más reps', async () => {
      const { service, prisma } = build();
      const d = (n: number) => new Date(2024, 0, n);
      prisma.workoutExerciseLog.findMany.mockResolvedValue([
        { exerciseId: 'e1', weightKg: 60, reps: 10, exercise: { id: 'e1', name: 'Press' }, session: { date: d(1) } },
        { exerciseId: 'e1', weightKg: 70, reps: 5, exercise: { id: 'e1', name: 'Press' }, session: { date: d(2) } },
        { exerciseId: 'e1', weightKg: 70, reps: 6, exercise: { id: 'e1', name: 'Press' }, session: { date: d(3) } },
        { exerciseId: 'e2', weightKg: 100, reps: 3, exercise: { id: 'e2', name: 'Peso muerto' }, session: { date: d(1) } },
      ]);

      const res = await service.records(USER);

      const e1 = res.find((r: any) => r.exerciseId === 'e1');
      const e2 = res.find((r: any) => r.exerciseId === 'e2');
      expect(e1).toMatchObject({ weightKg: 70, reps: 6 }); // mismo peso, más reps
      expect(e1!.e1rm).toBe(epley1rm(70, 6));
      expect(e2).toMatchObject({ weightKg: 100, reps: 3 });

      // Solo series del usuario y con peso registrado.
      const arg = prisma.workoutExerciseLog.findMany.mock.calls[0][0];
      expect(arg.where).toMatchObject({ session: { userId: USER }, weightKg: { not: null } });
    });

    it('devuelve vacío si no hay series con peso', async () => {
      const { service, prisma } = build();
      prisma.workoutExerciseLog.findMany.mockResolvedValue([]);
      expect(await service.records(USER)).toEqual([]);
    });
  });

  describe('exerciseSeries (serie temporal por ejercicio)', () => {
    it('agrupa por sesión, toma la mejor serie y estima el e1RM', async () => {
      const { service, prisma } = build();
      prisma.workoutExerciseLog.findMany.mockResolvedValue([
        { sessionId: 's1', weightKg: 60, reps: 10, session: { id: 's1', date: new Date(2024, 0, 1) } },
        { sessionId: 's1', weightKg: 62, reps: 8, session: { id: 's1', date: new Date(2024, 0, 1) } },
        { sessionId: 's2', weightKg: 65, reps: 5, session: { id: 's2', date: new Date(2024, 0, 8) } },
      ]);

      const res = await service.exerciseSeries(USER, 'e1');

      expect(res).toHaveLength(2);
      expect(res[0]).toMatchObject({ sessionId: 's1', weightKg: 62, reps: 8 });
      expect(res[0].e1rm).toBe(epley1rm(62, 8));
      expect(res[1]).toMatchObject({ sessionId: 's2', weightKg: 65, reps: 5 });

      const arg = prisma.workoutExerciseLog.findMany.mock.calls[0][0];
      expect(arg.where).toMatchObject({
        exerciseId: 'e1',
        session: { userId: USER, status: 'completed' },
      });
    });
  });

  describe('weekly', () => {
    it('cuenta días entrenados y volumen total de la semana indicada', async () => {
      const { service, prisma } = build();
      prisma.workoutSession.findMany.mockResolvedValue([
        {
          date: new Date(2024, 0, 1), // lunes
          logs: [
            { weightKg: 60, reps: 10 },
            { weightKg: 60, reps: 10 },
          ],
        },
        {
          date: new Date(2024, 0, 3), // miércoles
          logs: [{ weightKg: 100, reps: 5 }],
        },
      ]);
      prisma.userProfile.findUnique.mockResolvedValue({ trainingDaysPerWeek: 5 });

      const res = await service.weekly(USER, '2024-01-01');

      expect(res.daysTrained).toBe(2); // lunes + miércoles
      expect(res.totalVolume).toBe(1700); // 60*10 + 60*10 + 100*5
      expect(res.sessions).toBe(2);
      expect(res.target).toBe(5);

      const arg = prisma.workoutSession.findMany.mock.calls[0][0];
      expect(arg.where).toMatchObject({ userId: USER, status: 'completed' });
      expect(arg.where.date.gte).toBeInstanceOf(Date);
      expect(arg.where.date.lt).toBeInstanceOf(Date);
    });

    it('sin weekStart usa la semana actual (now)', async () => {
      const { service, prisma } = build();
      jest.spyOn(service, 'now').mockReturnValue(new Date(2024, 0, 10, 12, 0));
      prisma.workoutSession.findMany.mockResolvedValue([]);
      prisma.userProfile.findUnique.mockResolvedValue(null);

      const res = await service.weekly(USER);
      expect(res.daysTrained).toBe(0);
      expect(res.totalVolume).toBe(0);
      expect(res.target).toBe(3);
    });
  });
});
