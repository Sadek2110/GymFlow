import 'reflect-metadata';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: config.get<string>('corsOrigin'),
    credentials: true,
  });

  const port = config.get<number>('port') ?? 4000;
  await app.listen(port);
  Logger.log(`GymFlow API escuchando en http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
