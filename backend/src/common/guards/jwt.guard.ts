// FILE: common/guards/jwt.guard.ts
// PURPOSE: Global guard enforcing Bearer access token on all routes except @Public
// DEPENDENCIES: AuthService, Public decorator
// PHASE: 2
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from '../../modules/auth/auth.service';
import { AppException } from '../types/app.exception';
import { ErrorCode } from '../types/error-codes';
import { AuthUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppException(ErrorCode.UNAUTHORIZED, 'Missing bearer token', 401);
    }
    const payload = await this.auth.verify(token, 'access');
    req.user = { id: payload.sub, email: payload.email };
    return true;
  }
}
