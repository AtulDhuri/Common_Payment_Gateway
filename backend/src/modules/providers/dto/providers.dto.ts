// FILE: modules/providers/dto/providers.dto.ts
// PURPOSE: DTOs for provider endpoints
// DEPENDENCIES: class-validator, class-transformer, @nestjs/swagger
// PHASE: 4
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsObject, IsString, Matches, MaxLength } from 'class-validator';

export const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class TestConnectionDto {
  @ApiProperty({ example: 'RAZORPAY' })
  @Transform(upper)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[A-Z0-9_]+$/)
  provider: string;

  @ApiProperty({
    description: 'Values keyed by field_key from GET /providers/:code/fields',
    example: { key_id: 'rzp_test_abc', key_secret: '...', webhook_secret: '...' },
  })
  @IsObject()
  config: Record<string, unknown>;
}

export class ProviderResponse {
  @ApiProperty({ example: 'RAZORPAY' }) code: string;
  @ApiProperty({ example: 'Razorpay' }) name: string;
}

export class FieldResponse {
  @ApiProperty({ example: 'key_secret' }) fieldKey: string;
  @ApiProperty({ example: 'Key Secret' }) label: string;
  @ApiProperty({ enum: ['text', 'secret'] }) type: string;
  @ApiProperty() required: boolean;
  @ApiProperty() order: number;
}

export class ConnectionTestResponse {
  @ApiProperty() success: boolean;
  @ApiProperty() message: string;
  @ApiPropertyOptional({ description: 'Present on success. Valid 15 minutes. Required by PUT /gateway-config' })
  verificationToken?: string;
}
