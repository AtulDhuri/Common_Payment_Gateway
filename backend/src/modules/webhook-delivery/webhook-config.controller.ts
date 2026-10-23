// FILE: modules/webhook-delivery/webhook-config.controller.ts
// PURPOSE: PUT/GET /webhooks/config, POST /webhooks/config/rotate-secret, GET /webhooks/deliveries (JWT)
// DEPENDENCIES: WebhookConfigService
// PHASE: 8
import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import {
  DeliveryListQuery,
  DeliveryListResponse,
  UpsertWebhookConfigDto,
  WebhookConfigResponse,
} from './dto/webhook-config.dto';
import { WebhookConfigService } from './webhook-config.service';

@ApiTags('Merchant Webhooks')
@ApiBearerAuth()
@Controller('webhooks')
export class WebhookConfigController {
  constructor(private readonly webhooks: WebhookConfigService) {}

  @Get('config')
  @ApiOkResponse({ type: WebhookConfigResponse, description: 'Secret is always masked' })
  get(@TenantId() tenantId: string): Promise<WebhookConfigResponse> {
    return this.webhooks.get(tenantId);
  }

  @Put('config')
  @ResponseMessage('Webhook endpoint saved')
  @ApiOkResponse({ type: WebhookConfigResponse, description: 'The first call returns the signing secret once (secretShownOnce: true)' })
  upsert(@TenantId() tenantId: string, @Body() dto: UpsertWebhookConfigDto): Promise<WebhookConfigResponse> {
    return this.webhooks.upsert(tenantId, dto);
  }

  @Post('config/rotate-secret')
  @HttpCode(200)
  @ResponseMessage('Signing secret rotated. Copy it now, it will not be shown again')
  @ApiOkResponse({ type: WebhookConfigResponse, description: 'New signing secret, shown once. The old one stops working at once' })
  rotate(@TenantId() tenantId: string): Promise<WebhookConfigResponse> {
    return this.webhooks.rotateSecret(tenantId);
  }

  @Get('deliveries')
  @ApiOkResponse({ type: DeliveryListResponse, description: 'Delivery log, newest first' })
  deliveries(@TenantId() tenantId: string, @Query() q: DeliveryListQuery): Promise<DeliveryListResponse> {
    return this.webhooks.listDeliveries(tenantId, q.page, q.limit);
  }
}
