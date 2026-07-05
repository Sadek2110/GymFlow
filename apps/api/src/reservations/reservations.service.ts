import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ReservaGymConfig } from '../config/configuration';
import { RunReservationDto } from './dto/run-reservation.dto';

// reservaGym reserva siempre en el mismo centro (C.D. Díaz Flor, Ceuta).
const FACILITY = 'C.D. Díaz Flor';
const SERVICE = 'Sala Cardio-Fitness';
const DEFAULT_SLOT = 'Horario por defecto del servidor';
const RUN_TIMEOUT_MS = 200_000; // reservaGym mata el proceso a los 180 s (guía §5.7)
const HEALTH_TIMEOUT_MS = 10_000;
const MAX_LOG = 5_000;

@Injectable()
export class ReservationsService {
  private readonly config: ReservaGymConfig;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.config = configService.get<ReservaGymConfig>('reservagym') ?? { enabled: false };
  }

  async health() {
    this.assertEnabled();
    try {
      const res = await this.doFetch(`${this.config.url}/health`, { method: 'GET' }, HEALTH_TIMEOUT_MS);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch {
      // La app nunca cae porque el microservicio falle (guía §5.7).
      throw new BadGatewayException('El servicio de reservas no está disponible ahora mismo');
    }
  }

  async run(userId: string, dto: RunReservationDto) {
    this.assertEnabled();
    const dryRun = dto.dryRun ?? true; // por seguridad, no confirma salvo petición explícita

    let res: Response;
    let result: any;
    try {
      res = await this.doFetch(
        `${this.config.url}/reservar`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          // Solo dryRun y time: las credenciales del gimnasio viven en el .env de reservaGym.
          body: JSON.stringify({ dryRun, ...(dto.time ? { time: dto.time } : {}) }),
        },
        RUN_TIMEOUT_MS,
      );
      result = await res.json().catch(() => null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.persist(userId, dto, 'failed', `Sin respuesta de reservaGym: ${message}`);
      throw new BadGatewayException('El servicio de reservas no respondió a tiempo');
    }

    if (!res.ok || !result?.ok) {
      await this.persist(userId, dto, 'failed', this.buildLog(result) || `HTTP ${res.status}`);
      throw new BadGatewayException(result?.error ?? 'La reserva no se pudo completar');
    }

    const status = result.dryRun ? 'dry_run' : 'confirmed';
    return this.persist(userId, dto, status, this.buildLog(result));
  }

  async list(userId: string) {
    this.assertEnabled();
    return this.prisma.reservation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- Helpers ---

  private assertEnabled(): void {
    if (!this.config.enabled) {
      throw new NotFoundException('El módulo de reservas no está activado');
    }
  }

  // Aislado para tests deterministas; reservaGym reserva para el día siguiente.
  now(): Date {
    return new Date();
  }

  private targetDate(): Date {
    const d = this.now();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private async doFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await globalThis.fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private buildLog(result: any): string {
    const parts = [result?.stdout, result?.stderr, result?.message, result?.error].filter(Boolean);
    return parts.join('\n').slice(0, MAX_LOG);
  }

  private persist(userId: string, dto: RunReservationDto, status: string, rawLog: string) {
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
