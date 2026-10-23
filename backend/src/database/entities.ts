// FILE: database/entities.ts
// PURPOSE: Single list of entities used by the app and the migration CLI
// DEPENDENCIES: all entities
// PHASE: 4 (Payment entities added in PHASE 5)
import { ApiCredential } from '../modules/api-credentials/entities/api-credential.entity';
import { AuditLog } from '../modules/audit/entities/audit-log.entity';
import { PaymentGatewayConfig } from '../modules/gateway-config/entities/payment-gateway-config.entity';
import { TenantSettings } from '../modules/gateway-config/entities/tenant-settings.entity';
import { MerchantProfile } from '../modules/merchant/entities/merchant-profile.entity';
import { PaymentProviderEntity } from '../modules/providers/entities/payment-provider.entity';
import { PaymentProviderField } from '../modules/providers/entities/payment-provider-field.entity';
import { PaymentEvent } from '../modules/payments/entities/payment-event.entity';
import { Payment } from '../modules/payments/entities/payment.entity';
import { WebhookConfig } from '../modules/webhook-delivery/entities/webhook-config.entity';
import { WebhookEvent } from '../modules/webhook-delivery/entities/webhook-event.entity';
import { User } from '../modules/users/entities/user.entity';

export const ENTITIES = [
  User,
  MerchantProfile,
  PaymentProviderEntity,
  PaymentProviderField,
  PaymentGatewayConfig,
  TenantSettings,
  AuditLog,
  Payment,
  PaymentEvent,
  ApiCredential,
  WebhookConfig,
  WebhookEvent,
];
