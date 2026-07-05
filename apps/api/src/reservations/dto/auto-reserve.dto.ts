import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class UpdateAutoReserveDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @Matches(/^\d{2}:\d{2} - \d{2}:\d{2}$/, { each: true })
  times?: string[];
}
