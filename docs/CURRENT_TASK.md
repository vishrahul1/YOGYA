# Current Task

Phase: Step 2 — architecture and database foundation

## Done (files written, NOT executed)

- database/migrations/0001_extensions_and_enums.sql
- database/migrations/0002_core_tables.sql
- database/migrations/0003_eligibility_tables.sql
- database/migrations/0004_applications_and_admin.sql
- database/migrations/0005_row_level_security.sql (16 tables incl. role_assignments and scheme_verification_history; RLS on all tables; append-only audit_logs trigger)
- packages/rules/schema/eligibility-rule.schema.json (parses as JSON)
- docs/features/eligibility-rule-format.md (spec)
- services/api/requirements.txt
- services/api/.env.example
- services/api/app/config.py, db.py, auth.py (no JWT verification yet), errors.py, main.py
- services/api/app/schemas/*.py (Pydantic contracts, no business logic)

## Not done

- Task 4 remaining: migration runner and database tests.
- Migrations not applied (no local PostgreSQL on this machine).
- Supabase auth schema shim in 0005 is untested.
- docs/features/database-schema.md not written yet.
- docs/ARCHITECTURE.md update (Step 2 additions pending at time of writing; see its "Step 2 additions" section).

## Blocked / needs input

- Local PostgreSQL needed to validate migrations.
- Decisions in docs/DECISIONS.md pending list.

## Next recommended task

Install PostgreSQL locally, apply migrations to scratch database `yogya_test`, then write the migration runner and tests.

## Status update — Milestone A backend (recorded)

DONE (tests passing, 185 passed, 1 xfailed in full backend suite):
- Admin scheme create, list, detail, PATCH (services/api/app/routers/admin_schemes.py); PATCH writes audit_logs.
- Admin verification workflow (services/api/app/routers/admin_verification.py): version create, source add, source verify, submit-review, approve, reject, publish (retires prior published version), history. Verifier from admin context. Tests in tests/test_admin_verification.py.
- Eligibility engine adds neq and is_set; adapter maps them (tests/test_eligibility_engine.py).
- POST /api/eligibility/evaluate: stored invalid rule -> 500 "Stored eligibility rule is invalid" (TypeError branch); extra body keys -> 422.
- AI routes: POST /api/ai/profile/extract, /api/ai/follow-ups, /api/ai/explanations (services/api/app/routers/ai.py); tests in tests/test_ai_routes.py (17 passing). Explanations use server-computed engine outcome.
- Public catalogue, pagination, unpublished 404 checks: tests/test_milestone_a_gaps.py.

NOT DONE:
- Migration 0007_scheme_ingestion.sql: presence in target DB NOT verified. Manual check: select to_regclass('public.scheme_required_documents'); if null, apply 0007 manually.
- Migration 0008_source_verification.sql (adds verified_at, verified_by to scheme_sources): created, NOT applied. Apply manually after 0007.
- Known open defect (xfail, tests/test_milestone_a_gaps.py): eligibility overall_outcome returns PASS/FAIL/UNKNOWN, but the spec vocabulary is LIKELY_ELIGIBLE, NEED_MORE_INFORMATION, NOT_ELIGIBLE, UNVERIFIED. Decision pending.
- Import-url for candidate schemes: not built.
- Frontend (Milestone B, apps/web): not started; apps/web contains only README.md.
- Secrets: services/api/.env is git-ignored and has no commits in history (verified via git log). Its contents were not read. Credentials it contains should still be rotated, since the earlier survey flagged them.
- Migration 0007 status unverified.

Milestone B status: not started.
Milestone C status: not started.

## Step 3 — Final verification status (recorded)
- Status: NOT complete. Step 4 must not start until the blockers below are cleared.
- 403 contract: the global handler in services/api/app/errors.py returns {"error": {"code","message","details","request_id"}}. The test test_admin_token_on_admin_student_profile_returns_403_with_detail was changed to assert error.code == "http_403" and error.message. Handler unchanged.
- Backend tests last run: 27 passed, 0 failed, using services/api/.venv, which was created by another project's interpreter (worksheet generator). Not a clean YOGYA environment; rebuild before relying on it.
- Git: .gitignore and services/api/.env.example are new and untracked. services/api/.env and services/api/.venv are no longer staged. Two services/api/tests/__pycache__/*.pyc files are STILL staged. Remove with: git reset -q -- services/api/tests/__pycache__
- Credential exposure: services/api/.env holds a real-looking Supabase DATABASE_URL with a password (line 1), and the same password appears again on a bare line (line 7). Rotate the Supabase database password and remove line 7. Values were not recorded here.
- services/api/.env.example created with placeholder values only.
- Database review (partial): signup default-to-student trigger in migration 0006; role_assignments has a CHECK limiting role to student/admin; RLS is FORCEd on 16 tables; owner-scoped policies confirmed for student_profiles, saved_schemes, applications; other tables UNKNOWN. Admin has SELECT on users (exposes emails, MEDIUM). Admin RLS reads use the JWT claim, which can be stale until token expiry after revoke. Unverified: whether the DATABASE_URL role bypasses RLS (BYPASSRLS); if not, the role lookup could return no rows.
- grant_admin.py: operator-only CLI, no audit_logs insert, no dry-run or confirm guard for grant.
- Web authentication UI: apps/web contains only a README ("planned, not yet built"). Login, signup, password reset, logout, dashboards and guest pages are all MISSING. Step 3 Phase E/F is not implemented.
- Regression tests not yet added for: admin provisioning (grant_admin.py), signup default role (migration 0006), and 403 body shape on the other 403 tests.

## Status update — Milestone B7 + B8 frontend (recorded; NOT test-verified)
WRITTEN (no shell; lint_file did not run because esbuild is unavailable; no typecheck, tests or build):
- B7 student tracking: app/saved, app/applications (with reminders section), app/checklists; components/tracking/*; Save button on app/scholarships/[id]; student-only nav links in components/layout/AppShell.tsx. Response types appended to lib/api/types.ts.
- B8 admin: app/admin (overview), app/admin/schemes/new (create + import-from-URL, marked unverified), app/admin/schemes/[id] (detail, edit name/issuing body, version actions gated by status, history, publish confirmation with public-catalogue check); components/admin/*; admin types in lib/api/adminTypes.ts.
Backend gaps the UI works around:
- No route lists a scheme's versions or sources, or reads one version. Admin sees only versions created or entered by ID in the current visit.
- DELETE /api/student/saved-schemes/{id} returns 204; the shared apiRequest cannot parse it, so components/tracking/trackingApi.ts has a local delete helper. client.ts was not changed.
- Saved items carry scheme_id only; their catalogue link is resolved from the first 100 published schemes.
Not done (needs a shell): B9 — typecheck, lint, frontend tests, build. Not started: a UI to create a student application (the POST route exists).

