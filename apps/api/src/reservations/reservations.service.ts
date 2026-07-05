import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { ReservaGymConfig } from '../config/configuration';
import { RunReservationDto } from './dto/run-reservation.dto';

const FACILITY = 'C.D. Díaz Flor';
const SERVICE = 'Sala Cardio-Fitness';
const DEFAULT_SLOT = 'Horario por defecto del servidor';
const RUN_TIMEOUT_MS = 200_000;
const HEALTH_TIMEOUT_MS = 10_000;
const LOGIN_TIMEOUT_MS = 60_000;
const MAX_LOG = 5_000;

@Injectable()
export class ReservationsService {
  private readonly config: ReservaGymConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    configService: ConfigService,
  ) {
    this.config = configService.get<ReservaGymConfig>('reservagym') ?? {
      enabled: false,
    };
  }

  async health() {
    this.assertEnabled();
    try {
      const response = await this.doFetch(
        `${this.config.url}/health`,
        { method: 'GET' },
        HEALTH_TIMEOUT_MS,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    } catch {
      throw new BadGatewayException(
        'El servicio de reservas no está disponible ahora mismo',
      );
    }
  }

  async run(userId: string, dto: RunReservationDto) {
    this.assertEnabled();
    const credentials = await this.getCredentials(userId);
    const timeSlot = dto.time ?? DEFAULT_SLOT;
    const duplicate = await this.prisma.reservation.findFirst({
      where: {
        userId,
        date: this.targetDate(),
        timeSlot,
        status: { in: ['pending', 'confirmed'] },
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'Ya tienes una reserva activa para esa franja',
      );
    }

    const dryRun = dto.dryRun ?? true;
    let response: Response;
    let result: any;
    try {
      response = await this.doFetch(
        `${this.config.url}/reservar`,
        {
          method: 'POST',
          headers: this.serviceHeaders(),
          body: JSON.stringify({
            dryRun,
            ...credentials,
            ...(dto.time ? { time: dto.time } : {}),
          }),
        },
        RUN_TIMEOUT_MS,
      );
      result = await response.json().catch(() => null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.persist(
        userId,
        dto,
        'failed',
        `Sin respuesta de ReservaGym: ${message}`,
      );
      throw new BadGatewayException(
        'El servicio de reservas no respondió a tiempo',
      );
    }
    const rawLog = this.buildLog(result, Object.values(credentials));
    if (!response.ok || !result?.ok) {
      await this.persist(
        userId,
        dto,
        'failed',
        rawLog || `HTTP ${response.status}`,
      );
      throw new BadGatewayException(
        result?.error ?? 'La reserva no se pudo completar',
      );
    }
    return this.persist(
      userId,
      dto,
      result.dryRun ? 'dry_run' : 'confirmed',
      rawLog,
    );
  }

  async testLogin(userId: string) {
    this.assertEnabled();
    const credentials = await this.getCredentials(userId);
    try {
      const response = await this.doFetch(
        `${this.config.url}/reservar`,
        {
          method: 'POST',
          headers: this.serviceHeaders(),
          body: JSON.stringify({
            dryRun: true,
            loginOnly: true,
            ...credentials,
          }),
        },
        LOGIN_TIMEOUT_MS,
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        return { ok: false, message: 'El portal rechazó las credenciales' };
      }
      return { ok: true, message: 'Login correcto en el portal' };
    } catch {
      throw new BadGatewayException('El servicio de reservas no respondió');
    }
  }

  async cancel(userId: string, reservationId: string, dryRun: boolean) {
    this.assertEnabled();
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, userId },
    });
    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    if (reservation.status !== 'confirmed') {
      throw new BadRequestException(
        'Solo se pueden cancelar reservas confirmadas',
      );
    }
    const credentials = await this.getCredentials(userId);
    let response: Response;
    let result: any;
    try {
      response = await this.doFetch(
        `${this.config.url}/cancelar`,
        {
          method: 'POST',
          headers: this.serviceHeaders(),
          body: JSON.stringify({
            ...credentials,
            date: this.toPortalDate(reservation.date),
            time: reservation.timeSlot,
            dryRun,
          }),
        },
        RUN_TIMEOUT_MS,
      );
      result = await response.json().catch(() => null);
    } catch {
      throw new BadGatewayException(
        'El servicio de reservas no respondió a tiempo',
      );
    }
    if (!response.ok || !result?.ok) {
      throw new BadGatewayException(
        result?.error ?? 'No se pudo anular la reserva',
      );
    }
    if (dryRun) return { ok: true, dryRun: true };
    return this.prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        status: 'cancelled',
        rawLog: [
          reservation.rawLog,
          '--- CANCELACIÓN ---',
          this.buildLog(result, Object.values(credentials)),
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, MAX_LOG),
      },
    });
  }

  async list(userId: string) {
    this.assertEnabled();
    return this.prisma.reservation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getCredentials(userId: string) {
    const credential = await this.prisma.gymCredential.findUnique({
      where: { userId },
    });
    if (!credential) {
      throw new PreconditionFailedException(
        'Configura tus credenciales del gimnasio en Ajustes antes de reservar',
      );
    }
    return {
      dni: this.crypto.decrypt(credential.dniEnc),
      password: this.crypto.decrypt(credential.passwordEnc),
    };
  }

  private assertEnabled() {
    if (!this.config.enabled) {
      throw new NotFoundException('El módulo de reservas no está activado');
    }
  }

  now(): Date {
    return new Date();
  }

  private targetDate(): Date {
    const date = this.now();
    date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private toPortalDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${date.getFullYear()}`;
  }

  private serviceHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  private async doFetch(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await globalThis.fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private buildLog(result: any, secrets: string[] = []): string {
    let log = [result?.stdout, result?.stderr, result?.message, result?.error]
      .filter(Boolean)
      .join('\n')
      .slice(0, MAX_LOG)
      .replace(/("?password"?\s*[:=]\s*)"[^"]*"/gi, '$1"***"');
    for (const secret of secrets) {
      if (secret) log = log.split(secret).join('***');
    }
    return log;
  }

  private persist(
    userId: string,
    dto: RunReservationDto,
    status: string,
    rawLog: string,
  ) {
    return this.prisma.reservation.create({
      data: {
        userId,
        facility: FACILITY,
        service: SERVICE,
        date: this.targetDate(),
        timeSlot: dto.time ?? DEFAULT_SLOT,
        status,
        rawLog: rawLog || null,
      },
    });
  }
}
