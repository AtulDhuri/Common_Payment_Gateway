// FILE: modules/merchant/merchant.service.ts
// PURPOSE: Create / get / update the tenant's single merchant profile
// DEPENDENCIES: MerchantRepository
// PHASE: 3
import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/types/app.exception';
import { ErrorCode } from '../../common/types/error-codes';
import {
  CreateMerchantProfileDto,
  MerchantProfileResponse,
  UpdateMerchantProfileDto,
} from './dto/merchant-profile.dto';
import { MerchantProfile } from './entities/merchant-profile.entity';
import { MerchantRepository } from './merchant.repository';

const PG_UNIQUE_VIOLATION = '23505';
const DEFAULT_COUNTRY = 'India';
const DEFAULT_CURRENCY = 'INR';
const DEFAULT_TIMEZONE = 'Asia/Kolkata';

@Injectable()
export class MerchantService {
  constructor(private readonly repo: MerchantRepository) {}

  async create(tenantId: string, dto: CreateMerchantProfileDto): Promise<MerchantProfileResponse> {
    if (await this.repo.findByTenantId(tenantId)) this.alreadyExists();
    try {
      const profile = await this.repo.create(tenantId, {
        businessName: dto.businessName,
        businessEmail: dto.businessEmail,
        supportEmail: dto.supportEmail ?? null,
        website: dto.website ?? null,
        phone: dto.phone ?? null,
        country: dto.country ?? DEFAULT_COUNTRY,
        currency: dto.currency ?? DEFAULT_CURRENCY,
        timezone: dto.timezone ?? DEFAULT_TIMEZONE,
      });
      return this.toResponse(profile);
    } catch (err) {
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) this.alreadyExists();
      throw err;
    }
  }

  async get(tenantId: string): Promise<MerchantProfileResponse> {
    return this.toResponse(await this.mustFind(tenantId));
  }

  async update(tenantId: string, dto: UpdateMerchantProfileDto): Promise<MerchantProfileResponse> {
    const profile = await this.mustFind(tenantId);
    const fields = [
      'businessName', 'businessEmail', 'supportEmail', 'website', 'phone', 'country', 'currency', 'timezone',
    ] as const;
    for (const f of fields) {
      if (dto[f] !== undefined) (profile as unknown as Record<string, unknown>)[f] = dto[f];
    }
    return this.toResponse(await this.repo.save(profile));
  }

  /** Display name for the hosted checkout. Null when the merchant has no profile yet. */
  async findBusinessName(tenantId: string): Promise<string | null> {
    return (await this.repo.findByTenantId(tenantId))?.businessName ?? null;
  }

  private async mustFind(tenantId: string): Promise<MerchantProfile> {
    const profile = await this.repo.findByTenantId(tenantId);
    if (!profile) throw new AppException(ErrorCode.NOT_FOUND, 'Merchant profile not found', 404);
    return profile;
  }

  private alreadyExists(): never {
    throw new AppException(ErrorCode.INVALID_STATE, 'Merchant profile already exists', 409);
  }

  private toResponse(p: MerchantProfile): MerchantProfileResponse {
    return {
      id: p.id,
      businessName: p.businessName,
      businessEmail: p.businessEmail,
      supportEmail: p.supportEmail,
      website: p.website,
      phone: p.phone,
      country: p.country,
      currency: p.currency,
      timezone: p.timezone,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
