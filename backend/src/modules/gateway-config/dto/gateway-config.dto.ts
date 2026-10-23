// FILE: modules/gateway-config/dto/gateway-config.dto.ts
// PURPOSE: DTOs for /gateway-config. Responses never carry secret values
// DEPENDENCIES: class-validator, class-transformer, @nestjs/swagger
// PHASE: 4
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';
import { upper } from '../../providers/dto/providers.dto';

const URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true };

export class SaveGatewayConfigDto {
  @ApiProperty({ example: 'RAZORPAY' })
  @Transform(upper)
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[A-Z0-9_]+$/)
  provider: string;

  @ApiProperty({ example: { key_id: 'rzp_test_abc', key_secret: '...', webhook_secret: '...' } })
  @IsObject()
  config: Record<string, unknown>;

  @ApiProperty({ description: 'verificationToken returned by POST /providers/test-connection for this same config' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  verificationToken: string;

  @ApiPropertyOptional({ example: 'https://app.example.com/payment/success' })
  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(500)
  successUrl?: string;

  @ApiPropertyOptional({ example: 'https://app.example.com/payment/failed' })
  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(500)
  failureUrl?: string;
}

export class ReplaceSecretDto {
  @ApiProperty({ example: 'key_secret' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,63}$/)
  fieldKey: string;

  @ApiProperty({ description: 'New secret value. Never returned by any endpoint' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  value: string;
}

export class GatewayConfigResponse {
  @ApiProperty({ example: 'RAZORPAY' }) provider: string;
  @ApiProperty() isVerified: boolean;
  @ApiProperty({ nullable: true, type: Date }) verifiedAt: Date | null;
  @ApiProperty({
    description: 'Text fields show their value. Secret fields show a fixed mask',
    example: { key_id: 'rzp_test_abc', key_secret: '************' },
  })
  fields: Record<string, string>;
}

export class ReplaceSecretResponse {
  @ApiProperty() fieldKey: string;
  @ApiProperty() configured: boolean;
}
