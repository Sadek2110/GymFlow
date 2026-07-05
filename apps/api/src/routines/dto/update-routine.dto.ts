import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Goal } from '@prisma/client';

// Renombrar / cambiar objetivo (guía §5.4). Todos los campos opcionales.
export class UpdateRoutineDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn(Object.values(Goal))
  goal?: Goal;
}
