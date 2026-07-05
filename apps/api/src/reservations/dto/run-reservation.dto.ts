import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class RunReservationDto {
  // Por seguridad, si no se indica se asume dryRun=true (no confirma la reserva real).
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  // Franja horaria, p. ej. "09:00 - 10:00". Si se omite, reservaGym usa su TARGET_TIME.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  time?: string;
}
