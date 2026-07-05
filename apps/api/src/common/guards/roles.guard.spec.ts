import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function contextWith(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWithRoles(required: string[] | undefined) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('permite el acceso si la ruta no exige roles', () => {
    const guard = guardWithRoles(undefined);
    expect(guard.canActivate(contextWith({ role: 'USER' }))).toBe(true);
  });

  it('permite el acceso si el rol del usuario está permitido', () => {
    const guard = guardWithRoles(['ADMIN']);
    expect(guard.canActivate(contextWith({ role: 'ADMIN' }))).toBe(true);
  });

  it('bloquea a un usuario sin el rol requerido', () => {
    const guard = guardWithRoles(['ADMIN']);
    expect(() => guard.canActivate(contextWith({ role: 'USER' }))).toThrow(ForbiddenException);
  });

  it('bloquea si no hay usuario en el request', () => {
    const guard = guardWithRoles(['ADMIN']);
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenException);
  });
});
