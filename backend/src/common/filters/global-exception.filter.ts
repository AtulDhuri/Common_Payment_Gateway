// FILE: common/filters/global-exception.filter.ts
// PURPOSE: Single place that produces the failure envelope; no stack traces to clients
// DEPENDENCIES: AppException, ErrorCode, ApiErrorResponse
// PHASE: 2
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ApiErrorResponse } from '../types/api-response';
import { AppException } from '../types/app.exception';
import { ErrorCode } from '../types/error-codes';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    const body: ApiErrorResponse = {
      success: false,
      message: 'Internal server error',
      errorCode: ErrorCode.INTERNAL_ERROR,
      details: {},
    };

    if (exception instanceof AppException) {
      status = exception.httpStatus;
      body.message = exception.message;
      body.errorCode = exception.errorCode;
      body.details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      const msg = typeof resp === 'object' && resp !== null ? (resp as { message?: unknown }).message : resp;
      body.errorCode = this.codeFor(status);
      if (status === HttpStatus.BAD_REQUEST) {
        body.message = 'Validation failed';
        body.details = { errors: Array.isArray(msg) ? msg : [String(msg)] };
      } else {
        body.message = typeof msg === 'string' ? msg : exception.message;
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.message : 'Unknown error');
    }

    res.status(status).json(body);
  }

  private codeFor(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
