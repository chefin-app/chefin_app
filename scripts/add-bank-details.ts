/**
 * Adds cook payout bank detail columns to the `profiles` table.
 *
 * Cooks are paid out by bank transfer, so instead of a card we collect
 * Bank Name, Bank Account Name and Bank Account Number.
 *
 * Uses Supabase's pg-meta query endpoint with the service role key so we can
 * execute raw DDL from a script (the JS client doesn't expose raw SQL).
 *
 * Idempotent: `add column if not exists` is a no-op if the column already exists.
 */
import { config } from 'dotenv';

config();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const sql = `alter table public.profiles
add column if not exists bank_name text,
add column if not exists bank_account_name text,
add column if not exists bank_account_number text;`;

async function main() {
  // Supabase's hosted Postgres exposes a SQL endpoint at /pg/query for service-role keys.
  // Some projects route this through the `pg-meta` URL instead — try both.
  const candidates = [`${url}/pg/query`, `${url}/pg-meta/query`];

  for (const ep of candidates) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey!,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: sql }),
      });
      if (res.ok) {
        console.log(`✅ Bank detail columns added (or already present). Endpoint: ${ep}`);
        return;
      }
      console.warn(`Endpoint ${ep} returned ${res.status}: ${await res.text()}`);
    } catch (e: any) {
      console.warn(`Endpoint ${ep} failed: ${e.message}`);
    }
  }

  console.error(
    '\n❌ Could not run DDL automatically. Run this SQL in the Supabase dashboard SQL editor:\n'
  );
  console.error(sql);
  process.exit(1);
}

main();
