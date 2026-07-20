/**
 * Creates the `verification_documents` table and adds `verification_tier` to
 * `profiles`.
 *
 * Cooks may optionally submit Tier 1 verification documents (MOH Food Handler
 * Certificate or anti-typhoid vaccination proof). Admin approval of any one of
 * them grants verification_tier = 1, which powers the "Verified" badge.
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
alter table public.profiles
add column if not exists verification_tier integer not null default 0;

create table if not exists public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  doc_type text not null check (doc_type in ('food_handler_certificate', 'typhoid_vaccination')),
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists verification_documents_user_id_idx
  on public.verification_documents (user_id);
create index if not exists verification_documents_status_idx
  on public.verification_documents (status);

-- Cooks can see and submit their own documents; only the backend (service
-- role, which bypasses RLS) can review them.
alter table public.verification_documents enable row level security;

drop policy if exists "Cooks can view own verification documents" on public.verification_documents;
create policy "Cooks can view own verification documents"
  on public.verification_documents for select
  using (auth.uid() = user_id);

drop policy if exists "Cooks can submit own verification documents" on public.verification_documents;
create policy "Cooks can submit own verification documents"
  on public.verification_documents for insert
  with check (auth.uid() = user_id and status = 'pending');
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
        console.log(
          `✅ verification_documents table + verification_tier column ready. Endpoint: ${ep}`
        );
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
