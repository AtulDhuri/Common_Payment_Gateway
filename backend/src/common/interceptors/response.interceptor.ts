// FILE: common/interceptors/response.interceptor.ts
// PURPOSE: Wrap successful responses in the success envelope (message from @ResponseMessage)
// DEPENDENCIES: ApiResponse, Reflector
// PHASE: 2 (message in PHASE 3)
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { ApiResponse } from '../types/api-response';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const message = this.reflector.get<string | undefined>(RESPONSE_MESSAGE_KEY, context.getHandler()) ?? '';
    return next.handle().pipe(map((data) => ({ success: true as const, message, data })));
  }
}
