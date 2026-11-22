-- =============================================================================
-- 0001_extensions_and_enums.sql
-- YOGYA database migration 1 of 5.
-- Run inside a transaction, in order: 0001 -> 0005.
--
-- Conventions used by all YOGYA migrations:
--   * Enum-like values are enforced with text CHECK constraints, NOT Postgres
--     ENUM types (easier to extend without locking migrations).
--   * Primary keys are uuid, generated with gen_random_uuid() (pgcrypto).
--   * No Aadhaar numbers, bank account details or government certificate
--     identifiers are stored anywhere in this schema.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- provides gen_random_uuid()
