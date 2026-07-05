import { IsOptional, IsString, MaxLength } from 'class-validator';

export class FinishWorkoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
