// FILE: modules/providers/entities/payment-provider-field.entity.ts
// PURPOSE: payment_provider_fields table (db-design.md). Drives dynamic gateway forms
// DEPENDENCIES: typeorm
// PHASE: 4
import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

export type FieldType = 'text' | 'secret';

@Entity({ name: 'payment_provider_fields' })
@Unique(['providerId', 'fieldKey'])
export class PaymentProviderField {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ name: 'field_key', type: 'varchar', length: 64 })
  fieldKey: string;

  @Column({ name: 'field_label', type: 'varchar', length: 100 })
  fieldLabel: string;

  @Column({ name: 'field_type', type: 'varchar', length: 16 })
  fieldType: FieldType;

  @Column({ name: 'is_required', type: 'boolean' })
  isRequired: boolean;

  @Column({ name: 'display_order', type: 'int' })
  displayOrder: number;
}
