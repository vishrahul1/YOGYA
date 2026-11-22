-- =============================================================================
-- 0005_row_level_security.sql
-- YOGYA database migration 5 of 5: row-level security, helper functions,
-- policies and grants.
-- Run inside a transaction, after 0004.
--
-- Roles: exactly two authenticated roles, 'student' and 'admin'. Guests (anon)
-- may read published scheme catalogue data only. Deny by default: a table with
-- RLS enabled and no matching policy returns no rows and rejects writes.
--
-- Service role: the backend connects with the Supabase service role, which has
-- BYPASSRLS and therefore writes audit_logs and other server-side data. A
-- connection by a role WITHOUT BYPASSRLS is subject to these policies (FORCE).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Local-test shim for the auth schema.
-- Supabase provides auth.uid() and auth.jwt() natively. This block only creates
-- them when the 'auth' schema is missing (plain local Postgres).
-- LOCAL-TEST SHIM: do not rely on this shim in production. Supabase's own
-- auth.uid() / auth.jwt() are used there.
-- request.jwt.claims / request.jwt.claim.sub are the Supabase/PostgREST convention.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;

    CREATE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $f$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $f$;

    CREATE FUNCTION auth.jwt()
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    AS $f$
      SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $f$;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 2. Helper functions. STABLE, not SECURITY DEFINER.
-- -----------------------------------------------------------------------------

-- Role taken from the JWT app_metadata claim ('student' or 'admin' or '').
-- TBD: keeping app_metadata.role in sync with role_assignments is not specified.
CREATE OR REPLACE FUNCTION app_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app_role() = 'admin'
$$;

-- student_profiles.id values owned by the caller.
-- users.auth_user_id holds the Supabase auth uid.
CREATE OR REPLACE FUNCTION current_student_profile_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  SELECT sp.id
  FROM student_profiles sp
  JOIN users u ON u.id = sp.user_id
  WHERE u.auth_user_id = auth.uid()
$$;

-- -----------------------------------------------------------------------------
-- 3. Enable and FORCE row-level security on every table.
-- -----------------------------------------------------------------------------
ALTER TABLE users                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                         FORCE ROW LEVEL SECURITY;
ALTER TABLE role_assignments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_assignments              FORCE ROW LEVEL SECURITY;
ALTER TABLE student_profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles              FORCE ROW LEVEL SECURITY;
ALTER TABLE schemes                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE schemes                       FORCE ROW LEVEL SECURITY;
ALTER TABLE scheme_versions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheme_versions               FORCE ROW LEVEL SECURITY;
ALTER TABLE scheme_sources                ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheme_sources                FORCE ROW LEVEL SECURITY;
ALTER TABLE source_documents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_documents              FORCE ROW LEVEL SECURITY;
ALTER TABLE scheme_rules                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheme_rules                  FORCE ROW LEVEL SECURITY;
ALTER TABLE scheme_verification_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheme_verification_history   FORCE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs                FORCE ROW LEVEL SECURITY;
ALTER TABLE eligibility_checks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE eligibility_checks            FORCE ROW LEVEL SECURITY;
ALTER TABLE saved_schemes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_schemes                 FORCE ROW LEVEL SECURITY;
ALTER TABLE applications                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications                  FORCE ROW LEVEL SECURITY;
ALTER TABLE document_tasks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_tasks                FORCE ROW LEVEL SECURITY;
ALTER TABLE reminders                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders                     FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                    FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. Policies.
-- -----------------------------------------------------------------------------

-- users: own row; admin reads all. No insert policy (created by the backend).
DROP POLICY IF EXISTS users_select_own ON users;
CREATE POLICY users_select_own ON users
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS users_update_own ON users;
CREATE POLICY users_update_own ON users
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS users_admin_select ON users;
CREATE POLICY users_admin_select ON users
  FOR SELECT TO authenticated
  USING (is_admin());

