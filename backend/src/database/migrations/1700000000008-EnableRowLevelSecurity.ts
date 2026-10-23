// FILE: database/migrations/1700000000008-EnableRowLevelSecurity.ts
// PURPOSE: Supabase hardening (docs/rls-policies.md). Enables RLS on every public table, removes anon/authenticated
// privileges, closes future tables by default, and adds tenant-scoped read-only policies for the tables a merchant may read.
// The backend connects as the table owner (postgres, BYPASSRLS), so it is unaffected.
// DEPENDENCIES: Supabase roles anon / authenticated and auth.uid(); skipped on plain Postgres
// PHASE: Security milestone (before Phase 8)
import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnableRowLevelSecurity1700000000008 implements MigrationInterface {
  name = 'EnableRowLevelSecurity1700000000008';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
DO $$
DECLARE
  r record;
  has_anon boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_auth boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
  has_uid  boolean := to_regprocedure('auth.uid()') IS NOT NULL;
BEGIN
  -- 1. Every table in public: RLS on, and no direct access for API roles unless a policy + grant is added below.
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    IF has_anon THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', r.tablename); END IF;
    IF has_auth THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', r.tablename); END IF;
  END LOOP;

  -- 2. Tables created later start closed (Supabase grants everything to these roles by default).
  IF has_anon THEN ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon; END IF;
  IF has_auth THEN ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated; END IF;

  -- 3. Read-only, own-rows-only access for a signed-in merchant (tenant id == auth.uid()).
  --    Writes never go through the API: only the backend writes.
  IF has_auth AND has_uid THEN
    CREATE POLICY merchant_profiles_select_own ON public.merchant_profiles
      FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
    CREATE POLICY tenant_settings_select_own ON public.tenant_settings
      FOR SELECT TO authenticated USING (tenant_id = (SELECT auth.uid()));
    CREATE POLICY payments_select_own ON public.payments
      FOR SELECT TO authenticated USING (tenant_id = (SELECT auth.uid()));
    CREATE POLICY payment_events_select_own ON public.payment_events
      FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.payments p
                WHERE p.id = payment_events.payment_id AND p.tenant_id = (SELECT auth.uid())));
    CREATE POLICY audit_logs_select_own ON public.audit_logs
      FOR SELECT TO authenticated USING (tenant_id = (SELECT auth.uid()));

    GRANT SELECT ON public.merchant_profiles, public.tenant_settings, public.payments,
                    public.payment_events, public.audit_logs TO authenticated;
  END IF;
END $$;`);
  }

  async down(q: QueryRunner): Promise<void> {
    // Restores Supabase's default (open) state. Only for development rollbacks.
    await q.query(`
DO $$
DECLARE
  r record;
  has_anon boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_auth boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tablename);
    IF has_anon THEN EXECUTE format('GRANT ALL ON TABLE public.%I TO anon', r.tablename); END IF;
    IF has_auth THEN EXECUTE format('GRANT ALL ON TABLE public.%I TO authenticated', r.tablename); END IF;
  END LOOP;
  IF has_anon THEN ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon; END IF;
  IF has_auth THEN ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated; END IF;
END $$;`);
  }
}
