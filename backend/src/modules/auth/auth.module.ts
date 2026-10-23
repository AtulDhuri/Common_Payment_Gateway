// FILE: modules/auth/auth.module.ts
// PURPOSE: Auth feature module; registers the global JWT guard
// DEPENDENCIES: UsersModule, JwtModule, JwtGuard
// PHASE: 2
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [UsersModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: JwtGuard }],
  exports: [AuthService],
})
export class AuthModule {}
