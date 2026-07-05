import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('overview')
  overview(@CurrentUser('id') userId: string) {
    return this.progress.overview(userId);
  }

  @Get('records')
  records(@CurrentUser('id') userId: string) {
    return this.progress.records(userId);
  }

  @Get('weekly')
  weekly(@CurrentUser('id') userId: string, @Query('weekStart') weekStart?: string) {
    return this.progress.weekly(userId, weekStart);
  }

  @Get('exercises/:exerciseId')
  exerciseSeries(
    @CurrentUser('id') userId: string,
    @Param('exerciseId') exerciseId: string,
  ) {
    return this.progress.exerciseSeries(userId, exerciseId);
  }
}
