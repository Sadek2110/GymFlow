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
import { UsersService } from './users.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AddMeasurementDto } from './dto/add-measurement.dto';
import { MeasurementQueryDto } from './dto/measurement-query.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.users.getMe(userId);
  }

  @Patch('me')
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateUserDto) {
    return this.users.updateMe(userId, dto);
  }

  @Patch('me/profile')
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(userId, dto);
  }

  @Get('me/measurements')
  getMeasurements(
    @CurrentUser('id') userId: string,
    @Query() query: MeasurementQueryDto,
  ) {
    return this.users.getMeasurements(userId, query);
  }

  @Post('me/measurements')
  addMeasurement(
    @CurrentUser('id') userId: string,
    @Body() dto: AddMeasurementDto,
  ) {
    return this.users.addMeasurement(userId, dto);
  }

  @Delete('me/measurements/:id')
  @HttpCode(204)
  deleteMeasurement(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.users.deleteMeasurement(userId, id);
  }

  @Delete('me')
  @HttpCode(204)
  deleteAccount(@CurrentUser('id') userId: string) {
    return this.users.deleteAccount(userId);
  }
}
