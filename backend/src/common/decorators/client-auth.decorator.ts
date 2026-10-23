// FILE: common/decorators/client-auth.decorator.ts
// PURPOSE: @ClientAuth() marks a route as authenticated by API credentials instead of the dashboard JWT
// DEPENDENCIES: ClientApiGuard, Public
// PHASE: 6
import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';
import { ClientApiGuard } from '../guards/client-api.guard';
import { Public } from './public.decorator';

export function ClientAuth(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    Public(), // skips the global JWT guard
    UseGuards(ClientApiGuard),
    ApiSecurity('api-key'),
    ApiSecurity('api-secret'),
  );
}
