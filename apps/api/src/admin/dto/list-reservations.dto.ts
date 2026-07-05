import { IsISO8601, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ListUsersDto } from './list-users.dto';

export class ListReservationsDto extends ListUsersDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsIn([
    'pending',
    'confirmed',
    'failed',
    'dry_run',
    'skipped',
    'cancelled',
  ])
  status?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
