import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from './reservations.service';
import { TelegramService } from '../notifications/telegram.service';

const FACILITY = 'C.D. Díaz Flor';
const SERVICE = 'Sala Cardio-Fitness';

// Decisión: por qué el cron a las 04:59:55 en vez de 05:00:00.
// La ventana de reserva del ICD Ceuta abre exactamente a las 05:00. Si arrancamos justo
// a esa hora perdemos ~2-3 s en cold start de Playwright. Adelantar 5 s nos deja listos
// para hacer submit en cuanto abre.
const CRON_EXPR = '55 59 4 * * *';
const TZ = 'Europe/Madrid';

export interface ShouldReserveResult {
  shouldReserve: boolean;
  reason?: 'no-active-routine' | 'day-not-in-routine' | 'rest-day' | 'empty-day';
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

  // ---------- CRON DIARIO ----------
  @Cron(CRON_EXPR, { timeZone: TZ })
  async runDaily() {
    this.logger.log('Iniciando ciclo de auto-reserva');

    const users = await this.prisma.user.findMany({
      where: { autoReserveEnabled: true },
    });

    if (users.length === 0) {
      this.logger.log('No hay usuarios con auto-reserva activa');
      return;
    }

    for (const user of users) {
      try {
        await this.runForUser(user.id, user.autoReserveTime ?? undefined);
      } catch (err) {
        // Nunca dejamos que un fallo en un usuario tumbe el resto.
        this.logger.error(
          `Auto-reserva fallida para ${user.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    this.logger.log(`Ciclo terminado: ${users.length} usuario(s) procesado(s)`);
  }

  // ---------- LÓGICA POR USUARIO ----------
  async runForUser(userId: string, time?: string) {
    const tomorrow = this.addDays(this.now(), 1);
    const check = await this.shouldReserve(userId, tomorrow);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const userName = user?.name ?? 'Usuario';

    if (!check.shouldReserve) {
      this.logger.log(`Skip ${userId}: ${check.reason}`);
      await this.persistSkip(userId, tomorrow, time, check.reason!);
      await this.telegram.send(
        `💤 <b>${userName}</b>: mañana descansas, no se reserva.`,
      );
      return { skipped: true, reason: check.reason };
    }

    this.logger.log(`Reservando para ${userId} (${check.dayTitle})`);
    // Delegamos en el servicio existente: él persiste el Reservation con status
    // dry_run/confirmed/failed y llama a ReservaGym con solo { dryRun, time }.
    try {
      const result = await this.reservations.run(userId, {
        dryRun: false,
        time,
      });
      const status = result.status;
      if (status === 'confirmed') {
        await this.telegram.send(
          `✅ <b>${userName}</b>: reserva hecha para ${check.dayTitle}.`,
        );
      } else if (status === 'dry_run') {
        await this.telegram.send(
          `🧪 <b>${userName}</b>: prueba de reserva (dry run) completada para ${check.dayTitle}.`,
        );
      } else {
        await this.telegram.send(
          `❌ <b>${userName}</b>: fallo en reserva. Revisa logs.`,
        );
      }
      return result;
    } catch (err) {
      await this.telegram.send(
        `❌ <b>${userName}</b>: fallo en reserva. Revisa logs.`,
      );
      throw err;
    }
  }

  // ---------- DECISIÓN ----------
  async shouldReserve(
    userId: string,
    date: Date,
  ): Promise<ShouldReserveResult> {
    const routine = await this.prisma.routine.findFirst({
      where: { userId, isActive: true },
      include: { days: { include: { exercises: true } } },
    });

    if (!routine) return { shouldReserve: false, reason: 'no-active-routine' };

    // JS: getDay() → 0=domingo … 6=sábado. Nuestra convención: 0=lunes … 6=domingo.
    const dow = (date.getDay() + 6) % 7;
    const day = routine.days.find((d) => d.dayOfWeek === dow);

    if (!day) return { shouldReserve: false, reason: 'day-not-in-routine' };
    if (day.isRestDay) return { shouldReserve: false, reason: 'rest-day' };
    if (day.exercises.length === 0)
      return { shouldReserve: false, reason: 'empty-day' };

    return { shouldReserve: true, dayTitle: day.title ?? 'Entrenamiento' };
  }

  // ---------- HELPERS ----------
  // Aislados para permitir tests deterministas (mockear now() en Jest).
  now(): Date {
    return new Date();
  }

  private addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    r.setHours(0, 0, 0, 0);
    return r;
  }

  private async persistSkip(
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
