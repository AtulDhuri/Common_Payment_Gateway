// FILE: common/decorators/current-user.decorator.ts
// PURPOSE: @CurrentUser() and @TenantId() param decorators (tenant_id == users.id in MVP). TenantId works for dashboard (JWT) and client (API key) requests
// DEPENDENCIES: AuthUser
// PHASE: 2 (client requests added in PHASE 6)
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
}

type AuthedRequest = Request & { user?: AuthUser; client?: { tenantId: string } };

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new Error('CurrentUser used on a route without JWT authentication');
  return user;
});

export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  const tenantId = req.user?.id ?? req.client?.tenantId;
  if (!tenantId) throw new Error('TenantId used on an unauthenticated route');
  return tenantId;
});
