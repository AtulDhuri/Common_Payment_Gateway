// FILE: modules/webhook-delivery/dto/webhook-config.dto.ts
// PURPOSE: DTOs for /webhooks/config and /webhooks/deliveries. Only the create / rotate responses carry a secret, once
// DEPENDENCIES: class-validator, class-transformer, @nestjs/swagger
// PHASE: 8
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const SECRET_MASK = '************';

export class UpsertWebhookConfigDto {
  @ApiProperty({ example: 'https://shop.example.com/payhub/webhook' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  url: string;

  @ApiPropertyOptional({ default: true, description: 'false stops new deliveries' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class WebhookConfigResponse {
  @ApiProperty() url: string;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ description: `${SECRET_MASK} always, except the one response that creates or rotates the secret` })
  secret: string;
  @ApiProperty({ description: 'true only when `secret` is the real signing secret. Copy it now, it is never shown again' })
  secretShownOnce: boolean;
}

export class DeliveryListQuery {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class DeliveryItem {
  @ApiProperty({ description: 'Same value as the X-PaymentHub-Delivery-Id header' }) id: string;
  @ApiProperty({ example: 'pay_0123456789abcdef0123' }) paymentId: string;
  @ApiProperty({ example: 'PAYMENT_SUCCESS' }) eventType: string;
  @ApiProperty({ enum: ['PENDING', 'DELIVERED', 'FAILED'] }) status: string;
  @ApiProperty() attemptCount: number;
  @ApiProperty({ nullable: true, type: Number }) responseCode: number | null;
  @ApiProperty({ nullable: true, type: Date }) lastAttemptAt: Date | null;
  @ApiProperty({ nullable: true, type: Date }) nextAttemptAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class DeliveryListResponse {
  @ApiProperty({ type: [DeliveryItem] }) items: DeliveryItem[];
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}
