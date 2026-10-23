// FILE: modules/merchant/merchant.controller.ts
// PURPOSE: POST/GET/PATCH /merchant-profile (JWT)
// DEPENDENCIES: MerchantService
// PHASE: 3
import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import {
  CreateMerchantProfileDto,
  MerchantProfileResponse,
  UpdateMerchantProfileDto,
} from './dto/merchant-profile.dto';
import { MerchantService } from './merchant.service';

@ApiTags('Merchant Profile')
@ApiBearerAuth()
@Controller('merchant-profile')
export class MerchantController {
  constructor(private readonly merchant: MerchantService) {}

  @Post()
  @ResponseMessage('Merchant profile created')
  @ApiCreatedResponse({ type: MerchantProfileResponse, description: 'Profile created' })
  @ApiConflictResponse({ description: 'INVALID_STATE: profile already exists' })
  create(@TenantId() tenantId: string, @Body() dto: CreateMerchantProfileDto): Promise<MerchantProfileResponse> {
    return this.merchant.create(tenantId, dto);
  }

  @Get()
  @ApiOkResponse({ type: MerchantProfileResponse })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: no profile yet' })
  get(@TenantId() tenantId: string): Promise<MerchantProfileResponse> {
    return this.merchant.get(tenantId);
  }

  @Patch()
  @ResponseMessage('Merchant profile updated')
  @ApiOkResponse({ type: MerchantProfileResponse })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: no profile yet' })
  update(@TenantId() tenantId: string, @Body() dto: UpdateMerchantProfileDto): Promise<MerchantProfileResponse> {
    return this.merchant.update(tenantId, dto);
  }
}
