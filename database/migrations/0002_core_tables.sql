-- =============================================================================
-- 0002_core_tables.sql
-- YOGYA database migration 2 of 5: identity, profile and scheme catalogue.
-- Run inside a transaction, after 0001.
--
-- PERSONAL DATA: users.email (TBD whether stored) and student_profiles
-- (personal attributes) hold personal data. Flagged for privacy review.
-- No sensitive ID numbers (Aadhaar etc.) in any column.
-- =============================================================================

-- Generic updated_at maintenance. Attached per table below.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- users
-- One row per authenticated person. Credentials are owned by Supabase Auth.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Supabase auth.users.id. Deliberately NO foreign key: auth.users lives in the
  -- Supabase-managed auth schema, which this migration does not own.
  auth_user_id    uuid NOT NULL UNIQUE,
  -- PERSONAL DATA. TBD: whether email is stored here at all; Supabase Auth owns
  -- the email/credential. Passwords are NEVER stored in this table.
  email           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- role_assignments
-- Maps a user to one of exactly two roles: 'student' or 'admin'.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('student', 'admin')),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT role_assignments_user_role_key UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS role_assignments_user_id_idx
  ON role_assignments (user_id);

-- -----------------------------------------------------------------------------
-- student_profiles
-- Student's profile. PERSONAL DATA.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  -- PERSONAL DATA. Keys come from the profile attribute registry (TBD, not yet
  -- defined). No ID numbers are permitted as keys or values.
  attributes          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- TBD: supported UI languages beyond en/te are not specified in the PRD.
  preferred_language  text CHECK (preferred_language IN ('en', 'te')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS student_profiles_set_updated_at ON student_profiles;
CREATE TRIGGER student_profiles_set_updated_at
  BEFORE UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- schemes
-- A government scholarship scheme. Publication state lives on scheme_versions;
-- schemes.status mirrors the lifecycle of the catalogue entry.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schemes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  name            text NOT NULL,
  issuing_body    text,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'in_review', 'verified', 'published', 'retired')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schemes_status_idx ON schemes (status);

DROP TRIGGER IF EXISTS schemes_set_updated_at ON schemes;
CREATE TRIGGER schemes_set_updated_at
  BEFORE UPDATE ON schemes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- scheme_sources
-- Official government reference for a scheme. Created before scheme_versions
-- so that scheme_versions.source_id can reference it.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheme_sources (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id         uuid NOT NULL REFERENCES schemes(id) ON DELETE RESTRICT,
  official_url      text NOT NULL CHECK (official_url ~ '^https://'),
  issuing_authority text NOT NULL,
  retrieved_at      timestamptz,
  notes             text
);

CREATE INDEX IF NOT EXISTS scheme_sources_scheme_id_idx ON scheme_sources (scheme_id);

-- -----------------------------------------------------------------------------
-- scheme_versions
-- A scheme's rules and dates for one academic year. Only one version per scheme
-- may be published at a time (partial unique index below).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheme_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id       uuid NOT NULL REFERENCES schemes(id) ON DELETE RESTRICT,
  version_number  int NOT NULL CHECK (version_number >= 1),
  academic_year   text NOT NULL CHECK (academic_year ~ '^[0-9]{4}-[0-9]{2}$'),
  status          text NOT NULL
                  CHECK (status IN ('draft', 'in_review', 'verified', 'published', 'retired')),
  verified_at     timestamptz,
  verified_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  published_at    timestamptz,
  source_id       uuid REFERENCES scheme_sources(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheme_versions_scheme_version_key UNIQUE (scheme_id, version_number),
  -- A published version must carry verification evidence (verified_at and
  -- verified_by), an official source (source_id) and a publication timestamp.
  -- DEVIATION: the spec repeated verified_at twice; verified_by is used for the
  -- second check so that the verifier is recorded.
  CONSTRAINT scheme_versions_published_requires_evidence CHECK (
    status <> 'published'
    OR (verified_at IS NOT NULL
        AND verified_by IS NOT NULL
        AND source_id IS NOT NULL
        AND published_at IS NOT NULL)
  )
);

-- At most one published version per scheme.
CREATE UNIQUE INDEX IF NOT EXISTS scheme_versions_one_published_idx
  ON scheme_versions (scheme_id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS scheme_versions_scheme_id_idx ON scheme_versions (scheme_id);
CREATE INDEX IF NOT EXISTS scheme_versions_status_idx ON scheme_versions (status);

DROP TRIGGER IF EXISTS scheme_versions_set_updated_at ON scheme_versions;
CREATE TRIGGER scheme_versions_set_updated_at
  BEFORE UPDATE ON scheme_versions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- source_documents
-- Captured copies/metadata of official source pages or documents.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS source_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_source_id  uuid NOT NULL REFERENCES scheme_sources(id) ON DELETE RESTRICT,
  -- TBD: storage location for captured documents (not specified in the PRD).
  storage_path      text,
  sha256            text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  -- TBD: list of document kinds (not specified in the PRD).
  document_kind    text,
  captured_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_documents_scheme_source_id_idx
  ON source_documents (scheme_source_id);
