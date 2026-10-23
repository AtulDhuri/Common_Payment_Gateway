// FILE: database/seeds/providers.seed.ts
// PURPOSE: Idempotent seed for the provider catalog (upsert by code and by (provider_id, field_key))
// DEPENDENCIES: data-source.ts
// PHASE: 4
import dataSource from '../data-source';

interface FieldSeed {
  key: string;
  label: string;
  type: 'text' | 'secret';
  required: boolean;
}

const PROVIDERS: { code: string; name: string; isActive: boolean; fields: FieldSeed[] }[] = [
  {
    code: 'RAZORPAY',
    name: 'Razorpay',
    isActive: true,
    fields: [
      { key: 'key_id', label: 'Key ID', type: 'text', required: true },
      { key: 'key_secret', label: 'Key Secret', type: 'secret', required: true },
      { key: 'webhook_secret', label: 'Webhook Secret', type: 'secret', required: false },
    ],
  },
];

async function seed(): Promise<void> {
  await dataSource.initialize();
  try {
    for (const p of PROVIDERS) {
      const rows: { id: string }[] = await dataSource.query(
        `INSERT INTO "payment_providers" ("code","name","is_active") VALUES ($1,$2,$3)
         ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "is_active" = EXCLUDED."is_active"
         RETURNING "id"`,
        [p.code, p.name, p.isActive],
      );
      const providerId = rows[0].id;
      for (const [i, f] of p.fields.entries()) {
        await dataSource.query(
          `INSERT INTO "payment_provider_fields"
             ("provider_id","field_key","field_label","field_type","is_required","display_order")
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT ("provider_id","field_key") DO UPDATE SET
             "field_label" = EXCLUDED."field_label", "field_type" = EXCLUDED."field_type",
             "is_required" = EXCLUDED."is_required", "display_order" = EXCLUDED."display_order"`,
          [providerId, f.key, f.label, f.type, f.required, i + 1],
        );
      }
    }
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((err: unknown) => {
  process.stderr.write(`Seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
