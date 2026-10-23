// FILE: modules/providers/providers.controller.ts
// PURPOSE: GET /providers, GET /providers/:code/fields, POST /providers/test-connection (JWT)
// DEPENDENCIES: ProvidersService
// PHASE: 4
import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { ConnectionTestResponse, FieldResponse, ProviderResponse, TestConnectionDto } from './dto/providers.dto';
import { ProvidersService } from './providers.service';

@ApiTags('Providers')
@ApiBearerAuth()
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Get()
  @ApiOkResponse({ type: [ProviderResponse] })
  list(): Promise<ProviderResponse[]> {
    return this.providers.listActive();
  }

  // Declared before ':code/fields' only for readability; the paths do not overlap.
  @Post('test-connection')
  @HttpCode(200)
  @ApiOkResponse({
    type: ConnectionTestResponse,
    description: 'HTTP 200 with success:false and a message when the gateway rejects the credentials. Nothing is stored',
  })
  testConnection(@TenantId() tenantId: string, @Body() dto: TestConnectionDto): Promise<ConnectionTestResponse> {
    return this.providers.testConnection(tenantId, dto.provider, dto.config);
  }

  @Get(':code/fields')
  @ApiOkResponse({ type: [FieldResponse] })
  fields(@Param('code') code: string): Promise<FieldResponse[]> {
    return this.providers.getFields(code);
  }
}
