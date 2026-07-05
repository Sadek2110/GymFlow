import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateAutoReserveDto {
  @IsBoolean()
  enabled!: boolean;

  // Formato exacto que espera ReservaGym: "HH:MM - HH:MM"
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2} - \d{2}:\d{2}$/, {
    message: 'time debe tener formato "HH:MM - HH:MM"',
  })
  time?: string;
}
