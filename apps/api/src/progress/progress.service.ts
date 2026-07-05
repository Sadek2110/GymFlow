import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { appDayOfWeek, epley1rm, startOfWeekMonday } from './week.util';

const DEFAULT_WEEKLY_TARGET = 3;

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'object' && typeof (value as any).toNumber === 'function') {
    return (value as any).toNumber();
  }
  return Number(value);
}

// "Hoy toca": día de la rutina activa con sus ejercicios y ficha embebida.
const TODAY_INCLUDE = {
  days: {
    orderBy: { dayOfWeek: 'asc' },
    include: {
      exercises: {
        orderBy: { order: 'asc' },
        include: {
          exercise: { select: { id: true, name: true, category: true, imageUrl: true } },
        },
      },
    },
  },
} satisfies Prisma.RoutineInclude;

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  // Aislado en un método para poder fijarlo en los tests (determinismo).
  now(): Date {
    return new Date();
  }

  async overview(userId: string) {
    const now = this.now();
    const weekStart = startOfWeekMonday(now);
    const today = appDayOfWeek(now);

    const [activeRoutine, profile, lastMeasurement, weekCompleted, lastSession, activeSession] =
      await Promise.all([
        this.prisma.routine.findFirst({
          where: { userId, isActive: true },
          include: TODAY_INCLUDE,
        }),
        this.prisma.userProfile.findUnique({ where: { userId } }),
        this.prisma.bodyMeasurement.findFirst({
          where: { userId },
          orderBy: { date: 'desc' },
        }),
        this.prisma.workoutSession.count({
          where: { userId, status: 'completed', date: { gte: weekStart } },
        }),
        this.prisma.workoutSession.findFirst({
          where: { userId, status: { in: ['completed', 'abandoned'] } },
          orderBy: { date: 'desc' },
        }),
        this.prisma.workoutSession.findFirst({
          where: { userId, status: 'in_progress' },
        }),
      ]);

    const todayDay = activeRoutine?.days.find((d: any) => d.dayOfWeek === today) ?? null;

    return {
      today:
        activeRoutine && todayDay
          ? {
              dayOfWeek: today,
              routineId: activeRoutine.id,
              routineDayId: todayDay.id,
              title: todayDay.title,
              isRestDay: todayDay.isRestDay,
              exercises: todayDay.exercises,
            }
          : null,
      activeRoutine: activeRoutine
        ? { id: activeRoutine.id, name: activeRoutine.name }
        : null,
      week: {
        completed: weekCompleted,
        target: profile?.trainingDaysPerWeek ?? DEFAULT_WEEKLY_TARGET,
        weekStart,
      },
      lastWeightKg: lastMeasurement ? toNumber(lastMeasurement.weightKg) : null,
      lastSession: lastSession
        ? { id: lastSession.id, date: lastSession.date, status: lastSession.status }
        : null,
      activeSession: activeSession
        ? {
            id: activeSession.id,
            routineDayId: activeSession.routineDayId,
            date: activeSession.date,
          }
        : null,
    };
  }

  async records(userId: string) {
    // PRs no se guardan: se calculan al vuelo (guía §4).
    const logs = await this.prisma.workoutExerciseLog.findMany({
      where: { session: { userId }, weightKg: { not: null } },
      include: {
        exercise: { select: { id: true, name: true } },
        session: { select: { date: true } },
      },
    });

    const best = new Map<
      string,
      { exerciseId: string; exerciseName: string; weightKg: number; reps: number; date: Date }
    >();

    for (const log of logs) {
      const weightKg = toNumber(log.weightKg);
      const current = best.get(log.exerciseId);
      // Mejor peso; a igual peso, más repeticiones.
      if (!current || weightKg > current.weightKg || (weightKg === current.weightKg && log.reps > current.reps)) {
        best.set(log.exerciseId, {
          exerciseId: log.exerciseId,
          exerciseName: (log as any).exercise?.name ?? '',
          weightKg,
          reps: log.reps,
          date: (log as any).session?.date,
        });
      }
    }

    return [...best.values()]
      .map((r) => ({ ...r, e1rm: epley1rm(r.weightKg, r.reps) }))
      .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
  }

  async exerciseSeries(userId: string, exerciseId: string) {
    const logs = await this.prisma.workoutExerciseLog.findMany({
      where: { exerciseId, session: { userId, status: 'completed' } },
      include: { session: { select: { id: true, date: true } } },
      orderBy: [{ session: { date: 'asc' } }],
    });

    // Mejor serie por sesión (mayor peso; a igual peso, más reps).
    const bySession = new Map<
      string,
      { sessionId: string; date: Date; weightKg: number; reps: number }
    >();

    for (const log of logs) {
      const weightKg = toNumber(log.weightKg);
      const sessionId = (log as any).session?.id ?? log.sessionId;
      const current = bySession.get(sessionId);
      if (!current || weightKg > current.weightKg || (weightKg === current.weightKg && log.reps > current.reps)) {
        bySession.set(sessionId, {
          sessionId,
          date: (log as any).session?.date,
          weightKg,
          reps: log.reps,
        });
      }
    }

    return [...bySession.values()]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((s) => ({ ...s, e1rm: epley1rm(s.weightKg, s.reps) }));
  }

  async weekly(userId: string, weekStart?: string) {
    // weekStart inválido o ausente → semana actual.
    const base = weekStart ? new Date(weekStart) : this.now();
    const start = startOfWeekMonday(Number.isNaN(base.getTime()) ? this.now() : base);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const [sessions, profile] = await Promise.all([
      this.prisma.workoutSession.findMany({
        where: { userId, status: 'completed', date: { gte: start, lt: end } },
        include: { logs: { select: { weightKg: true, reps: true } } },
      }),
      this.prisma.userProfile.findUnique({ where: { userId } }),
    ]);

    const trainedDays = new Set(sessions.map((s: any) => appDayOfWeek(new Date(s.date))));
    let totalVolume = 0;
    for (const s of sessions) {
      for (const log of (s as any).logs) {
        totalVolume += toNumber(log.weightKg) * log.reps;
      }
    }

    return {
      weekStart: start,
      daysTrained: trainedDays.size,
      target: profile?.trainingDaysPerWeek ?? DEFAULT_WEEKLY_TARGET,
      totalVolume,
      sessions: sessions.length,
    };
  }
}
