// FILE: modules/api-credentials/dto/api-credentials.dto.ts
// PURPOSE: DTOs for /api-credentials. Only CreatedCredentialResponse carries a secret, and only at creation
// DEPENDENCIES: class-validator, @nestjs/swagger
// PHASE: 6
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateApiCredentialDto {
  @ApiProperty({ example: 'Food app production', maxLength: 255 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}

export class CredentialIdParam {
  @IsUUID()
  id: string;
}

export class ApiCredentialResponse {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ example: 'pk_test_0123456789abcdef0123456789abcdef' }) publicKey: string;
  @ApiProperty({ enum: ['live', 'test'] }) mode: 'live' | 'test';
  @ApiProperty() isActive: boolean;
  @ApiProperty({ nullable: true, type: Date }) lastUsedAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class CreatedCredentialResponse extends ApiCredentialResponse {
  @ApiProperty({ description: 'Shown once. Only a hash is stored, so it cannot be retrieved later' })
  secretKey: string;
}

export class DeleteCredentialResponse {
  @ApiProperty() deleted: boolean;
}
