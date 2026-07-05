import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoutineDto } from './dto/create-routine.dto';
import { UpdateRoutineDto } from './dto/update-routine.dto';
import { UpdateRoutineDayDto } from './dto/update-routine-day.dto';
import { AddRoutineExerciseDto } from './dto/add-routine-exercise.dto';
import { UpdateRoutineExerciseDto } from './dto/update-routine-exercise.dto';

const DAYS_IN_WEEK = 7;

// Datos del ejercicio embebidos en cada ejercicio de la rutina (guía §5.4).
const EXERCISE_SELECT = {
  id: true,
  name: true,
  category: true,
  type: true,
  level: true,
  equipment: true,
  imageUrl: true,
  videoUrl: true,
  mainMuscles: true,
} satisfies Prisma.ExerciseSelect;

// Rutina completa: días ordenados, ejercicios ordenados y ficha del ejercicio.
const ROUTINE_INCLUDE = {
  days: {
    orderBy: { dayOfWeek: 'asc' },
    include: {
      exercises: {
        orderBy: { order: 'asc' },
        include: { exercise: { select: EXERCISE_SELECT } },
      },
    },
  },
} satisfies Prisma.RoutineInclude;

@Injectable()
export class RoutinesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.routine.findMany({
      where: { userId },
      // La activa primero, luego las más recientes.
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(userId: string, routineId: string) {
    // Aislamiento: se filtra por userId además del id (checklist §10).
    const routine = await this.prisma.routine.findFirst({
      where: { id: routineId, userId },
      include: ROUTINE_INCLUDE,
    });
    if (!routine) {
      throw new NotFoundException('Rutina no encontrada');
    }
    return routine;
  }

  async create(userId: string, dto: CreateRoutineDto) {
    return this.prisma.routine.create({
      data: {
        userId,
        name: dto.name.trim(),
        ...(dto.goal ? { goal: dto.goal } : {}),
        // Se crean los 7 días vacíos por defecto (guía §5.4).
        days: {
          create: Array.from({ length: DAYS_IN_WEEK }, (_, dayOfWeek) => ({ dayOfWeek })),
        },
      },
      include: ROUTINE_INCLUDE,
    });
  }

  async update(userId: string, routineId: string, dto: UpdateRoutineDto) {
    await this.ensureOwnedRoutine(userId, routineId);

    const data: Prisma.RoutineUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.goal !== undefined) data.goal = dto.goal;

    return this.prisma.routine.update({ where: { id: routineId }, data });
  }

  async remove(userId: string, routineId: string): Promise<void> {
    await this.ensureOwnedRoutine(userId, routineId);
    // Cascade a días y ejercicios (onDelete: Cascade en el schema).
    await this.prisma.routine.delete({ where: { id: routineId } });
  }

  async activate(userId: string, routineId: string) {
    await this.ensureOwnedRoutine(userId, routineId);
    // Solo una rutina activa por usuario: se desactivan todas y se activa esta,
    // dentro de una transacción (checklist §10).
    await this.prisma.$transaction([
      this.prisma.routine.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      }),
      this.prisma.routine.update({
        where: { id: routineId },
        data: { isActive: true },
      }),
    ]);
    return this.findOne(userId, routineId);
  }

  async duplicate(userId: string, routineId: string) {
    const source = await this.findOne(userId, routineId);

    return this.prisma.routine.create({
      data: {
        userId,
        name: `${source.name} (copia)`,
        ...(source.goal ? { goal: source.goal } : {}),
        isActive: false, // la copia nunca nace activa
        days: {
          create: source.days.map((day) => ({
            dayOfWeek: day.dayOfWeek,
            title: day.title,
            isRestDay: day.isRestDay,
            exercises: {
              create: day.exercises.map((ex) => ({
                exerciseId: ex.exerciseId,
                order: ex.order,
                targetSets: ex.targetSets,
                targetReps: ex.targetReps,
                targetWeight: ex.targetWeight,
                restSeconds: ex.restSeconds,
              })),
            },
          })),
        },
      },
      include: ROUTINE_INCLUDE,
    });
  }

  async updateDay(
    userId: string,
    routineId: string,
    dayOfWeek: number,
    dto: UpdateRoutineDayDto,
  ) {
    const day = await this.ensureOwnedDay(userId, routineId, dayOfWeek);

    const data: Prisma.RoutineDayUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.isRestDay !== undefined) data.isRestDay = dto.isRestDay;

    return this.prisma.routineDay.update({ where: { id: day.id }, data });
  }

  async addExercise(
    userId: string,
    routineId: string,
    dayOfWeek: number,
    dto: AddRoutineExerciseDto,
  ) {
    const day = await this.ensureOwnedDay(userId, routineId, dayOfWeek);

    // El ejercicio debe existir y estar activo.
    const exercise = await this.prisma.exercise.findFirst({
      where: { id: dto.exerciseId, isActive: true },
    });
    if (!exercise) {
      throw new NotFoundException('Ejercicio no encontrado');
    }

    // Se coloca al final del día.
    const order = await this.prisma.routineDayExercise.count({
      where: { routineDayId: day.id },
    });

    return this.prisma.routineDayExercise.create({
      data: {
        routineDayId: day.id,
        exerciseId: dto.exerciseId,
        order,
        ...(dto.targetSets !== undefined ? { targetSets: dto.targetSets } : {}),
        ...(dto.targetReps !== undefined ? { targetReps: dto.targetReps } : {}),
        ...(dto.targetWeight !== undefined ? { targetWeight: dto.targetWeight } : {}),
        ...(dto.restSeconds !== undefined ? { restSeconds: dto.restSeconds } : {}),
      },
      include: { exercise: { select: EXERCISE_SELECT } },
    });
  }

  async updateExercise(
    userId: string,
    routineId: string,
    dayOfWeek: number,
    rdeId: string,
    dto: UpdateRoutineExerciseDto,
  ) {
    const rde = await this.ensureExerciseInDay(userId, routineId, dayOfWeek, rdeId);

    const data: Prisma.RoutineDayExerciseUpdateInput = {};
    if (dto.targetSets !== undefined) data.targetSets = dto.targetSets;
    if (dto.targetReps !== undefined) data.targetReps = dto.targetReps;
    if (dto.targetWeight !== undefined) data.targetWeight = dto.targetWeight;
    if (dto.restSeconds !== undefined) data.restSeconds = dto.restSeconds;

    return this.prisma.routineDayExercise.update({
      where: { id: rde.id },
      data,
      include: { exercise: { select: EXERCISE_SELECT } },
    });
  }

  async removeExercise(
    userId: string,
    routineId: string,
    dayOfWeek: number,
    rdeId: string,
  ): Promise<void> {
    const rde = await this.ensureExerciseInDay(userId, routineId, dayOfWeek, rdeId);
    await this.prisma.routineDayExercise.delete({ where: { id: rde.id } });
  }

  async reorderExercises(
    userId: string,
    routineId: string,
    dayOfWeek: number,
    orderedIds: string[],
  ) {
    const day = await this.ensureOwnedDay(userId, routineId, dayOfWeek);

    const existing = await this.prisma.routineDayExercise.findMany({
      where: { routineDayId: day.id },
      select: { id: true },
    });
    const existingIds = existing.map((e) => e.id);

    // orderedIds debe ser exactamente el mismo conjunto (sin faltas, sobras ni duplicados).
    const unique = new Set(orderedIds);
    const sameSize = unique.size === orderedIds.length && orderedIds.length === existingIds.length;
    const allBelong = orderedIds.every((id) => existingIds.includes(id));
    if (!sameSize || !allBelong) {
      throw new BadRequestException(
        'orderedIds debe contener exactamente los ejercicios de ese día',
      );
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.routineDayExercise.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );

    return this.findOne(userId, routineId);
  }

  // --- Helpers de propiedad / validación ---

  private async ensureOwnedRoutine(userId: string, routineId: string) {
    const routine = await this.prisma.routine.findFirst({
      where: { id: routineId, userId },
    });
    if (!routine) {
      throw new NotFoundException('Rutina no encontrada');
    }
    return routine;
  }

  private assertDayRange(dayOfWeek: number): void {
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > DAYS_IN_WEEK - 1) {
      throw new BadRequestException('dayOfWeek debe estar entre 0 y 6');
    }
  }

  private async ensureOwnedDay(userId: string, routineId: string, dayOfWeek: number) {
    this.assertDayRange(dayOfWeek);
    // Aislamiento en una sola query: el día debe pertenecer a una rutina del usuario.
    const day = await this.prisma.routineDay.findFirst({
      where: { dayOfWeek, routineId, routine: { userId } },
    });
    if (!day) {
      throw new NotFoundException('Día de rutina no encontrado');
    }
    return day;
  }

  private async ensureExerciseInDay(
    userId: string,
    routineId: string,
    dayOfWeek: number,
    rdeId: string,
  ) {
    const day = await this.ensureOwnedDay(userId, routineId, dayOfWeek);
    const rde = await this.prisma.routineDayExercise.findFirst({
      where: { id: rdeId, routineDayId: day.id },
    });
    if (!rde) {
      throw new NotFoundException('Ejercicio de la rutina no encontrado');
    }
    return rde;
  }
}
