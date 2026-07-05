import { IsDateString, IsOptional } from 'class-validator';

export class MeasurementQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
