import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Level } from '@prisma/client';

// Todos los campos opcionales (sin @nestjs/mapped-types para no añadir dependencia).
export class UpdateExerciseDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

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
  @MaxLength(120)
  equipment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  technique?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  commonMistakes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mainMuscles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secondaryMuscles?: string[];

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  videoUrl?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
