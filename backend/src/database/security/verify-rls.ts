// FILE: database/security/verify-rls.ts
// PURPOSE: Proves row-level isolation on Supabase. Creates two throwaway merchants (A and B) inside one transaction, probes every
// public table as anon, as authenticated(A), authenticated(B) and as the backend, then ROLLS BACK. No data is kept or read from real rows.
// Run after every migration:  npm run security:verify-rls   (exit code 1 on any failure)
// DEPENDENCIES: pg, config
// PHASE: Security milestone (RLS)
import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { loadConfig } from '../../config/configuration';
import { loadEnvFile } from '../../config/load-env';

const INSUFFICIENT_PRIVILEGE = '42501';

/** Tables a signed-in merchant may read, own rows only. */
const READABLE = ['merchant_profiles', 'tenant_settings', 'payments', 'payment_events', 'audit_logs'] as const;
/** Tables the API roles must not touch at all (secrets, hashes, catalog, internals). */
const CLOSED = ['users', 'payment_gateway_configs', 'api_credentials', 'webhook_configs', 'webhook_events', 'payment_providers', 'payment_provider_fields', 'migrations'];
const EXPECTED_POLICIES = [
  'audit_logs_select_own',
  'merchant_profiles_select_own',
  'payment_events_select_own',
  'payments_select_own',
  'tenant_settings_select_own',
];
const PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];

interface Probe {
  rows?: Record<string, unknown>[];
  code?: string;
}

let failures = 0;
const log = (s: string): void => void process.stdout.write(s + '\n');
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
}

