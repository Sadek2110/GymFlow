import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Level, Goal } from '@prisma/client';

export class UpdateProfileDto {
  @IsOptional()
  @IsInt()
  @Min(80)
  @Max(260)
  heightCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  birthYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  gender?: string;

  @IsOptional()
  @IsIn(Object.values(Level))
  fitnessLevel?: Level;

  @IsOptional()
  @IsIn(Object.values(Goal))
  mainGoal?: Goal;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  trainingDaysPerWeek?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  injuries?: string;

  @IsOptional()
  @IsIn(['kg', 'lb'])
  units?: string;
}
