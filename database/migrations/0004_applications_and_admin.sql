-- =============================================================================
-- 0004_applications_and_admin.sql
-- YOGYA database migration 4 of 5: saved schemes, self-reported applications,
-- reminders, audit log and append-only protections.
-- Run inside a transaction, after 0003.
--
-- Application tracking is SELF-REPORTED unless an authorised government
-- integration exists (none is specified in the PRD). Students apply through
-- official government portals.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- saved_schemes
-- A student's bookmarked schemes.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_schemes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id    uuid NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  scheme_id             uuid NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
  saved_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_schemes_profile_scheme_key UNIQUE (student_profile_id, scheme_id)
);

-- -----------------------------------------------------------------------------
-- applications
-- A student's self-reported progress on one scheme version.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS applications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id    uuid NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  scheme_version_id     uuid NOT NULL REFERENCES scheme_versions(id) ON DELETE RESTRICT,
  -- Self-reported status. Not verified against any government system.
  status                text NOT NULL DEFAULT 'not_started'
                        CHECK (status IN ('not_started', 'in_progress', 'submitted_on_portal',
                                          'reported_result', 'withdrawn')),
  -- User-entered tracking reference from the government portal. Self-reported;
  -- there is no government integration. Must not hold Aadhaar or other ID numbers.
  portal_reference      text,
  status_updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS applications_student_profile_id_idx
  ON applications (student_profile_id);
CREATE INDEX IF NOT EXISTS applications_scheme_version_id_idx
  ON applications (scheme_version_id);

DROP TRIGGER IF EXISTS applications_set_updated_at ON applications;
CREATE TRIGGER applications_set_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- document_tasks
-- Checklist items for an application. Does NOT store the document itself and
-- must not store any ID numbers.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  title             text NOT NULL,
  -- TBD: list of document kinds (not specified in the PRD).
  document_kind     text,
  is_done           boolean NOT NULL DEFAULT false,
  due_on            date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_tasks_application_id_idx
  ON document_tasks (application_id);

DROP TRIGGER IF EXISTS document_tasks_set_updated_at ON document_tasks;
CREATE TRIGGER document_tasks_set_updated_at
  BEFORE UPDATE ON document_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- reminders
-- Scheduled notifications for a student, optionally tied to an application.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id        uuid REFERENCES applications(id) ON DELETE CASCADE,
  student_profile_id    uuid NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  remind_at             timestamptz NOT NULL,
  message               text NOT NULL,
  delivery_state        text NOT NULL DEFAULT 'pending'
                        CHECK (delivery_state IN ('pending', 'sent', 'failed', 'cancelled')),
  -- TBD: notification channel (SMS, email, push, in-app). Not stated in the PRD.
  channel               text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Supports the dispatcher query for due, pending reminders.
CREATE INDEX IF NOT EXISTS reminders_pending_remind_at_idx
  ON reminders (remind_at)
  WHERE delivery_state = 'pending';

-- -----------------------------------------------------------------------------
-- audit_logs
-- Append-only record of significant actions. Written by the backend (service
-- role) only. Updates and deletes are blocked by the trigger below.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  action          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at);

CREATE OR REPLACE FUNCTION audit_logs_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_block_mutation_trg ON audit_logs;
CREATE TRIGGER audit_logs_block_mutation_trg
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();

-- TRUNCATE is not covered by a row-level trigger. Revoking TRUNCATE from
-- anon/authenticated is handled in 0005 (grants). TBD: whether a statement-level
-- BEFORE TRUNCATE trigger is also wanted.

-- -----------------------------------------------------------------------------
-- scheme_verification_history: append-only enforcement (see 0003).
-- Uses its own function so the error message names the right table.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION scheme_verification_history_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'scheme_verification_history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS scheme_verification_history_block_mutation_trg
  ON scheme_verification_history;
CREATE TRIGGER scheme_verification_history_block_mutation_trg
  BEFORE UPDATE OR DELETE ON scheme_verification_history
  FOR EACH ROW EXECUTE FUNCTION scheme_verification_history_block_mutation();
