import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ExercisesModule } from './exercises/exercises.module';
import { RoutinesModule } from './routines/routines.module';
import { WorkoutsModule } from './workouts/workouts.module';
import { ProgressModule } from './progress/progress.module';
import { ReservationsModule } from './reservations/reservations.module';
import { HealthController } from './health/health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    // Límite general razonable; /auth aplica límites más estrictos por ruta.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    ExercisesModule,
    RoutinesModule,
    WorkoutsModule,
    ProgressModule,
    ReservationsModule,
  ],
  controllers: [HealthController],
  providers: [
    // JWT obligatorio por defecto en toda la app; se libera con @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // RolesGuard corre después del JWT: valida @Roles() usando req.user.
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
