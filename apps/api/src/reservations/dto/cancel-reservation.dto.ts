import { IsBoolean, IsOptional } from 'class-validator';

export class CancelReservationDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
