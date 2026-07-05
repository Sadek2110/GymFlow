import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { WorkoutsService } from './workouts.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StartWorkoutDto } from './dto/start-workout.dto';
import { AddLogDto } from './dto/add-log.dto';
import { UpdateLogDto } from './dto/update-log.dto';
import { FinishWorkoutDto } from './dto/finish-workout.dto';
import { WorkoutQueryDto } from './dto/workout-query.dto';

@Controller('workouts')
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  @Post('start')
  start(@CurrentUser('id') userId: string, @Body() dto: StartWorkoutDto) {
    return this.workouts.start(userId, dto);
  }

  // 'active' debe declararse antes de ':id' para no ser capturada por el parámetro.
  @Get('active')
  active(@CurrentUser('id') userId: string) {
    return this.workouts.getActive(userId);
  }

  @Get()
  list(@CurrentUser('id') userId: string, @Query() query: WorkoutQueryDto) {
    return this.workouts.list(userId, query);
  }

  @Get(':id')
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workouts.findOne(userId, id);
  }

  @Post(':id/logs')
  addLog(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AddLogDto,
  ) {
    return this.workouts.addLog(userId, id, dto);
  }

  @Patch(':id/logs/:logId')
  updateLog(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('logId') logId: string,
    @Body() dto: UpdateLogDto,
  ) {
    return this.workouts.updateLog(userId, id, logId, dto);
  }

  @Delete(':id/logs/:logId')
  @HttpCode(204)
  removeLog(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('logId') logId: string,
  ) {
    return this.workouts.removeLog(userId, id, logId);
  }

  @Post(':id/finish')
  finish(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: FinishWorkoutDto,
  ) {
    return this.workouts.finish(userId, id, dto);
  }

  @Post(':id/abandon')
  abandon(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workouts.abandon(userId, id);
  }
}
