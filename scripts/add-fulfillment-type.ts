/**
 * Adds a fulfillment_type column to `orders` so customers can choose pickup
 * or delivery at checkout. Previously the cart always charged a delivery fee
 * with no way to opt for pickup instead.
 *
 * Uses Supabase's pg-meta query endpoint with the service role key so we can
 * execute raw DDL from a script (the JS client doesn't expose raw SQL).
 *
 * Idempotent: `add column if not exists` is a no-op if already applied.
 */
import { config } from 'dotenv';

config();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const sql = `
alter table public.orders
add column if not exists fulfillment_type text not null default 'pickup'
  check (fulfillment_type in ('pickup', 'delivery'));
`;

async function main() {
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
        console.log(`✅ fulfillment_type column added (or already present). Endpoint: ${ep}`);
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
