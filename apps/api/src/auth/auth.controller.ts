import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

// Límite estricto en autenticación: 5 intentos/min (checklist §10).
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  // Autenticada: solo un usuario con sesión puede cerrar sesión.
  @HttpCode(200)
  @Post('logout')
  async logout(@Body() dto: RefreshDto): Promise<{ message: string }> {
    await this.auth.logout(dto.refreshToken);
    return { message: 'Sesión cerrada' };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    await this.auth.resetPassword(dto.token, dto.newPassword);
    return { message: 'Contraseña actualizada' };
  }
}
