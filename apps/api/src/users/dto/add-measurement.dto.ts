import {
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AddMeasurementDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(20)
  @Max(500)
  weightKg!: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
