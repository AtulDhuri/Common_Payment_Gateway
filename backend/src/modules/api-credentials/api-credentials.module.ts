// FILE: modules/api-credentials/api-credentials.module.ts
// PURPOSE: API credentials feature. Exports the service so ClientApiGuard can be used by other modules
// DEPENDENCIES: GatewayConfigModule, AuditModule
// PHASE: 6
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { GatewayConfigModule } from '../gateway-config/gateway-config.module';
import { ApiCredentialsController } from './api-credentials.controller';
import { ApiCredentialsRepository } from './api-credentials.repository';
import { ApiCredentialsService } from './api-credentials.service';
import { ApiCredential } from './entities/api-credential.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ApiCredential]), GatewayConfigModule, AuditModule],
  controllers: [ApiCredentialsController],
  providers: [ApiCredentialsRepository, ApiCredentialsService],
  exports: [ApiCredentialsService],
})
export class ApiCredentialsModule {}
