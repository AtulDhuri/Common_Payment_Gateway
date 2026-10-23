// FILE: modules/gateway-config/gateway-config.controller.ts
// PURPOSE: PUT/GET /gateway-config, PUT /gateway-config/secret (JWT). No endpoint returns a secret
// DEPENDENCIES: GatewayConfigService
// PHASE: 4
import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import {
  GatewayConfigResponse,
  ReplaceSecretDto,
  ReplaceSecretResponse,
  SaveGatewayConfigDto,
} from './dto/gateway-config.dto';
import { GatewayConfigService } from './gateway-config.service';

@ApiTags('Gateway Config')
@ApiBearerAuth()
@Controller('gateway-config')
export class GatewayConfigController {
  constructor(private readonly service: GatewayConfigService) {}

  @Put()
  @ResponseMessage('Gateway configuration saved')
  @ApiOkResponse({ type: GatewayConfigResponse, description: 'Rejects with CONFIG_NOT_VERIFIED unless the same config passed a test' })
  save(@TenantId() tenantId: string, @Body() dto: SaveGatewayConfigDto): Promise<GatewayConfigResponse> {
    return this.service.save(tenantId, dto);
  }

  @Get()
  @ApiOkResponse({ type: GatewayConfigResponse, description: 'Secrets are masked' })
  get(@TenantId() tenantId: string): Promise<GatewayConfigResponse> {
    return this.service.get(tenantId);
  }

  @Put('secret')
  @ResponseMessage('Secret replaced')
  @ApiOkResponse({ type: ReplaceSecretResponse, description: 'Re-tests the connection, then stores and audits' })
  replaceSecret(@TenantId() tenantId: string, @Body() dto: ReplaceSecretDto): Promise<ReplaceSecretResponse> {
    return this.service.replaceSecret(tenantId, dto);
  }
}
