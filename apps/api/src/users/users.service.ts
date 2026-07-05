import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AddMeasurementDto } from './dto/add-measurement.dto';
import { MeasurementQueryDto } from './dto/measurement-query.dto';

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && typeof (value as any).toNumber === 'function') {
    return (value as any).toNumber();
  }
  return Number(value);
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const last = await this.prisma.bodyMeasurement.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: (user as any).createdAt,
      profile: user.profile,
      lastWeightKg: last ? toNumber(last.weightKg) : null,
    };
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    const data: { name?: string; email?: string } = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Ese email ya está en uso');
      }
      data.email = email;
    }

    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: { ...dto },
    });
  }

  async getMeasurements(userId: string, query: MeasurementQueryDto) {
    const date: { gte?: Date; lte?: Date } = {};
    if (query.from) date.gte = new Date(query.from);
    if (query.to) date.lte = new Date(query.to);

    return this.prisma.bodyMeasurement.findMany({
      where: {
        userId,
        ...(query.from || query.to ? { date } : {}),
      },
      orderBy: { date: 'asc' },
    });
  }

  async addMeasurement(userId: string, dto: AddMeasurementDto) {
    return this.prisma.bodyMeasurement.create({
      data: {
        userId,
        weightKg: dto.weightKg,
        ...(dto.date ? { date: new Date(dto.date) } : {}),
        ...(dto.note ? { note: dto.note } : {}),
      },
    });
  }

  async deleteMeasurement(userId: string, id: string): Promise<void> {
    // Aislamiento: solo se puede borrar si el registro es del propio usuario.
    const measurement = await this.prisma.bodyMeasurement.findFirst({
      where: { id, userId },
    });
    if (!measurement) {
      throw new NotFoundException('Registro de peso no encontrado');
    }
    await this.prisma.bodyMeasurement.delete({ where: { id } });
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
