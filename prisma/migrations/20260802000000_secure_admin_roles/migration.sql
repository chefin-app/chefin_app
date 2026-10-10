-- Role storage and its row-level security posture.
--
-- The table predates the committed migration history, so this migration is
-- written idempotently: it creates user_roles if it is missing and otherwise
-- only reconciles indexes, grants and policies. Running it against the live
-- database is a no-op.
--
-- Security model:
--   * A user may read only their own roles.
--   * A user may self-assign ONLY the 'cook' role — this is how a buyer opts
--     into selling from app/start-restaurant.tsx.
--   * Any other role, 'admin' included, can only be granted by the service
--     role. 20260804000000_admin_user_management adds the
--     user_roles_role_allowed CHECK and a trigger that blocks admin
--     self-assignment on top of this.

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_roles'::regclass
      AND conname = 'fk_user_roles_user'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT fk_user_roles_user
      FOREIGN KEY (user_id) REFERENCES public.profiles(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_role
  ON public.user_roles(user_id, role);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Read: own rows only.
DROP POLICY IF EXISTS user_roles_read_own ON public.user_roles;
CREATE POLICY user_roles_read_own
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Write: a user may grant themselves 'cook' and nothing else. The WITH CHECK
-- pins both the owner and the role value, so this cannot be used to escalate.
DROP POLICY IF EXISTS user_roles_create_own_cook_role ON public.user_roles;
CREATE POLICY user_roles_create_own_cook_role
  ON public.user_roles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND role = 'cook');

-- Trusted provisioning path for every other role.
DROP POLICY IF EXISTS "Service role can assign roles" ON public.user_roles;
CREATE POLICY "Service role can assign roles"
  ON public.user_roles
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT ON public.user_roles TO authenticated;
