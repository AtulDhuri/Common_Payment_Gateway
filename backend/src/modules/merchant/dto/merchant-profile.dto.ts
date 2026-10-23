// FILE: modules/merchant/dto/merchant-profile.dto.ts
// PURPOSE: Request/response DTOs with validation and Swagger metadata
// DEPENDENCIES: class-validator, @nestjs/swagger
// PHASE: 3
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';
import { MerchantStatus } from '../entities/merchant-profile.entity';

const URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true };

/** Create: businessName and businessEmail required; the rest optional. */
export class CreateMerchantProfileDto {
  @ApiProperty({ example: 'ABC Technologies', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  businessName: string;

  @ApiProperty({ example: 'info@abc.com' })
  @IsEmail()
  @MaxLength(255)
  businessEmail: string;

  @ApiPropertyOptional({ example: 'support@abc.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  supportEmail?: string;

  @ApiPropertyOptional({ example: 'https://abc.com' })
  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({ example: '+919999999999', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: 'India', default: 'India', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: 'INR', default: 'INR', maxLength: 10 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata', default: 'Asia/Kolkata', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  timezone?: string;
}

/**
 * Update: every field optional. Omitted = unchanged. Optional columns accept null to clear.
 * Required columns (businessName, businessEmail, currency, timezone) reject null.
 */
export class UpdateMerchantProfileDto {
  @ApiPropertyOptional({ example: 'ABC Technologies', maxLength: 255 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  businessName?: string;

  @ApiPropertyOptional({ example: 'info@abc.com' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsEmail()
  @MaxLength(255)
  businessEmail?: string;

  @ApiPropertyOptional({ example: 'support@abc.com', nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  supportEmail?: string | null;

  @ApiPropertyOptional({ example: 'https://abc.com', nullable: true })
  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(500)
  website?: string | null;

  @ApiPropertyOptional({ example: '+919999999999', nullable: true, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'India', nullable: true, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string | null;

  @ApiPropertyOptional({ example: 'INR', maxLength: 10 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata', maxLength: 100 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  timezone?: string;
}

export class MerchantProfileResponse {
  @ApiProperty() id: string;
  @ApiProperty() businessName: string;
  @ApiProperty() businessEmail: string;
  @ApiProperty({ nullable: true, type: String }) supportEmail: string | null;
  @ApiProperty({ nullable: true, type: String }) website: string | null;
  @ApiProperty({ nullable: true, type: String }) phone: string | null;
  @ApiProperty({ nullable: true, type: String }) country: string | null;
  @ApiProperty() currency: string;
  @ApiProperty() timezone: string;
  @ApiProperty({ enum: MerchantStatus }) status: MerchantStatus;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
