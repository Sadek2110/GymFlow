import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RunReservationDto } from './dto/run-reservation.dto';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get('health')
  health() {
    return this.reservations.health();
  }

  @Post('run')
  @HttpCode(200)
  run(@CurrentUser('id') userId: string, @Body() dto: RunReservationDto) {
    return this.reservations.run(userId, dto);
  }

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.reservations.list(userId);
  }
}
