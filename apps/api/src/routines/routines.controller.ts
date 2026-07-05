import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateRoutineDto } from './dto/create-routine.dto';
import { UpdateRoutineDto } from './dto/update-routine.dto';
import { UpdateRoutineDayDto } from './dto/update-routine-day.dto';
import { AddRoutineExerciseDto } from './dto/add-routine-exercise.dto';
import { UpdateRoutineExerciseDto } from './dto/update-routine-exercise.dto';
import { ReorderExercisesDto } from './dto/reorder-exercises.dto';

@Controller('routines')
export class RoutinesController {
  constructor(private readonly routines: RoutinesService) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.routines.list(userId);
  }

  @Get(':id')
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.routines.findOne(userId, id);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateRoutineDto) {
    return this.routines.create(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRoutineDto,
  ) {
    return this.routines.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.routines.remove(userId, id);
  }

  @Post(':id/activate')
  activate(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.routines.activate(userId, id);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.routines.duplicate(userId, id);
  }

  @Patch(':id/days/:dayOfWeek')
  updateDay(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    @Body() dto: UpdateRoutineDayDto,
  ) {
    return this.routines.updateDay(userId, id, dayOfWeek, dto);
  }

  // La ruta de reorder debe declararse antes de :rdeId para no ser capturada por él.
  @Patch(':id/days/:dayOfWeek/exercises/reorder')
  reorder(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    @Body() dto: ReorderExercisesDto,
  ) {
    return this.routines.reorderExercises(userId, id, dayOfWeek, dto.orderedIds);
  }

  @Post(':id/days/:dayOfWeek/exercises')
  addExercise(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    @Body() dto: AddRoutineExerciseDto,
  ) {
    return this.routines.addExercise(userId, id, dayOfWeek, dto);
  }

  @Patch(':id/days/:dayOfWeek/exercises/:rdeId')
  updateExercise(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    @Param('rdeId') rdeId: string,
    @Body() dto: UpdateRoutineExerciseDto,
  ) {
    return this.routines.updateExercise(userId, id, dayOfWeek, rdeId, dto);
  }

  @Delete(':id/days/:dayOfWeek/exercises/:rdeId')
  @HttpCode(204)
  removeExercise(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    @Param('rdeId') rdeId: string,
  ) {
    return this.routines.removeExercise(userId, id, dayOfWeek, rdeId);
  }
}
