-- =============================================================================
-- 0006_signup_role_default.sql
-- YOGYA database migration 6: signup role default.
-- Run inside a transaction, after 0005.
--
-- Every new Supabase Auth user gets:
--   1. a public.users row (auth_user_id = auth.users.id), and
--   2. a role_assignments row with role 'student', and
--   3. app_metadata.role = 'student' in the signed JWT (auth.users.raw_app_meta_data),
--      which is what app_role() / is_admin() in 0005 read.
--
-- ROLE RULES:
-- - Users cannot choose admin at registration. The signup path has no way to set
--   a role: raw_app_meta_data is overwritten to 'student' by the BEFORE INSERT
--   trigger below, and raw_app_meta_data is server-side app_metadata that clients
--   cannot write.
-- - Admin is granted only by services/api/scripts/grant_admin.py (run by an
--   operator with DATABASE_URL). Do not add any client-facing path that sets role.
--
-- No-op on a plain local Postgres: the whole block runs only when auth.users exists
-- (Supabase Auth schema).
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN

    -- BEFORE INSERT: force the signed app_metadata role to the default 'student'.
    -- Keeps any existing app_metadata (e.g. provider info) and sets role only.
    CREATE OR REPLACE FUNCTION public.set_default_app_role()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $f$
    BEGIN
      NEW.raw_app_meta_data :=
        coalesce(NEW.raw_app_meta_data, '{}'::jsonb) || '{"role": "student"}'::jsonb;
      RETURN NEW;
    END;
    $f$;

    DROP TRIGGER IF EXISTS auth_users_set_default_app_role ON auth.users;
    CREATE TRIGGER auth_users_set_default_app_role
      BEFORE INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.set_default_app_role();

    -- AFTER INSERT: create the public.users row and the 'student' role assignment.
    -- SECURITY DEFINER so it can write public tables regardless of the caller
    -- (the Supabase auth service role). search_path is pinned to avoid hijacking.
    CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $f$
    DECLARE
      v_user_id uuid;
    BEGIN
      -- PERSONAL DATA: email is copied from auth.users. 0002 flags whether email
      -- is stored at all as TBD; this is the current behaviour pending that review.
      INSERT INTO public.users (auth_user_id, email)
      VALUES (NEW.id, NEW.email)
      ON CONFLICT (auth_user_id) DO NOTHING;

      SELECT u.id INTO v_user_id
      FROM public.users u
      WHERE u.auth_user_id = NEW.id;

      INSERT INTO public.role_assignments (user_id, role)
      VALUES (v_user_id, 'student')
      ON CONFLICT (user_id, role) DO NOTHING;

      RETURN NEW;
    END;
    $f$;

    DROP TRIGGER IF EXISTS auth_users_handle_new_user ON auth.users;
    CREATE TRIGGER auth_users_handle_new_user
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

  END IF;
END
$$;
