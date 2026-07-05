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
import { Role } from '@prisma/client';
import { ExercisesService } from './exercises.service';
import { Roles } from '../common/decorators/roles.decorator';
import { ExerciseQueryDto } from './dto/exercise-query.dto';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';

@Controller('exercises')
export class ExercisesController {
  constructor(private readonly exercises: ExercisesService) {}

  @Get()
  list(@Query() query: ExerciseQueryDto) {
    return this.exercises.list(query);
  }

  // Debe declararse antes de :id para no ser capturada por el parámetro.
  @Get('categories')
  categories() {
    return this.exercises.categories();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.exercises.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateExerciseDto) {
    return this.exercises.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateExerciseDto) {
    return this.exercises.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.exercises.softDelete(id);
  }
}
