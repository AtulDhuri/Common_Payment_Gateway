// FILE: modules/checkout/dto/checkout.dto.ts
// PURPOSE: Param, query and body DTOs for hosted checkout
// DEPENDENCIES: class-validator
// PHASE: 5
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CheckoutParam {
  @Matches(/^pay_[a-f0-9]{20}$/, { message: 'Invalid payment id' })
  reference: string;
}

export class CheckoutQuery {
  @ApiProperty({ description: 'Checkout token from checkoutUrl' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  t: string;
}

/** Field names are what Razorpay's checkout widget returns to its success handler. */
export class CompleteCheckoutDto {
  @ApiProperty()
  @Matches(/^pay_[A-Za-z0-9]{6,40}$/)
  razorpay_payment_id: string;

  @ApiProperty()
  @Matches(/^[a-f0-9]{64}$/)
  razorpay_signature: string;

  @ApiPropertyOptional({ description: 'Ignored. The stored order id is used for verification' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  razorpay_order_id?: string;
}

export class CheckoutResultResponse {
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true, type: String, description: 'Where to send the customer. Informational: confirm with the Status API or webhook' })
  redirectUrl: string | null;
}
