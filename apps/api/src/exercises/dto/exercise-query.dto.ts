import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Level } from '@prisma/client';

export class ExerciseQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  type?: string;

  @IsOptional()
  @IsIn(Object.values(Level))
  level?: Level;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100) // límite de paginación (checklist §10)
  limit?: number = 20;
}
