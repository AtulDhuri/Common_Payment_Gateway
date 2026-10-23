// FILE: modules/payments/dto/payment-list.dto.ts
// PURPOSE: Query and response DTOs for GET /payments (dashboard payment list, api-design.md)
// DEPENDENCIES: class-validator, class-transformer, @nestjs/swagger
// PHASE: 5 (pulled forward from Phase 9 for the payment sandbox; list only, no summaries)
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaymentStatus } from '../payment-status';

export class PaymentListQuery {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class PaymentListItem {
  @ApiProperty() paymentId: string;
  @ApiProperty({ enum: PaymentStatus }) status: PaymentStatus;
  @ApiProperty() amount: number;
  @ApiProperty() currency: string;
  @ApiProperty({ example: 'RAZORPAY' }) gateway: string;
  @ApiProperty({ nullable: true, type: String }) transactionId: string | null;
  @ApiProperty({ type: Object }) metadata: Record<string, unknown>;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ nullable: true, type: String, description: 'Only while PENDING, so the customer can be sent to checkout' })
  checkoutUrl: string | null;
}

export class PaymentListResponse {
  @ApiProperty({ type: [PaymentListItem] }) items: PaymentListItem[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}
