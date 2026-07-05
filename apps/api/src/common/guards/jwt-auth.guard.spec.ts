import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

function context(): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('deja pasar las rutas marcadas como @Public() sin validar JWT', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);

    expect(guard.canActivate(context())).toBe(true);
  });
});
