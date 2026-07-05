import { Body, Controller, Get, HttpCode, Post, Patch } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { AutoReserveService } from './auto-reserve.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RunReservationDto } from './dto/run-reservation.dto';
import { UpdateAutoReserveDto } from './dto/auto-reserve.dto';

@Controller('reservations')
export class ReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly autoReserve: AutoReserveService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('health')
  health() {
    return this.reservations.health();
  }

  @Post('run')
  @HttpCode(200)
  run(@CurrentUser('id') userId: string, @Body() dto: RunReservationDto) {
    return this.reservations.run(userId, dto);
  }

  @Get('auto-reserve')
  async getAutoReserve(@CurrentUser('id') userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { autoReserveEnabled: true, autoReserveTime: true },
    });
    return {
      enabled: u?.autoReserveEnabled ?? false,
      time: u?.autoReserveTime ?? null,
    };
  }

  @Patch('auto-reserve')
  async updateAutoReserve(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAutoReserveDto,
  ) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        autoReserveEnabled: dto.enabled,
        autoReserveTime: dto.time ?? null,
      },
      select: { autoReserveEnabled: true, autoReserveTime: true },
    });
    return { enabled: updated.autoReserveEnabled, time: updated.autoReserveTime };
  }

  @Get('should-run')
  async shouldRun(@CurrentUser('id') userId: string) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { autoReserveEnabled: true },
    });
    const check = await this.autoReserve.shouldReserve(userId, tomorrow);
    return {
      autoReserveEnabled: u?.autoReserveEnabled ?? false,
      ...check,
    };
  }

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.reservations.list(userId);
  }
}
