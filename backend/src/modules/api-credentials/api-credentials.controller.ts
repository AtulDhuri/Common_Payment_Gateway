// FILE: modules/api-credentials/api-credentials.controller.ts
// PURPOSE: Dashboard endpoints (JWT) to generate, list, deactivate and delete API credentials. No endpoint returns a secret after creation
// DEPENDENCIES: ApiCredentialsService
// PHASE: 6
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ApiCredentialsService } from './api-credentials.service';
import {
  ApiCredentialResponse,
  CreateApiCredentialDto,
  CreatedCredentialResponse,
  CredentialIdParam,
  DeleteCredentialResponse,
} from './dto/api-credentials.dto';

@ApiTags('API Credentials')
@ApiBearerAuth()
@Controller('api-credentials')
export class ApiCredentialsController {
  constructor(private readonly credentials: ApiCredentialsService) {}

  @Post()
  @ResponseMessage('API credentials created. Copy the secret now, it will not be shown again')
  @ApiCreatedResponse({ type: CreatedCredentialResponse, description: 'The only response that ever contains secretKey' })
  create(@TenantId() tenantId: string, @Body() dto: CreateApiCredentialDto): Promise<CreatedCredentialResponse> {
    return this.credentials.generate(tenantId, dto.name);
  }

  @Get()
  @ApiOkResponse({ type: [ApiCredentialResponse] })
  list(@TenantId() tenantId: string): Promise<ApiCredentialResponse[]> {
    return this.credentials.list(tenantId);
  }

  @Patch(':id/deactivate')
  @ResponseMessage('API credential deactivated')
  @ApiOkResponse({ type: ApiCredentialResponse })
  deactivate(@TenantId() tenantId: string, @Param() p: CredentialIdParam): Promise<ApiCredentialResponse> {
    return this.credentials.deactivate(tenantId, p.id);
  }

  @Delete(':id')
  @HttpCode(200)
  @ResponseMessage('API credential deleted')
  @ApiOkResponse({ type: DeleteCredentialResponse })
  remove(@TenantId() tenantId: string, @Param() p: CredentialIdParam): Promise<DeleteCredentialResponse> {
    return this.credentials.remove(tenantId, p.id);
  }
}
