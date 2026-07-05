import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Corregir una serie ya registrada (guía §5.5). No permite mover la serie de ejercicio.
export class UpdateLogDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  setNumber?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999)
  weightKg?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  reps?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  rpe?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  restSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
