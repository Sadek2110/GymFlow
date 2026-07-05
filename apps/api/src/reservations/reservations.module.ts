import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { AutoReserveService } from './auto-reserve.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, AutoReserveService],
  exports: [ReservationsService, AutoReserveService],
})
export class ReservationsModule {}
