// FILE: modules/payments/sandbox-payments.controller.ts
// PURPOSE: Dashboard (JWT) versions of create/status for the Payment Sandbox page. Same service as the client API, different auth
// DEPENDENCIES: PaymentsService
// PHASE: 6
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { CreatePaymentDto, CreatePaymentResponse, PaymentRefParam, PaymentStatusResponse } from './dto/payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payment Sandbox (dashboard)')
@ApiBearerAuth()
@Controller('sandbox/payments')
export class SandboxPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @ApiCreatedResponse({ type: CreatePaymentResponse })
  create(@TenantId() tenantId: string, @Body() dto: CreatePaymentDto): Promise<CreatePaymentResponse> {
    return this.payments.create(tenantId, dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: PaymentStatusResponse })
  get(@TenantId() tenantId: string, @Param() params: PaymentRefParam): Promise<PaymentStatusResponse> {
    return this.payments.get(tenantId, params.id);
  }
}
