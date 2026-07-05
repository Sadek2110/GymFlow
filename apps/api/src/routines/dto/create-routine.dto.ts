import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Goal } from '@prisma/client';

export class CreateRoutineDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsIn(Object.values(Goal))
  goal?: Goal;
}
