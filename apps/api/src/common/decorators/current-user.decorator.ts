import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

/** Extrae el usuario autenticado (inyectado por JwtStrategy) del request. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthUser = request.user;
    return data ? user?.[data] : user;
  },
);
