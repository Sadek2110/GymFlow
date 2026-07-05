import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { AutoReserveService } from './auto-reserve.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { CryptoModule } from '../common/crypto/crypto.module';

@Module({
  imports: [NotificationsModule, CryptoModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, AutoReserveService],
  exports: [ReservationsService, AutoReserveService],
})
export class ReservationsModule {}
