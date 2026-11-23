-- =============================================================================
-- YOGYA operator script: promote an existing Supabase Auth user to Admin
-- =============================================================================
-- HOW TO USE
-- 1. Register the account normally in YOGYA/Supabase Auth first. This ensures the
--    password is hashed and managed by Supabase; never insert passwords with SQL.
-- 2. Replace turnerevent.co@gmail.com below with that account's exact email.
-- 3. Run this complete script once in the Supabase SQL Editor as a database owner.
-- 4. Sign out and sign in again so the browser receives fresh auth metadata.
--
-- This script is intentionally not a migration: admin membership is environment
-- data and must not be reproduced automatically in every database.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_email text := lower(trim('turnerevent.co@gmail.com'));
  v_auth_user_id uuid;
  v_user_id uuid;
  v_matches integer;
BEGIN
  IF position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'Enter a valid registered admin email';
  END IF;

  SELECT count(*)
    INTO v_matches
    FROM auth.users
   WHERE lower(email) = v_email;

  IF v_matches = 0 THEN
    RAISE EXCEPTION 'No Supabase Auth user exists for the supplied email. Register it first.';
  ELSIF v_matches > 1 THEN
    RAISE EXCEPTION 'Multiple Auth users match this email; resolve the duplicate before promotion.';
  END IF;

  SELECT id INTO v_auth_user_id
    FROM auth.users
   WHERE lower(email) = v_email;

  INSERT INTO public.users (auth_user_id, email)
  VALUES (v_auth_user_id, v_email)
  ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email
  RETURNING id INTO v_user_id;

  -- YOGYA has exactly one active application role per user.
  DELETE FROM public.role_assignments WHERE user_id = v_user_id;
  INSERT INTO public.role_assignments (user_id, role, granted_by)
  VALUES (v_user_id, 'admin', NULL);

  UPDATE auth.users
     SET raw_app_meta_data =
         coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   WHERE id = v_auth_user_id;

  INSERT INTO public.audit_logs
    (actor_user_id, action, entity_type, entity_id, details)
  VALUES
    (NULL, 'user.admin_granted', 'user', v_user_id,
     jsonb_build_object('method', 'operator_sql'));
END
$$;

COMMIT;

-- Verification (returns email + role only; never credentials):
SELECT u.email, ra.role, ra.granted_at
  FROM public.users u
  JOIN public.role_assignments ra ON ra.user_id = u.id
 WHERE lower(u.email) = lower('turnerevent.co@gmail.com');
