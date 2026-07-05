import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExerciseQueryDto } from './dto/exercise-query.dto';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';

@Injectable()
export class ExercisesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ExerciseQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ExerciseWhereInput = { isActive: true };
    if (query.category) where.category = query.category;
    if (query.type) where.type = query.type;
    if (query.level) where.level = query.level;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.exercise.count({ where }),
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

  async findOne(id: string) {
    const exercise = await this.prisma.exercise.findFirst({
      where: { id, isActive: true },
    });
    if (!exercise) {
      throw new NotFoundException('Ejercicio no encontrado');
    }
    return exercise;
  }

  async categories(): Promise<Array<{ category: string; count: number }>> {
    const groups = await this.prisma.exercise.groupBy({
      by: ['category'],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { category: 'asc' },
    });
    return groups.map((g: any) => ({ category: g.category, count: g._count._all }));
  }

  async create(dto: CreateExerciseDto) {
    return this.prisma.exercise.create({
      data: {
        ...dto,
        mainMuscles: dto.mainMuscles ?? [],
        secondaryMuscles: dto.secondaryMuscles ?? [],
      },
    });
  }

  async update(id: string, dto: UpdateExerciseDto) {
    await this.ensureExists(id);
    return this.prisma.exercise.update({ where: { id }, data: { ...dto } });
  }

  async softDelete(id: string): Promise<void> {
    await this.ensureExists(id);
    // Soft delete: preserva historiales (guía §4).
    await this.prisma.exercise.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.exercise.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException('Ejercicio no encontrado');
    }
  }
}
