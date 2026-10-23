// FILE: modules/auth/dto/auth.dto.ts
// PURPOSE: Request and response DTOs for auth endpoints
// DEPENDENCIES: class-validator
// PHASE: 2
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const lower = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @Transform(lower)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt ignores bytes beyond 72
  password: string;
}

export class LoginDto {
  @Transform(lower)
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(72)
  password: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}

export interface UserResponse {
  id: string;
  email: string;
  createdAt: Date;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}
