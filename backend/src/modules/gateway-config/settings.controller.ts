// FILE: modules/gateway-config/settings.controller.ts
// PURPOSE: GET/PUT /settings/redirects (JWT)
// DEPENDENCIES: SettingsService
// PHASE: 7
import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { RedirectsResponse, UpdateRedirectsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('redirects')
  @ApiOkResponse({ type: RedirectsResponse })
  get(@TenantId() tenantId: string): Promise<RedirectsResponse> {
    return this.settings.getRedirects(tenantId);
  }

  @Put('redirects')
  @ResponseMessage('Redirect URLs saved')
  @ApiOkResponse({ type: RedirectsResponse, description: 'Replaces both URLs. null or empty clears one' })
  put(@TenantId() tenantId: string, @Body() dto: UpdateRedirectsDto): Promise<RedirectsResponse> {
    return this.settings.setRedirects(tenantId, dto);
  }
}
