// FILE: modules/payments/payments.controller.ts
// PURPOSE: Client API (API credentials): POST /payments/create, GET /payments/:id. Dashboard (JWT): GET /payments (paged list)
// DEPENDENCIES: PaymentsService, PaymentListService, ClientAuth
// PHASE: 5, authentication moved to API credentials in PHASE 6
import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ClientAuth } from '../../common/decorators/client-auth.decorator';
import { TenantId } from '../../common/decorators/current-user.decorator';
import {
  CreatePaymentDto,
  CreatePaymentResponse,
  PaymentRefParam,
  PaymentStatusResponse,
} from './dto/payments.dto';
import { PaymentListQuery, PaymentListResponse } from './dto/payment-list.dto';
import { PaymentListService } from './payment-list.service';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly list: PaymentListService,
  ) {}

  @Post('create')
  @ClientAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Repeat calls with the same key return the same payment' })
  @ApiCreatedResponse({ type: CreatePaymentResponse })
  create(
    @TenantId() tenantId: string,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CreatePaymentResponse> {
    return this.payments.create(tenantId, dto, idempotencyKey);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOkResponse({ type: PaymentListResponse, description: 'Dashboard list (JWT). Newest first, scoped to the caller' })
  listPayments(@TenantId() tenantId: string, @Query() q: PaymentListQuery): Promise<PaymentListResponse> {
    return this.list.list(tenantId, q.page, q.limit);
  }

  @Get(':id')
  @ClientAuth()
  @ApiOkResponse({ type: PaymentStatusResponse, description: 'A PENDING payment is refreshed from the gateway first' })
  get(@TenantId() tenantId: string, @Param() params: PaymentRefParam): Promise<PaymentStatusResponse> {
    return this.payments.get(tenantId, params.id);
  }
}
