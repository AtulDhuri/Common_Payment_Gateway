// FILE: common/types/app.exception.ts
// PURPOSE: AppException(errorCode, message, httpStatus, details?) from coding-standards.md
// DEPENDENCIES: error-codes
// PHASE: 2
import { ErrorCode } from './error-codes';

export class AppException extends Error {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    public readonly httpStatus: number,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
