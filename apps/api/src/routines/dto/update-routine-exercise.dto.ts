import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Editar objetivos de un ejercicio del día (guía §5.4). No permite cambiar exerciseId.
export class UpdateRoutineExerciseDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  targetSets?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  targetReps?: string;

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
