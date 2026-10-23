// FILE: modules/webhooks/gateway-webhook.controller.ts
// PURPOSE: POST /webhooks/razorpay (public; authenticated by the Razorpay signature over the raw body)
// DEPENDENCIES: GatewayWebhookService
// PHASE: 5
import { Controller, Headers, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { GatewayWebhookService, WebhookResult } from './gateway-webhook.service';

@ApiTags('Gateway Webhooks')
@Controller('webhooks')
export class GatewayWebhookController {
  constructor(private readonly webhooks: GatewayWebhookService) {}

  @Public()
  @Post('razorpay')
  @HttpCode(200)
  @ApiHeader({ name: 'X-Razorpay-Signature', required: true })
  @ApiOkResponse({ description: 'Events: payment.captured, order.paid, payment.failed, refund.processed. Others are acknowledged and ignored' })
  handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
  ): Promise<WebhookResult> {
    return this.webhooks.handleRazorpay(req.rawBody, signature);
  }
}
