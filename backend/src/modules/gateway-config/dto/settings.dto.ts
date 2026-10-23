// FILE: modules/gateway-config/dto/settings.dto.ts
// PURPOSE: DTOs for /settings/redirects
// DEPENDENCIES: class-validator, class-transformer, @nestjs/swagger
// PHASE: 7
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsUrl, MaxLength } from 'class-validator';

const URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };

/** Empty string means "clear". */
const blankToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

export class UpdateRedirectsDto {
  @ApiPropertyOptional({ example: 'https://shop.example.com/return', nullable: true })
  @Transform(blankToNull)
  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(500)
  successUrl?: string | null;

  @ApiPropertyOptional({ example: 'https://shop.example.com/return', nullable: true })
  @Transform(blankToNull)
  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(500)
  failureUrl?: string | null;
}

export class RedirectsResponse {
  @ApiPropertyOptional({ nullable: true, type: String }) successUrl: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) failureUrl: string | null;
}
