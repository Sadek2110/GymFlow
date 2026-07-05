import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from './reservations.service';
import { TelegramService } from '../notifications/telegram.service';

const FACILITY = 'C.D. Díaz Flor';
const SERVICE = 'Sala Cardio-Fitness';
const CRON_EXPR = '55 59 4 * * *';
const TZ = 'Europe/Madrid';

export interface ShouldReserveResult {
  shouldReserve: boolean;
  reason?:
    | 'no-active-routine'
    | 'day-not-in-routine'
    | 'rest-day'
    | 'empty-day';
  dayTitle?: string;
}

@Injectable()
export class AutoReserveService {
  private readonly logger = new Logger(AutoReserveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
    private readonly telegram: TelegramService,
  ) {}

  @Cron(CRON_EXPR, { timeZone: TZ })
  async runDaily() {
    const users = await this.prisma.user.findMany({
      where: { autoReserveEnabled: true },
    });
    for (const user of users) {
      try {
        await this.runForUser(user.id, user.autoReserveTimes);
      } catch (error) {
        this.logger.error(
          `Auto-reserva fallida para ${user.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async runForUser(userId: string, times: string[] = []) {
    const tomorrow = this.addDays(this.now(), 1);
    const check = await this.shouldReserve(userId, tomorrow);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const userName = user?.name ?? 'Usuario';

    if (!check.shouldReserve) {
      await this.persistSkip(userId, tomorrow, times[0], check.reason!);
      await this.telegram.send(
        `💤 <b>${userName}</b>: mañana descansas, no se reserva.`,
      );
      return { skipped: true, reason: check.reason };
    }

    const hasCredentials = await this.prisma.gymCredential.count({
      where: { userId },
    });
    if (!hasCredentials) {
      await this.persistSkip(userId, tomorrow, times[0], 'no-credentials');
      await this.telegram.send(
        `⚠️ <b>${userName}</b>: auto-reserva activada pero sin credenciales configuradas.`,
      );
      return { skipped: true, reason: 'no-credentials' };
    }

    const slots: Array<string | undefined> =
      times.length > 0 ? times : [undefined];
    const results: Array<{ time: string | undefined; status: string }> = [];
    for (const time of slots) {
      try {
        const reservation = await this.reservations.run(userId, {
          dryRun: false,
          time,
        });
        results.push({ time, status: reservation.status });
      } catch {
        results.push({ time, status: 'failed' });
      }
    }
    const confirmed = results.filter(
      (result) => result.status === 'confirmed',
    ).length;
    await this.telegram.send(
      `📋 <b>${userName}</b>: ${confirmed}/${results.length} reservas para ${check.dayTitle}.`,
    );
    return results;
  }

  async shouldReserve(
    userId: string,
    date: Date,
  ): Promise<ShouldReserveResult> {
    const routine = await this.prisma.routine.findFirst({
      where: { userId, isActive: true },
      include: { days: { include: { exercises: true } } },
    });
    if (!routine) return { shouldReserve: false, reason: 'no-active-routine' };
    const dayOfWeek = (date.getDay() + 6) % 7;
    const day = routine.days.find((item) => item.dayOfWeek === dayOfWeek);
    if (!day) return { shouldReserve: false, reason: 'day-not-in-routine' };
    if (day.isRestDay) return { shouldReserve: false, reason: 'rest-day' };
    if (day.exercises.length === 0) {
      return { shouldReserve: false, reason: 'empty-day' };
    }
    return {
      shouldReserve: true,
      dayTitle: day.title ?? 'Entrenamiento',
    };
  }

  now(): Date {
    return new Date();
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private persistSkip(
    userId: string,
    date: Date,
    time: string | undefined,
    reason: string,
  ) {
    return this.prisma.reservation.create({
      data: {
        userId,
        facility: FACILITY,
        service: SERVICE,
        date,
        timeSlot: time ?? 'default',
        status: 'skipped',
        rawLog: `Auto-reserva omitida: ${reason}`,
      },
    });
  }
}
