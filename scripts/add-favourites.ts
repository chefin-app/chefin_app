/**
 * Creates the `favourites` table — which cooks (restaurants) a user has
 * hearted.
 *
 * Previously favourites lived only in React state, so they vanished on app
 * restart and the backend had no way to know who to notify when a favourited
 * cook adds a new dish or opens new pickup slots. Rows carry a denormalised
 * display snapshot (name, image, rating) so the Favourites screen renders
 * without extra joins.
 *
 * Uses Supabase's pg-meta query endpoint with the service role key so we can
 * execute raw DDL from a script (the JS client doesn't expose raw SQL).
 *
 * Idempotent: `if not exists` guards make re-runs no-ops.
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
create table if not exists public.favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  cook_profile_id uuid not null references public.profiles(id) on delete cascade,
  restaurant_name text,
  image_url text,
  chef_name text,
  rating text,
  review_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, cook_profile_id)
);

-- Fan-out lookups: "who favourited this cook?"
create index if not exists favourites_cook_profile_id_idx
  on public.favourites (cook_profile_id);

alter table public.favourites enable row level security;

drop policy if exists "Users can view own favourites" on public.favourites;
create policy "Users can view own favourites"
  on public.favourites for select
  using (auth.uid() = user_id);

drop policy if exists "Users can add own favourites" on public.favourites;
create policy "Users can add own favourites"
  on public.favourites for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove own favourites" on public.favourites;
create policy "Users can remove own favourites"
  on public.favourites for delete
  using (auth.uid() = user_id);
`;

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
        console.log(`✅ favourites table ready. Endpoint: ${ep}`);
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
