import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StartWorkoutDto } from './dto/start-workout.dto';
import { AddLogDto } from './dto/add-log.dto';
import { UpdateLogDto } from './dto/update-log.dto';
import { FinishWorkoutDto } from './dto/finish-workout.dto';
import { WorkoutQueryDto } from './dto/workout-query.dto';

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && typeof (value as any).toNumber === 'function') {
    return (value as any).toNumber();
  }
  return Number(value);
}

// Ficha mínima del ejercicio embebida en cada serie.
const EXERCISE_SELECT = {
  id: true,
  name: true,
  category: true,
  type: true,
  imageUrl: true,
} satisfies Prisma.ExerciseSelect;

// Sesión con sus series ordenadas y el ejercicio de cada una.
const SESSION_INCLUDE = {
  logs: {
    orderBy: [{ exerciseId: 'asc' }, { setNumber: 'asc' }],
    include: { exercise: { select: EXERCISE_SELECT } },
  },
} satisfies Prisma.WorkoutSessionInclude;

// Plan del día de rutina precargado en la sesión (guía §5.5).
const PLAN_INCLUDE = {
  exercises: {
    orderBy: { order: 'asc' },
    include: { exercise: { select: EXERCISE_SELECT } },
  },
} satisfies Prisma.RoutineDayInclude;

@Injectable()
export class WorkoutsService {
  constructor(private readonly prisma: PrismaService) {}

  async start(userId: string, dto: StartWorkoutDto) {
    // Solo una sesión in_progress por usuario (checklist §10): si existe, 409.
    const active = await this.prisma.workoutSession.findFirst({
      where: { userId, status: 'in_progress' },
    });
    if (active) {
      throw new ConflictException(
        'Ya tienes un entrenamiento en curso. Continúalo o abandónalo antes de empezar otro.',
      );
    }

    let routineId: string | null = null;
    if (dto.routineDayId) {
      // El día debe pertenecer a una rutina del usuario (aislamiento).
      const day = await this.prisma.routineDay.findFirst({
        where: { id: dto.routineDayId, routine: { userId } },
      });
      if (!day) {
        throw new NotFoundException('Día de rutina no encontrado');
      }
      routineId = day.routineId;
    }

    const session = await this.prisma.workoutSession.create({
      data: {
        userId,
        routineId,
        routineDayId: dto.routineDayId ?? null,
      },
      include: SESSION_INCLUDE,
    });
    return this.attachPlan(session);
  }

  async getActive(userId: string) {
    const session = await this.prisma.workoutSession.findFirst({
      where: { userId, status: 'in_progress' },
      include: SESSION_INCLUDE,
    });
    if (!session) return null;
    return this.attachPlan(session);
  }

