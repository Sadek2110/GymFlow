import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StartWorkoutDto {
  // Día de la rutina cuyo plan se precarga en la sesión (guía §5.5). Opcional: sesión libre.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  routineDayId?: string;
}
