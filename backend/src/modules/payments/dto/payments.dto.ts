// FILE: modules/payments/dto/payments.dto.ts
// PURPOSE: Request/response DTOs for the payment APIs (api-design.md: amount > 0 with max 2 decimals, 3-letter currency, valid email, metadata under 4 KB)
// DEPENDENCIES: class-validator, class-transformer, @nestjs/swagger
// PHASE: 5
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  registerDecorator,
  ValidateNested,
  ValidationOptions,
} from 'class-validator';
import { PaymentStatus } from '../payment-status';

export const METADATA_MAX_BYTES = 4096;

/** Rejects objects whose JSON form exceeds `maxBytes`. */
export function MaxJsonBytes(maxBytes: number, options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'maxJsonBytes',
      target: target.constructor,
      propertyName: propertyKey as string,
      options: { message: `${String(propertyKey)} must be at most ${maxBytes} bytes`, ...options },
      validator: {
        validate: (value: unknown): boolean => {
          try {
            return Buffer.byteLength(JSON.stringify(value ?? {}), 'utf8') <= maxBytes;
          } catch {
            return false;
          }
        },
      },
    });
  };
}

export class CustomerDto {
  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'john@example.com' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({ example: '+919999999999' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;
}

export class CreatePaymentDto {
  @ApiProperty({ example: 1, description: 'Major units (499 = 499.00), up to 2 decimals' })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(9_999_999_999.99)
  amount: number;

  @ApiProperty({ example: 'INR' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code' })
  currency: string;

  @ApiProperty({ type: CustomerDto })
  @ValidateNested()
  @Type(() => CustomerDto)
  customer: CustomerDto;

  @ApiPropertyOptional({ example: { orderId: 'FOOD-1001' }, description: 'Returned unchanged. Max 4 KB' })
  @IsOptional()
  @IsObject()
  @MaxJsonBytes(METADATA_MAX_BYTES)
  metadata?: Record<string, unknown>;
}

/** `:id` is the public payment reference. */
export class PaymentRefParam {
  @Matches(/^pay_[a-f0-9]{20}$/, { message: 'Invalid payment id' })
  id: string;
}

export class CreatePaymentResponse {
  @ApiProperty({ example: 'pay_0123456789abcdef0123' }) paymentId: string;
  @ApiProperty({ enum: PaymentStatus }) status: PaymentStatus;
  @ApiProperty() checkoutUrl: string;
}

export class PaymentStatusResponse {
  @ApiProperty() paymentId: string;
  @ApiProperty({ enum: PaymentStatus }) status: PaymentStatus;
  @ApiProperty() amount: number;
  @ApiProperty() currency: string;
  @ApiProperty({ nullable: true, type: String, description: 'Gateway payment id, once the customer has paid' })
  transactionId: string | null;
}