  async findOne(userId: string, id: string) {
    const session = await this.prisma.workoutSession.findFirst({
      where: { id, userId },
      include: SESSION_INCLUDE,
    });
    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }
    return this.attachPlan(session);
  }

  async addLog(userId: string, sessionId: string, dto: AddLogDto) {
    await this.ensureInProgress(userId, sessionId);

    // El ejercicio debe existir y estar activo.
    const exercise = await this.prisma.exercise.findFirst({
      where: { id: dto.exerciseId, isActive: true },
    });
    if (!exercise) {
      throw new NotFoundException('Ejercicio no encontrado');
    }

    const log = await this.prisma.workoutExerciseLog.create({
      data: {
        sessionId,
        exerciseId: dto.exerciseId,
        setNumber: dto.setNumber,
        reps: dto.reps,
        ...(dto.weightKg !== undefined ? { weightKg: dto.weightKg } : {}),
        ...(dto.rpe !== undefined ? { rpe: dto.rpe } : {}),
        ...(dto.restSeconds !== undefined ? { restSeconds: dto.restSeconds } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: { exercise: { select: EXERCISE_SELECT } },
    });

    // Mejor marca previa de ese ejercicio para comparar en pantalla (guía §5.5).
    const previousBest = await this.previousBest(userId, dto.exerciseId, sessionId);
    return { log, previousBest };
  }

  async updateLog(userId: string, sessionId: string, logId: string, dto: UpdateLogDto) {
    await this.ensureOwnedLog(userId, sessionId, logId);

    const data: Prisma.WorkoutExerciseLogUpdateInput = {};
    if (dto.setNumber !== undefined) data.setNumber = dto.setNumber;
    if (dto.weightKg !== undefined) data.weightKg = dto.weightKg;
    if (dto.reps !== undefined) data.reps = dto.reps;
    if (dto.rpe !== undefined) data.rpe = dto.rpe;
    if (dto.restSeconds !== undefined) data.restSeconds = dto.restSeconds;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.prisma.workoutExerciseLog.update({ where: { id: logId }, data });
  }

  async removeLog(userId: string, sessionId: string, logId: string): Promise<void> {
    await this.ensureOwnedLog(userId, sessionId, logId);
    await this.prisma.workoutExerciseLog.delete({ where: { id: logId } });
  }

  async finish(userId: string, sessionId: string, dto: FinishWorkoutDto) {
    await this.ensureInProgress(userId, sessionId);
    return this.prisma.workoutSession.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        finishedAt: new Date(),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: SESSION_INCLUDE,
    });
  }

  async abandon(userId: string, sessionId: string) {
    await this.ensureInProgress(userId, sessionId);
    // Conserva las series ya registradas (guía §5.5): solo cambia el estado.
    return this.prisma.workoutSession.update({
      where: { id: sessionId },
      data: { status: 'abandoned', finishedAt: new Date() },
    });
  }

  async list(userId: string, query: WorkoutQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.WorkoutSessionWhereInput = { userId };
    if (query.status) where.status = query.status;
    if (query.routineId) where.routineId = query.routineId;
    if (query.exerciseId) where.logs = { some: { exerciseId: query.exerciseId } };
    if (query.from || query.to) {
      const date: { gte?: Date; lte?: Date } = {};
      if (query.from) date.gte = new Date(query.from);
      if (query.to) date.lte = new Date(query.to);
      where.date = date;
    }

    const [data, total] = await Promise.all([
      this.prisma.workoutSession.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { logs: true } } },
      }),
      this.prisma.workoutSession.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  // --- Helpers ---

  // Adjunta el plan (día de rutina) a una sesión que lo tenga, sin necesidad de relación en DB.
  private async attachPlan<T extends { routineDayId: string | null }>(session: T) {
    if (!session.routineDayId) {
      return { ...session, plan: null };
    }
    const plan = await this.prisma.routineDay.findFirst({
      where: { id: session.routineDayId },
      include: PLAN_INCLUDE,
    });
    return { ...session, plan };
  }

  private async previousBest(userId: string, exerciseId: string, currentSessionId: string) {
    const best = await this.prisma.workoutExerciseLog.findFirst({
      where: {
        exerciseId,
        sessionId: { not: currentSessionId },
        session: { userId },
      },
      orderBy: [{ weightKg: 'desc' }, { reps: 'desc' }],
    });
    if (!best) return null;
    return { weightKg: toNumber(best.weightKg), reps: best.reps };
  }

  private async ensureInProgress(userId: string, sessionId: string) {
    const session = await this.prisma.workoutSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }
    if (session.status !== 'in_progress') {
      throw new ConflictException('La sesión ya no está en curso');
    }
    return session;
  }

  private async ensureOwnedLog(userId: string, sessionId: string, logId: string) {
    // Aislamiento en una sola query: la serie pertenece a una sesión del usuario.
    const log = await this.prisma.workoutExerciseLog.findFirst({
      where: { id: logId, sessionId, session: { userId } },
    });
    if (!log) {
      throw new NotFoundException('Serie no encontrada');
    }
    return log;
  }
}
