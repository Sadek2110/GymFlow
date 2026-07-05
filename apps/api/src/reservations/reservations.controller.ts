import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { AutoReserveService } from './auto-reserve.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RunReservationDto } from './dto/run-reservation.dto';
import { UpdateAutoReserveDto } from './dto/auto-reserve.dto';
import { SaveGymCredentialsDto } from './dto/gym-credentials.dto';
import { CancelReservationDto } from './dto/cancel-reservation.dto';

@Controller('reservations')
export class ReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly autoReserve: AutoReserveService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { autoReserveEnabled: true, autoReserveTimes: true },
    });
    return {
      enabled: user?.autoReserveEnabled ?? false,
      times: user?.autoReserveTimes ?? [],
    };
  }

  @Patch('auto-reserve')
  async updateAutoReserve(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAutoReserveDto,
  ) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        autoReserveEnabled: dto.enabled,
        autoReserveTimes: dto.times ?? [],
      },
      select: { autoReserveEnabled: true, autoReserveTimes: true },
    });
    return {
      enabled: user.autoReserveEnabled,
      times: user.autoReserveTimes,
    };
  }

  @Get('should-run')
  async shouldRun(@CurrentUser('id') userId: string) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { autoReserveEnabled: true },
    });
    return {
      autoReserveEnabled: user?.autoReserveEnabled ?? false,
      ...(await this.autoReserve.shouldReserve(userId, tomorrow)),
    };
  }

  @Get('credentials')
  async credentialsStatus(@CurrentUser('id') userId: string) {
    const credential = await this.prisma.gymCredential.findUnique({
      where: { userId },
      select: { updatedAt: true },
    });
    return {
      configured: Boolean(credential),
      updatedAt: credential?.updatedAt ?? null,
    };
  }

  @Put('credentials')
  async saveCredentials(
    @CurrentUser('id') userId: string,
    @Body() dto: SaveGymCredentialsDto,
  ) {
    await this.prisma.gymCredential.upsert({
      where: { userId },
      create: {
        userId,
        dniEnc: this.crypto.encrypt(dto.dni),
        passwordEnc: this.crypto.encrypt(dto.password),
      },
      update: {
        dniEnc: this.crypto.encrypt(dto.dni),
        passwordEnc: this.crypto.encrypt(dto.password),
      },
    });
    return { configured: true };
  }

  @Delete('credentials')
  async deleteCredentials(@CurrentUser('id') userId: string) {
    await this.prisma.gymCredential.deleteMany({ where: { userId } });
    return { configured: false };
  }

  @Post('credentials/test')
  @HttpCode(200)
  testCredentials(@CurrentUser('id') userId: string) {
    return this.reservations.testLogin(userId);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CancelReservationDto,
  ) {
    return this.reservations.cancel(userId, id, dto.dryRun ?? false);
  }

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.reservations.list(userId);
  }
}