-- role_assignments: admin only. No student access at all.
DROP POLICY IF EXISTS role_assignments_admin_all ON role_assignments;
CREATE POLICY role_assignments_admin_all ON role_assignments
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- student_profiles: owner only (FOR ALL = select/insert/update/delete).
-- Uses the users table directly rather than current_student_profile_ids(),
-- because that function reads student_profiles and would recurse under RLS.
-- DEFAULT DENY FOR ADMIN: no admin policy here. TBD: whether admin support
-- access to student rows is permitted; the PRD does not confirm it.
DROP POLICY IF EXISTS student_profiles_owner_all ON student_profiles;
CREATE POLICY student_profiles_owner_all ON student_profiles
  FOR ALL TO authenticated
  USING (user_id IN (SELECT u.id FROM users u WHERE u.auth_user_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT u.id FROM users u WHERE u.auth_user_id = auth.uid()));

-- Student-owned tables keyed by student_profile_id. No admin policy (deny by default).
DROP POLICY IF EXISTS saved_schemes_owner_all ON saved_schemes;
CREATE POLICY saved_schemes_owner_all ON saved_schemes
  FOR ALL TO authenticated
  USING (student_profile_id IN (SELECT current_student_profile_ids()))
  WITH CHECK (student_profile_id IN (SELECT current_student_profile_ids()));

DROP POLICY IF EXISTS eligibility_checks_owner_all ON eligibility_checks;
CREATE POLICY eligibility_checks_owner_all ON eligibility_checks
  FOR ALL TO authenticated
  USING (student_profile_id IN (SELECT current_student_profile_ids()))
  WITH CHECK (student_profile_id IN (SELECT current_student_profile_ids()));

DROP POLICY IF EXISTS applications_owner_all ON applications;
CREATE POLICY applications_owner_all ON applications
  FOR ALL TO authenticated
  USING (student_profile_id IN (SELECT current_student_profile_ids()))
  WITH CHECK (student_profile_id IN (SELECT current_student_profile_ids()));

DROP POLICY IF EXISTS reminders_owner_all ON reminders;
CREATE POLICY reminders_owner_all ON reminders
  FOR ALL TO authenticated
  USING (student_profile_id IN (SELECT current_student_profile_ids()))
  WITH CHECK (student_profile_id IN (SELECT current_student_profile_ids()));

-- document_tasks: reached through the owning application.
DROP POLICY IF EXISTS document_tasks_owner_all ON document_tasks;
CREATE POLICY document_tasks_owner_all ON document_tasks
  FOR ALL TO authenticated
  USING (application_id IN (
           SELECT a.id FROM applications a
           WHERE a.student_profile_id IN (SELECT current_student_profile_ids())))
  WITH CHECK (application_id IN (
           SELECT a.id FROM applications a
           WHERE a.student_profile_id IN (SELECT current_student_profile_ids())));

-- schemes: guests and students read published schemes; admin manages all.
DROP POLICY IF EXISTS schemes_public_read ON schemes;
CREATE POLICY schemes_public_read ON schemes
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS schemes_admin_all ON schemes;
CREATE POLICY schemes_admin_all ON schemes
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- scheme_versions: published rows public; admin manages all.
DROP POLICY IF EXISTS scheme_versions_public_read ON scheme_versions;
CREATE POLICY scheme_versions_public_read ON scheme_versions
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS scheme_versions_admin_all ON scheme_versions;
CREATE POLICY scheme_versions_admin_all ON scheme_versions
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- scheme_sources: readable when the scheme has a published version.
DROP POLICY IF EXISTS scheme_sources_public_read ON scheme_sources;
CREATE POLICY scheme_sources_public_read ON scheme_sources
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM scheme_versions v
    WHERE v.scheme_id = scheme_sources.scheme_id
      AND v.status = 'published'));

