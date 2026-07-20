/**
 * Creates the `notifications` table for in-app transactional notifications
 * (order lifecycle + payouts).
 *
 * Rows are only ever created by the backend (service role) when an order
 * event happens; clients read their own rows and mark them read. The table is
 * added to the realtime publication so the app receives new notifications
 * live without polling.
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
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  -- One account can be both a customer and a cook; each notification belongs
  -- to exactly one of those modes so the feeds and badges stay separate.
  recipient_role text not null default 'customer' check (recipient_role in ('customer', 'cook')),
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Upgrade path for tables created before recipient_role existed.
alter table public.notifications
add column if not exists recipient_role text not null default 'customer'
  check (recipient_role in ('customer', 'cook'));

-- Backfill: cook-facing types created before the column existed.
update public.notifications
set recipient_role = 'cook'
where type in ('new_order', 'payout_sent', 'verification_approved', 'verification_rejected', 'dish_approved', 'dish_rejected')
  and recipient_role = 'customer';

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

-- Users can read their own notifications and mark them read. There is no
-- insert policy: only the backend (service role, which bypasses RLS) creates
-- notifications, so clients can't forge them.
alter table public.notifications enable row level security;

drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Realtime: let clients subscribe to their own INSERTs.
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;
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
        console.log(`✅ notifications table ready (RLS + realtime). Endpoint: ${ep}`);
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
