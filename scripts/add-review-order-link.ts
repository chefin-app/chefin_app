/**
 * Links reviews to the order they came from.
 *
 * `reviews.order_id` makes reviews verified-purchase: a review can only be
 * created through the backend for a completed order the reviewer actually
 * placed, and the unique constraint enforces one review per order (ordering
 * the same dish twice still allows two reviews — one per order).
 *
 * Uses Supabase's pg-meta query endpoint with the service role key so we can
 * execute raw DDL from a script (the JS client doesn't expose raw SQL).
 *
 * Idempotent: guarded with `if not exists` / duplicate_object handling.
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
alter table public.reviews
add column if not exists order_id uuid references public.orders(id) on delete set null;

do $$
begin
  alter table public.reviews add constraint reviews_order_id_unique unique (order_id);
exception
  when duplicate_table then null;
  when duplicate_object then null;
end $$;
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
        console.log(`✅ reviews.order_id added (or already present). Endpoint: ${ep}`);
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
