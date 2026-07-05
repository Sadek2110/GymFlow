import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersDto } from './dto/list-users.dto';
import { ListReservationsDto } from './dto/list-reservations.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(dto: ListUsersDto) {
    const search = dto.search?.trim();
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          autoReserveEnabled: true,
          gymCredential: { select: { updatedAt: true } },
          _count: { select: { reservations: true, sessions: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: items.map(({ gymCredential, ...user }) => ({
        ...user,
        credentialsConfigured: Boolean(gymCredential),
      })),
      total,
      page: dto.page,
      limit: dto.limit,
    };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        autoReserveEnabled: true,
        autoReserveTimes: true,
        profile: true,
        gymCredential: { select: { updatedAt: true } },
        _count: {
          select: { reservations: true, sessions: true, routines: true },
        },
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const { gymCredential, ...safeUser } = user;
    return {
      ...safeUser,
      credentialsConfigured: Boolean(gymCredential),
    };
  }

  async listReservations(dto: ListReservationsDto) {
    const where = {
      ...(dto.userId ? { userId: dto.userId } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.from || dto.to
        ? {
            date: {
              ...(dto.from ? { gte: new Date(dto.from) } : {}),
              ...(dto.to ? { lte: new Date(dto.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.reservation.findMany({
        where,
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.reservation.count({ where }),
    ]);
    return {
      items,
      total,
      page: dto.page,
      limit: dto.limit,
    };
  }

  async stats() {
    const [users, reservations, byStatus] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.reservation.count(),
      this.prisma.reservation.groupBy({
        by: ['status'],
        _count: true,
        orderBy: { status: 'asc' },
      }),
    ]);
    return {
      users,
      reservations,
      byStatus: Object.fromEntries(
        byStatus.map((item) => [item.status, item._count]),
      ),
    };
  }
}
