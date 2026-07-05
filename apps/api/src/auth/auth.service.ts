import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { JwtConfig } from '../config/configuration';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends TokenPair {
  user: PublicUser;
}

const BCRYPT_COST = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtCfg: JwtConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    const cfg = this.config.get<JwtConfig>('jwt');
    if (!cfg) {
      throw new Error('Configuración JWT ausente');
    }
    this.jwtCfg = cfg;
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese email');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        passwordHash,
        profile: { create: {} },
      },
    });

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.toPublicUser(user) };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Mensaje genérico: no revelar si falla el email o la contraseña.
    const invalid = new UnauthorizedException('Credenciales inválidas');
    if (!user) {
      // Comparación fantasma para igualar el tiempo de respuesta (anti user-enumeration).
      await bcrypt.compare(dto.password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv');
      throw invalid;
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw invalid;
    }

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.toPublicUser(user) };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: this.jwtCfg.refreshSecret });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const tokenHash = this.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (
      !stored ||
      stored.revokedAt ||
      stored.userId !== payload.sub ||
      stored.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Rotación: revoca el anterior y emite uno nuevo.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    // Idempotente: revoca por hash sin verificar la firma.
    const tokenHash = this.hash(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    const genericMessage = {
      message: 'Si el email existe, recibirás instrucciones para restablecer la contraseña',
    };

    if (!user) {
      return genericMessage; // No revelar existencia del email.
    }

    const rawToken = randomUUID() + randomUUID();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    // MVP: el email real llega en MVP 2. Por ahora se loguea en servidor.
    this.logger.log(`[reset-password] token para ${normalized}: ${rawToken}`);
    return genericMessage;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Token de restablecimiento inválido o caducado');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });
    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    // Invalida todas las sesiones tras cambiar la contraseña.
    await this.prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // --- helpers ---

  private async issueTokens(user: {
    id: string;
    email: string;
    role: string;
  }): Promise<TokenPair> {
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      { secret: this.jwtCfg.accessSecret, expiresIn: this.jwtCfg.accessTtl },
    );
    const refreshToken = this.jwt.sign(
      { sub: user.id, jti: randomUUID() },
      { secret: this.jwtCfg.refreshSecret, expiresIn: this.jwtCfg.refreshTtl },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private toPublicUser(user: {
    id: string;
    name: string;
    email: string;
    role: string;
  }): PublicUser {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}
