-- =============================================================================
-- 0008_source_verification.sql
-- YOGYA database migration 8: source verification columns on scheme_sources.
--
-- MANUAL APPLY REQUIRED: this file is NOT applied automatically. It must be run
-- by hand (inside a transaction) against the target database before the admin
-- source-verification routes (app/routers/admin_verification.py) are used.
--
-- Why: the admin verification workflow must record which admin verified a source
-- and when. scheme_sources (0002) has no verification evidence columns, and the
-- publish rule (scheme_versions_published_requires_evidence) depends on a
-- verified source being traceable. This migration adds only those two columns.
--
-- Depends on: 0002 (scheme_sources), 0001/0002 (users).
-- Forward-only and additive. Do NOT edit after it has been applied.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS.
-- =============================================================================

ALTER TABLE scheme_sources
    ADD COLUMN IF NOT EXISTS verified_at timestamptz NULL;

ALTER TABLE scheme_sources
    ADD COLUMN IF NOT EXISTS verified_by uuid NULL REFERENCES users(id) ON DELETE SET NULL;
