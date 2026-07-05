import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRoutineDayDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isRestDay?: boolean;
}