async function main(): Promise<void> {
  loadEnvFile();
  const db = new Client({ connectionString: loadConfig(process.env, false).databaseUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const who = (await db.query('select current_user u, (select rolbypassrls from pg_roles where rolname = current_user) bypass')).rows[0] as { u: string; bypass: boolean };
  log(`Backend role: ${who.u} (bypasses RLS: ${who.bypass})`);

  await db.query('BEGIN');
  try {
    // ---------- seed two merchants as the backend (owner) ----------
    const suffix = randomBytes(4).toString('hex');
    const providerId = (await db.query('select id from payment_providers order by code limit 1')).rows[0]?.id as string | undefined;
    if (!providerId) throw new Error('payment_providers is empty. Run npm run seed first');

    async function seed(label: string): Promise<{ id: string; paymentId: string }> {
      const id = (await db.query('insert into users(email, password_hash) values ($1, $2) returning id', [`rls-${label}-${suffix}@example.invalid`, 'not-a-real-hash'])).rows[0].id as string;
      await db.query('insert into merchant_profiles(user_id, business_name, business_email) values ($1, $2, $3)', [id, `Merchant ${label}`, `${label}@example.invalid`]);
      await db.query('insert into tenant_settings(tenant_id, success_url) values ($1, $2)', [id, `https://${label}.example.invalid/ok`]);
      await db.query("insert into payment_gateway_configs(tenant_id, provider_id, config_json) values ($1, $2, '{\"key_secret\":\"v1:x:y:z\"}')", [id, providerId]);
      await db.query('insert into api_credentials(tenant_id, name, public_key, secret_key_hash) values ($1, $2, $3, $4)', [id, `key ${label}`, `pk_test_rls${label}${suffix}`, '$2b$10$notarealhash']);
      const paymentId = (await db.query(
        `insert into payments(tenant_id, provider_id, payment_reference, amount, currency, customer_name, customer_email, checkout_token)
         values ($1, $2, $3, 1, 'INR', 'C', 'c@example.invalid', 'tok') returning id`,
        [id, providerId, `pay_rls${label}${suffix}`],
      )).rows[0].id as string;
      const eventId = (await db.query("insert into payment_events(payment_id, event_type, payload) values ($1, 'PAYMENT_CREATED', '{}') returning id", [paymentId])).rows[0].id as string;
      await db.query("insert into webhook_configs(tenant_id, webhook_url, webhook_secret) values ($1, $2, 'v1:x:y:z')", [id, `https://${label}.example.invalid/hook`]);
      await db.query("insert into webhook_events(tenant_id, payment_id, payment_event_id, event_type, endpoint_url, request_payload) values ($1, $2, $3, 'PAYMENT_CREATED', 'https://x.example.invalid/hook', '{}')", [id, paymentId, eventId]);
      await db.query("insert into audit_logs(tenant_id, action, entity, entity_id, payload) values ($1, 'TEST', 'payment', $2, '{}')", [id, paymentId]);
      return { id, paymentId };
    }
    const A = await seed('a');
    const B = await seed('b');

    // ---------- probe helper: run one statement as a role, inside a savepoint that is always undone ----------
    async function probe(role: 'anon' | 'authenticated' | 'owner', sub: string | null, sql: string, params: unknown[] = []): Promise<Probe> {
      await db.query('SAVEPOINT probe');
      try {
        if (role !== 'owner') {
          await db.query(`SET LOCAL ROLE ${role}`);
          const claims = sub ? JSON.stringify({ sub, role }) : '';
          await db.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [claims, sub ?? '']);
        }
        return { rows: (await db.query(sql, params)).rows };
      } catch (e) {
        return { code: (e as { code?: string }).code ?? 'ERR' };
      } finally {
        await db.query('ROLLBACK TO SAVEPOINT probe');
      }
    }
    const count = async (role: 'anon' | 'authenticated' | 'owner', sub: string | null, sql: string, params: unknown[] = []): Promise<number | string> => {
      const r = await probe(role, sub, sql, params);
      return r.code ?? Number(r.rows?.[0]?.['n']);
    };

    // ---------- 1. structure ----------
    log('\n== Structure ==');
    const tables = (await db.query("select c.relname, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1")).rows as { relname: string; rls: boolean }[];
    const noRls = tables.filter((t) => !t.rls).map((t) => t.relname);
    check(`RLS is enabled on all ${tables.length} public tables`, noRls.length === 0, noRls.length ? 'missing: ' + noRls.join(', ') : tables.map((t) => t.relname).join(', '));

    const policies = (await db.query("select policyname, tablename, roles::text r, cmd from pg_policies where schemaname = 'public' order by policyname")).rows as { policyname: string; r: string; cmd: string }[];
    check('policies are exactly the expected five, all SELECT-only for authenticated', JSON.stringify(policies.map((p) => p.policyname)) === JSON.stringify(EXPECTED_POLICIES) && policies.every((p) => p.cmd === 'SELECT' && p.r === '{authenticated}'), policies.map((p) => p.policyname).join(', '));

    const badAnon: string[] = [];
    const badAuth: string[] = [];
    for (const t of tables.map((x) => x.relname)) {
      for (const p of PRIVS) {
        const anon = (await db.query('select has_table_privilege($1, $2, $3) ok', ['anon', `public.${t}`, p])).rows[0].ok as boolean;
        if (anon) badAnon.push(`${t}:${p}`);
        const auth = (await db.query('select has_table_privilege($1, $2, $3) ok', ['authenticated', `public.${t}`, p])).rows[0].ok as boolean;
        const allowed = p === 'SELECT' && (READABLE as readonly string[]).includes(t);
        if (auth && !allowed) badAuth.push(`${t}:${p}`);
      }
    }
    check('anon holds no privilege on any table', badAnon.length === 0, badAnon.slice(0, 6).join(', '));
    check('authenticated holds only SELECT on the five readable tables', badAuth.length === 0, badAuth.slice(0, 6).join(', '));

    const defAcl = (await db.query("select defaclacl::text a from pg_default_acl where defaclnamespace = 'public'::regnamespace and defaclobjtype = 'r' and pg_get_userbyid(defaclrole) = current_user")).rows as { a: string }[];
    check('new tables created by the backend role start closed to anon/authenticated', defAcl.every((d) => !/(^|[{,])(anon|authenticated)=/.test(d.a)), defAcl.map((d) => d.a).join(' ') || 'no default ACL');

    const fn = Number((await db.query("select count(*) n from pg_proc where pronamespace = 'public'::regnamespace")).rows[0].n);
    const vw = Number((await db.query("select count(*) n from pg_views where schemaname = 'public'")).rows[0].n);
    check('no functions or views in public (they would be exposed by the API and can bypass RLS)', fn === 0 && vw === 0, `functions=${fn} views=${vw}`);

    // ---------- 2. isolation ----------
    log('\n== Merchant isolation: authenticated as A and as B ==');
    const own: Record<string, { total: string; other: (id: string) => string }> = {
      merchant_profiles: { total: 'select count(*) n from merchant_profiles', other: () => 'select count(*) n from merchant_profiles where user_id = $1' },
      tenant_settings: { total: 'select count(*) n from tenant_settings', other: () => 'select count(*) n from tenant_settings where tenant_id = $1' },
      payments: { total: 'select count(*) n from payments', other: () => 'select count(*) n from payments where tenant_id = $1' },
      payment_events: { total: 'select count(*) n from payment_events', other: () => 'select count(*) n from payment_events where payment_id = (select id from payments p where p.tenant_id = $1 limit 1)' },
      audit_logs: { total: 'select count(*) n from audit_logs', other: () => 'select count(*) n from audit_logs where tenant_id = $1' },
    };
    for (const [me, other, label] of [[A, B, 'A'], [B, A, 'B']] as const) {
      const otherLabel = label === 'A' ? 'B' : 'A';
      for (const t of READABLE) {
        const total = await count('authenticated', me.id, own[t].total);
        check(`Merchant ${label} sees only its own ${t} rows`, total === 1, `visible rows: ${total}`);
        const peek = await count('authenticated', me.id, own[t].other(other.id), [other.id]);
        check(`Merchant ${label} cannot see Merchant ${otherLabel}'s ${t}`, peek === 0, `rows: ${peek}`);
      }
      for (const t of CLOSED) {
        const r = await probe('authenticated', me.id, `select count(*) n from ${t}`);
        check(`Merchant ${label} has no access to ${t} (even its own)`, r.code === INSUFFICIENT_PRIVILEGE, r.code ?? `rows returned`);
      }
    }

    log('\n== No identity / wrong identity ==');
    for (const t of READABLE) {
      const stranger = await count('authenticated', randomUUID(), own[t].total);
      check(`unknown signed-in user sees 0 rows of ${t}`, stranger === 0, String(stranger));
      const anonymousJwt = await count('authenticated', null, own[t].total);
      check(`signed-in role with no subject sees 0 rows of ${t}`, anonymousJwt === 0, String(anonymousJwt));
    }

    log('\n== anon (the public API key) ==');
    for (const t of [...READABLE, ...CLOSED]) {
      const r = await probe('anon', null, `select count(*) n from ${t}`);
      check(`anon cannot read ${t}`, r.code === INSUFFICIENT_PRIVILEGE, r.code ?? 'rows returned');
    }

    log('\n== Writes through the API are refused ==');
    const writes: [string, string, unknown[]][] = [
      ['INSERT into payments', "insert into payments(tenant_id, provider_id, payment_reference, amount, currency, customer_name, customer_email, checkout_token) values ($1, $2, 'pay_rlsx', 1, 'INR', 'x', 'x@x.x', 't')", [A.id, providerId]],
      ['UPDATE own payment', "update payments set status = 'SUCCESS' where tenant_id = $1", [A.id]],
      ['DELETE own payment', 'delete from payments where tenant_id = $1', [A.id]],
      ['UPDATE other merchant payment', "update payments set status = 'SUCCESS' where tenant_id = $1", [B.id]],
      ['DELETE own audit log (append-only)', 'delete from audit_logs where tenant_id = $1', [A.id]],
      ['UPDATE own audit log (append-only)', "update audit_logs set action = 'X' where tenant_id = $1", [A.id]],
      ['UPDATE own merchant profile', "update merchant_profiles set business_name = 'hacked' where user_id = $1", [A.id]],
      ['INSERT into api_credentials', "insert into api_credentials(tenant_id, name, public_key, secret_key_hash) values ($1, 'x', 'pk_test_x', 'h')", [A.id]],
      ['UPDATE users', "update users set email = 'x@x.x' where id = $1", [A.id]],
    ];
    for (const [name, sql, params] of writes) {
      const viaAuth = await probe('authenticated', A.id, sql, params);
      check(`authenticated: ${name} refused`, viaAuth.code === INSUFFICIENT_PRIVILEGE, viaAuth.code ?? `succeeded (${viaAuth.rows ? 'no error' : ''})`);
      const viaAnon = await probe('anon', null, sql, params);
      check(`anon: ${name} refused`, viaAnon.code === INSUFFICIENT_PRIVILEGE, viaAnon.code ?? 'succeeded');
    }

    log('\n== The backend (owner role) is unaffected ==');
    for (const [t, sql, expected] of [
      ['payments', 'select count(*) n from payments where tenant_id = any($1)', 2],
      ['merchant_profiles', 'select count(*) n from merchant_profiles where user_id = any($1)', 2],
      ['payment_gateway_configs', 'select count(*) n from payment_gateway_configs where tenant_id = any($1)', 2],
      ['api_credentials', 'select count(*) n from api_credentials where tenant_id = any($1)', 2],
      ['webhook_configs', 'select count(*) n from webhook_configs where tenant_id = any($1)', 2],
      ['webhook_events', 'select count(*) n from webhook_events where tenant_id = any($1)', 2],
      ['users', 'select count(*) n from users where id = any($1)', 2],
    ] as const) {
      const n = await count('owner', null, sql, [[A.id, B.id]]);
      check(`backend reads both merchants' ${t}`, n === expected, String(n));
    }
    const w = await probe('owner', null, "update payments set status = 'SUCCESS' where id = $1 returning id", [A.paymentId]);
    check('backend can still write (update payment)', (w.rows?.length ?? 0) === 1, w.code ?? 'ok');
  } finally {
    await db.query('ROLLBACK');
    const leftovers = Number((await db.query("select count(*) n from users where email like 'rls-%@example.invalid'")).rows[0].n);
    check('all test data rolled back (no residue)', leftovers === 0, `leftover test users: ${leftovers}`);
    await db.end();
  }

  log(`\nRESULT: ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  process.stderr.write(`verify-rls aborted: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(2);
});
