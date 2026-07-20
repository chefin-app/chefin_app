/**
 * Auto-creates a `profiles` row for every auth user.
 *
 * Root-cause fix for FK violations like
 *   insert on "favourites" violates foreign key "favourites_user_id_fkey"
 * which happen when a signed-in user has no profile yet. Previously a profile
 * was only created the first time someone saved it via /api/auth/update-profile,
 * so a freshly signed-up user had no profiles row — and favourites,
 * notifications, and orders all reference profiles.
 *
 * Two parts:
 *  1. A trigger on auth.users that inserts a stub profile on sign-up. Uses the
 *     user's metadata full_name/name if present, else the email local-part,
 *     else "New user" (profiles.full_name is NOT NULL).
 *  2. A one-time backfill for existing auth users missing a profile.
 *
 * Uses Supabase's pg-meta query endpoint with the service role key so we can
 * execute raw DDL from a script (the JS client doesn't expose raw SQL).
 *
 * Idempotent: `create or replace` + `if not exists` + `on conflict do nothing`
 * make re-runs no-ops.
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
-- 0. Onboarding flag. New users complete a name + phone onboarding step; this
-- boolean is the unambiguous "has finished onboarding" signal (rather than
-- sniffing the placeholder full_name the trigger sets).
alter table public.profiles
add column if not exists onboarding_completed boolean not null default false;

-- Existing users with a real name + phone are already effectively onboarded —
-- don't force them back through it.
update public.profiles
set onboarding_completed = true
where onboarding_completed = false
  and full_name is not null
  and full_name <> 'New user'
  and phone_number is not null
  and phone_number <> '';

-- 1. Trigger: create a stub profile whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'New user'
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Backfill: existing auth users who don't have a profile yet.
insert into public.profiles (user_id, full_name)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    nullif(split_part(u.email, '@', 1), ''),
    'New user'
  )
from auth.users u
left join public.profiles p on p.user_id = u.id
where p.user_id is null
on conflict (user_id) do nothing;
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
          `✅ Profile auto-create trigger installed + existing users backfilled. Endpoint: ${ep}`
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
