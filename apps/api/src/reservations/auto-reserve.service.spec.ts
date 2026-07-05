import { Test } from '@nestjs/testing';
import { AutoReserveService } from './auto-reserve.service';
import { ReservationsService } from './reservations.service';
import { TelegramService } from '../notifications/telegram.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma.mock';

describe('AutoReserveService', () => {
  let service: AutoReserveService;
  let prisma: PrismaMock;
  let reservations: { run: jest.Mock };
  let telegram: { send: jest.Mock };

  const USER = 'user-1';

  beforeEach(async () => {
    prisma = createPrismaMock();
    reservations = { run: jest.fn() };
    telegram = { send: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AutoReserveService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReservationsService, useValue: reservations },
        { provide: TelegramService, useValue: telegram },
      ],
    }).compile();
    service = moduleRef.get(AutoReserveService);
  });

  describe('shouldReserve', () => {
    it('sin rutina activa → skip con no-active-routine', async () => {
      prisma.routine.findFirst.mockResolvedValue(null);
      const res = await service.shouldReserve(USER, new Date('2026-07-07')); // martes
      expect(res).toEqual({ shouldReserve: false, reason: 'no-active-routine' });
    });

    it('día de descanso → skip con rest-day', async () => {
      prisma.routine.findFirst.mockResolvedValue({
        id: 'r', isActive: true, days: [
          { dayOfWeek: 1 /* martes */, isRestDay: true, exercises: [], title: null },
        ],
      });
      const res = await service.shouldReserve(USER, new Date('2026-07-07T00:00:00Z'));
      expect(res).toEqual({ shouldReserve: false, reason: 'rest-day' });
    });

    it('día de entrenamiento con ejercicios → shouldReserve=true', async () => {
      prisma.routine.findFirst.mockResolvedValue({
        id: 'r', isActive: true, days: [
          {
            dayOfWeek: 1, isRestDay: false,
            exercises: [{ id: 'e1' }], title: 'Pecho y tríceps',
          },
        ],
      });
      const res = await service.shouldReserve(USER, new Date('2026-07-07T00:00:00Z'));
      expect(res).toEqual({ shouldReserve: true, dayTitle: 'Pecho y tríceps' });
    });

    it('día sin ejercicios (aunque no sea rest) → skip con empty-day', async () => {
      prisma.routine.findFirst.mockResolvedValue({
        id: 'r', isActive: true, days: [
          { dayOfWeek: 1, isRestDay: false, exercises: [], title: null },
        ],
      });
      const res = await service.shouldReserve(USER, new Date('2026-07-07T00:00:00Z'));
      expect(res).toEqual({ shouldReserve: false, reason: 'empty-day' });
    });
  });

  describe('runForUser', () => {
    beforeEach(() => {
      // Fijamos "hoy" en lunes 6 julio 2026 → "mañana" = martes 7
      jest.spyOn(service, 'now').mockReturnValue(new Date('2026-07-06T04:59:55+02:00'));
    });

    it('cuando shouldReserve=true → llama a reservations.run con dryRun=false', async () => {
      prisma.routine.findFirst.mockResolvedValue({
        id: 'r', isActive: true, days: [
          { dayOfWeek: 1, isRestDay: false, exercises: [{ id: 'e1' }], title: 'Pecho' },
        ],
      });
      prisma.gymCredential.count.mockResolvedValue(1);
      reservations.run.mockResolvedValue({ status: 'confirmed' });
      await service.runForUser(USER, ['09:00 - 10:00']);
      expect(reservations.run).toHaveBeenCalledWith(USER, {
        dryRun: false, time: '09:00 - 10:00',
      });
    });

    it('cuando shouldReserve=false → NO llama a reservations.run y crea Reservation skipped', async () => {
      prisma.routine.findFirst.mockResolvedValue({
        id: 'r', isActive: true, days: [
          { dayOfWeek: 1, isRestDay: true, exercises: [], title: null },
        ],
      });
      prisma.reservation.create.mockResolvedValue({ id: 'skip-1' });

      const res = await service.runForUser(USER);

      expect(reservations.run).not.toHaveBeenCalled();
      expect(prisma.reservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: USER, status: 'skipped' }),
      });
      expect(res).toEqual({ skipped: true, reason: 'rest-day' });
    });

    it('itera varias franjas en secuencia y un fallo no bloquea la siguiente', async () => {
      prisma.routine.findFirst.mockResolvedValue({
        id: 'r',
        isActive: true,
        days: [{
          dayOfWeek: 1,
          isRestDay: false,
          exercises: [{ id: 'e1' }],
          title: 'Pecho',
        }],
      });
      prisma.gymCredential.count.mockResolvedValue(1);
      reservations.run
        .mockRejectedValueOnce(new Error('sin plaza'))
        .mockResolvedValueOnce({ status: 'confirmed' });

      const result = await service.runForUser(USER, [
        '09:00 - 10:00',
        '18:00 - 19:00',
      ]);

      expect(reservations.run).toHaveBeenCalledTimes(2);
      expect(result).toEqual([
        { time: '09:00 - 10:00', status: 'failed' },
        { time: '18:00 - 19:00', status: 'confirmed' },
      ]);
    });

    it('sin credenciales persiste skip y no intenta reservar', async () => {
      prisma.routine.findFirst.mockResolvedValue({
        id: 'r',
        isActive: true,
        days: [{
          dayOfWeek: 1,
          isRestDay: false,
          exercises: [{ id: 'e1' }],
          title: 'Pecho',
        }],
      });
      prisma.gymCredential.count.mockResolvedValue(0);

      await expect(service.runForUser(USER)).resolves.toEqual({
        skipped: true,
        reason: 'no-credentials',
      });
      expect(reservations.run).not.toHaveBeenCalled();
    });
  });
});
