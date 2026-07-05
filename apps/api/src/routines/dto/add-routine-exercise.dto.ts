import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AddRoutineExerciseDto {
  @IsString()
  @MaxLength(60)
  exerciseId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  targetSets?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  targetReps?: string; // string para permitir rangos ("8-12")

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999)
  targetWeight?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  restSeconds?: number;
}
