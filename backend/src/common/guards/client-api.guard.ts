// FILE: common/guards/client-api.guard.ts
// PURPOSE: Authenticates external applications by x-api-key + x-api-secret and attaches the tenant to the request
// DEPENDENCIES: ApiCredentialsService
// PHASE: 6
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiCredentialsService, ClientContext } from '../../modules/api-credentials/api-credentials.service';

export type ClientRequest = Request & { client?: ClientContext };

function singleHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

@Injectable()
export class ClientApiGuard implements CanActivate {
  constructor(private readonly credentials: ApiCredentialsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ClientRequest>();
    const key = singleHeader(req, 'x-api-key');
    const secret = singleHeader(req, 'x-api-secret');
    if (!key || !secret) throw this.credentials.missingCredentials();
    req.client = await this.credentials.authenticate(key, secret);
    return true;
  }
}
