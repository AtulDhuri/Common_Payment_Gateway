// FILE: modules/auth/auth.controller.ts
// PURPOSE: /auth/register, /auth/login, /auth/refresh, /auth/me
// DEPENDENCIES: AuthService
// PHASE: 2
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto, TokenResponse, UserResponse } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<UserResponse> {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<TokenResponse> {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto): Promise<TokenResponse> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<UserResponse> {
    return this.auth.me(user.id);
  }
}