DROP POLICY IF EXISTS scheme_sources_admin_all ON scheme_sources;
CREATE POLICY scheme_sources_admin_all ON scheme_sources
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- source_documents: readable when the owning scheme has a published version.
DROP POLICY IF EXISTS source_documents_public_read ON source_documents;
CREATE POLICY source_documents_public_read ON source_documents
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1
    FROM scheme_sources s
    JOIN scheme_versions v ON v.scheme_id = s.scheme_id
    WHERE s.id = source_documents.scheme_source_id
      AND v.status = 'published'));

DROP POLICY IF EXISTS source_documents_admin_all ON source_documents;
CREATE POLICY source_documents_admin_all ON source_documents
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- scheme_rules: readable when the parent version is published.
DROP POLICY IF EXISTS scheme_rules_public_read ON scheme_rules;
CREATE POLICY scheme_rules_public_read ON scheme_rules
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM scheme_versions v
    WHERE v.id = scheme_rules.scheme_version_id
      AND v.status = 'published'));

DROP POLICY IF EXISTS scheme_rules_admin_all ON scheme_rules;
CREATE POLICY scheme_rules_admin_all ON scheme_rules
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- scheme_verification_history: readable when the parent version is published.
-- Append-only (trigger in 0004). Admin policy is FOR ALL for the read/insert path;
-- UPDATE/DELETE are blocked by the trigger and not granted to authenticated.
DROP POLICY IF EXISTS scheme_verification_history_public_read ON scheme_verification_history;
CREATE POLICY scheme_verification_history_public_read ON scheme_verification_history
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM scheme_versions v
    WHERE v.id = scheme_verification_history.scheme_version_id
      AND v.status = 'published'));

DROP POLICY IF EXISTS scheme_verification_history_admin_all ON scheme_verification_history;
CREATE POLICY scheme_verification_history_admin_all ON scheme_verification_history
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ingestion_jobs: admin only.
DROP POLICY IF EXISTS ingestion_jobs_admin_all ON ingestion_jobs;
CREATE POLICY ingestion_jobs_admin_all ON ingestion_jobs
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- audit_logs: admin read only. NO insert/update/delete policy for authenticated.
-- Rows are written by the backend's service role (BYPASSRLS), not by clients.
DROP POLICY IF EXISTS audit_logs_admin_select ON audit_logs;
CREATE POLICY audit_logs_admin_select ON audit_logs
  FOR SELECT TO authenticated
  USING (is_admin());

-- -----------------------------------------------------------------------------
-- 5. Grants. Minimal: RLS policies above gate the rows; grants gate the verbs.
-- Start from zero for anon and authenticated, then add back what is needed.
-- Tables created by later migrations are NOT covered by this revoke.
-- -----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON audit_logs FROM anon, authenticated;

-- Guest-readable catalogue (anon also needs these to read published data).
GRANT SELECT ON schemes, scheme_versions, scheme_sources, source_documents,
               scheme_rules, scheme_verification_history
  TO anon;

-- Authenticated: catalogue rows are gated by the policies above.
GRANT SELECT ON schemes, scheme_versions, scheme_sources, source_documents,
               scheme_rules, scheme_verification_history
  TO authenticated;

-- Authenticated: own user row (select/update); no insert or delete.
GRANT SELECT, UPDATE ON users TO authenticated;

-- Authenticated: owner-gated student tables and admin-gated tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON student_profiles, saved_schemes,
               eligibility_checks, applications, document_tasks, reminders
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON role_assignments, ingestion_jobs,
               schemes, scheme_versions, scheme_sources, source_documents,
               scheme_rules
  TO authenticated;

-- scheme_verification_history is append-only: no UPDATE or DELETE grant.
GRANT INSERT ON scheme_verification_history TO authenticated;

-- audit_logs: admin read only via policy; no insert/update/delete grant.
GRANT SELECT ON audit_logs TO authenticated;

-- Helper functions are callable by the roles that evaluate policies.
GRANT EXECUTE ON FUNCTION app_role(), is_admin(), current_student_profile_ids()
  TO anon, authenticated;
