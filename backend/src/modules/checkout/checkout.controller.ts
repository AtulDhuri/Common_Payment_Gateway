// FILE: modules/checkout/checkout.controller.ts
// PURPOSE: GET /checkout/:reference?t=, POST /checkout/:reference/complete, POST /checkout/:reference/cancel (public, token-protected)
// DEPENDENCIES: CheckoutService, checkout.page
// PHASE: 5
import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { renderCheckoutPage } from './checkout.page';
import { CheckoutService } from './checkout.service';
import { CheckoutParam, CheckoutQuery, CheckoutResultResponse, CompleteCheckoutDto } from './dto/checkout.dto';

@ApiTags('Hosted Checkout')
@Public()
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get(':reference')
  @ApiOkResponse({ description: 'HTML page that opens the gateway widget. Receives only the public gateway key' })
  async page(@Param() p: CheckoutParam, @Query() q: CheckoutQuery, @Res() res: Response): Promise<void> {
    const html = renderCheckoutPage(await this.checkout.getView(p.reference, q.t));
    res
      .status(200)
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        // The URL carries the checkout token, so keep it out of referrers and caches.
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      })
      .send(html);
  }

  @Post(':reference/complete')
  @HttpCode(200)
  @ApiOkResponse({ type: CheckoutResultResponse })
  complete(
    @Param() p: CheckoutParam,
    @Query() q: CheckoutQuery,
    @Body() dto: CompleteCheckoutDto,
  ): Promise<CheckoutResultResponse> {
    return this.checkout.complete(p.reference, q.t, dto);
  }

  @Post(':reference/cancel')
  @HttpCode(200)
  @ApiOkResponse({ type: CheckoutResultResponse })
  cancel(@Param() p: CheckoutParam, @Query() q: CheckoutQuery): Promise<CheckoutResultResponse> {
    return this.checkout.cancel(p.reference, q.t);
  }
}
