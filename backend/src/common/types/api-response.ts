// FILE: common/types/api-response.ts
// PURPOSE: Success and failure envelope types from api-design.md
// DEPENDENCIES: error-codes
// PHASE: 2
import { ErrorCode } from './error-codes';

export interface ApiResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errorCode: ErrorCode;
  details: Record<string, unknown>;
}
