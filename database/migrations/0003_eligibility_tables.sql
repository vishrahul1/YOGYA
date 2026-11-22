-- =============================================================================
-- 0003_eligibility_tables.sql
-- YOGYA database migration 3 of 5: eligibility rules, verification history,
-- ingestion jobs and eligibility check results.
-- Run inside a transaction, after 0002.
--
-- Eligibility is deterministic. Per-rule outcomes are PASS, FAIL or UNKNOWN.
-- AI never writes rules, benefits or deadlines into these tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- scheme_rules
-- Structured, versioned eligibility rules attached to one scheme version.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheme_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_version_id   uuid NOT NULL REFERENCES scheme_versions(id) ON DELETE CASCADE,
  -- Versioned group/criterion tree. The shape is defined by
  -- packages/rules/schema/eligibility-rule.schema.json. TBD: whether any
  -- DB-side JSON shape check is added (currently validated application-side).
  rule_json           jsonb NOT NULL,
  rule_format_version int NOT NULL DEFAULT 1,
  academic_year       text NOT NULL CHECK (academic_year ~ '^[0-9]{4}-[0-9]{2}$'),
  source_id           uuid NOT NULL REFERENCES scheme_sources(id) ON DELETE RESTRICT,
  sort_order          int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheme_rules_scheme_version_id_idx
  ON scheme_rules (scheme_version_id);

DROP TRIGGER IF EXISTS scheme_rules_set_updated_at ON scheme_rules;
CREATE TRIGGER scheme_rules_set_updated_at
  BEFORE UPDATE ON scheme_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- scheme_verification_history
-- Log of review/verification/publication actions on a scheme version.
-- APPEND-ONLY: update and delete are blocked by a trigger added in 0004.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheme_verification_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_version_id   uuid NOT NULL REFERENCES scheme_versions(id) ON DELETE CASCADE,
  action              text NOT NULL
                      CHECK (action IN ('submitted_for_review', 'verified', 'rejected',
                                        'published', 'retired')),
  actor_user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  note                text,
  recorded_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheme_verification_history_scheme_version_id_idx
  ON scheme_verification_history (scheme_version_id);

-- -----------------------------------------------------------------------------
-- ingestion_jobs
-- Admin-run jobs that fetch or capture official source material.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_source_id  uuid REFERENCES scheme_sources(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  started_at        timestamptz,
  finished_at       timestamptz,
  requested_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  error_summary     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingestion_jobs_status_idx ON ingestion_jobs (status);

-- -----------------------------------------------------------------------------
-- eligibility_checks
-- Stored result of one deterministic evaluation of a student profile against a
-- scheme version. PERSONAL DATA (profile_snapshot is a copy of profile data).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eligibility_checks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id    uuid NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  scheme_version_id     uuid NOT NULL REFERENCES scheme_versions(id) ON DELETE RESTRICT,
  outcome_summary       text CHECK (outcome_summary IN ('PASS', 'FAIL', 'UNKNOWN')),
  -- Array of per-rule results, each PASS, FAIL or UNKNOWN.
  per_rule_results      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- PERSONAL DATA copy of the profile at evaluation time.
  -- TBD: retention period for profile_snapshot (not specified in the PRD).
  profile_snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at          timestamptz NOT NULL DEFAULT now(),
  rule_format_version   int NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS eligibility_checks_student_profile_id_idx
  ON eligibility_checks (student_profile_id);
CREATE INDEX IF NOT EXISTS eligibility_checks_scheme_version_id_idx
  ON eligibility_checks (scheme_version_id);
