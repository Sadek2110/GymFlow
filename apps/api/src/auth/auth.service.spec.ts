import {
  BadRequestException,
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { createPrismaMock, PrismaMock } from '../../test/prisma.mock';

const JWT_CFG = {
  accessSecret: 'test_access_secret_key_1234567890',
  refreshSecret: 'test_refresh_secret_key_1234567890',
  accessTtl: '15m',
  refreshTtl: '7d',
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function build() {
  const prisma = createPrismaMock();
  const jwt = new JwtService({});
  const config = {
    get: (key: string) => (key === 'jwt' ? JWT_CFG : undefined),
  };
  const service = new AuthService(prisma as any, jwt, config as any);
  return { service, prisma, jwt };
}

describe('AuthService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('register', () => {
    it('crea el usuario con contraseña hasheada (nunca en claro) y devuelve tokens + user sin hash', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }: any) => ({
        id: 'u1',
        role: 'USER',
        createdAt: new Date(),
        ...data,
      }));

      const res = await service.register({
        name: 'Ana',
        email: 'ana@example.com',
        password: 'Password123',
      });

      // La contraseña se guarda hasheada, no en claro.
      const createArg = prisma.user.create.mock.calls[0][0].data;
      expect(createArg.passwordHash).toBeDefined();
      expect(createArg.passwordHash).not.toBe('Password123');
      expect(bcrypt.compareSync('Password123', createArg.passwordHash)).toBe(true);

      // La respuesta trae tokens y el user público, nunca el hash.
      expect(typeof res.accessToken).toBe('string');
      expect(typeof res.refreshToken).toBe('string');
      expect(res.user).toMatchObject({ email: 'ana@example.com', name: 'Ana' });
      expect((res.user as any).passwordHash).toBeUndefined();

      // Se persiste el refresh token (para poder revocarlo).
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('rechaza email duplicado con ConflictException', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'ana@example.com' });

      await expect(
        service.register({ name: 'Ana', email: 'ana@example.com', password: 'Password123' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    async function storedUser(password: string) {
      return {
        id: 'u1',
        name: 'Ana',
        email: 'ana@example.com',
        role: 'USER',
        passwordHash: await bcrypt.hash(password, 10),
      };
    }

    it('devuelve tokens para credenciales válidas', async () => {
      const { service, prisma, jwt } = build();
      prisma.user.findUnique.mockResolvedValue(await storedUser('Password123'));

      const res = await service.login({ email: 'ana@example.com', password: 'Password123' });

      expect(res.accessToken).toBeTruthy();
      expect(res.refreshToken).toBeTruthy();
      expect((res.user as any).passwordHash).toBeUndefined();
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);

      // El access token contiene el sub, email y rol correctos.
      const payload = jwt.verify(res.accessToken, { secret: JWT_CFG.accessSecret });
      expect(payload.sub).toBe('u1');
      expect(payload.email).toBe('ana@example.com');
      expect(payload.role).toBe('USER');
    });

    it('rechaza contraseña incorrecta con UnauthorizedException', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue(await storedUser('Password123'));

      await expect(
        service.login({ email: 'ana@example.com', password: 'Wrong9999' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza email inexistente con UnauthorizedException (sin filtrar qué falló)', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nadie@example.com', password: 'Password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    function validRefreshToken(jwt: JwtService, sub = 'u1') {
      return jwt.sign({ sub, jti: 'jti-1' }, { secret: JWT_CFG.refreshSecret, expiresIn: '7d' });
    }

    it('rota el par de tokens y revoca el refresh anterior', async () => {
      const { service, prisma, jwt } = build();
      const token = validRefreshToken(jwt);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        tokenHash: sha256(token),
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        name: 'Ana',
        email: 'ana@example.com',
        role: 'USER',
      });

      const res = await service.refresh(token);

      expect(res.accessToken).toBeTruthy();
      expect(res.refreshToken).toBeTruthy();
      expect(res.refreshToken).not.toBe(token);
      // Revoca el anterior por id y emite uno nuevo.
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rt1' } }),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('rechaza un refresh token revocado', async () => {
      const { service, prisma, jwt } = build();
      const token = validRefreshToken(jwt);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        tokenHash: sha256(token),
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      await expect(service.refresh(token)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza un refresh token no registrado (rotación/robo)', async () => {
      const { service, prisma, jwt } = build();
      const token = validRefreshToken(jwt);
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh(token)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza un token con firma inválida', async () => {
      const { service } = build();
      await expect(service.refresh('no.es.un.jwt')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revoca el refresh token indicado', async () => {
      const { service, prisma, jwt } = build();
      const token = jwt.sign({ sub: 'u1', jti: 'x' }, { secret: JWT_CFG.refreshSecret });

      await service.logout(token);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tokenHash: sha256(token) }),
        }),
      );
    });

    it('no lanza aunque el token sea inválido (logout idempotente)', async () => {
      const { service } = build();
      await expect(service.logout('basura')).resolves.toBeUndefined();
    });
  });

  describe('forgotPassword', () => {
    it('crea un token de reset si el email existe', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'ana@example.com' });

      await service.forgotPassword('ana@example.com');

      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    });

    it('nunca emite el token de recuperación a los logs', async () => {
      const logger = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'ana@example.com',
      });

      await service.forgotPassword('ana@example.com');

      expect(logger).not.toHaveBeenCalled();
      const stored = prisma.passwordResetToken.create.mock.calls[0][0].data;
      expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('no revela si el email existe: no lanza ni crea token para email desconocido', async () => {
      const { service, prisma } = build();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.forgotPassword('nadie@example.com')).resolves.toBeDefined();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('cambia la contraseña con un token válido y revoca las sesiones', async () => {
      const { service, prisma } = build();
      const rawToken = 'reset-token-123';
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt1',
        userId: 'u1',
        tokenHash: sha256(rawToken),
        usedAt: null,
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      await service.resetPassword(rawToken, 'NewPassword123');

      const updateArg = prisma.user.update.mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 'u1' });
      expect(bcrypt.compareSync('NewPassword123', updateArg.data.passwordHash)).toBe(true);
      // Revoca todos los refresh tokens del usuario tras cambiar la contraseña.
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('rechaza un token de reset inválido con BadRequestException', async () => {
      const { service, prisma } = build();
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword('token-malo', 'NewPassword123'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un token de reset caducado', async () => {
      const { service, prisma } = build();
      const rawToken = 'reset-token-123';
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt1',
        userId: 'u1',
        tokenHash: sha256(rawToken),
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword(rawToken, 'NewPassword123'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
