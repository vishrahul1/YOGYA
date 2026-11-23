# Current Task

## Status update - Vercel Next.js output

- Removed the custom Next.js `distDir` after Vercel still failed to discover the conditional output. All builds now use the standard `.next` directory expected by the Vercel Next.js builder. Do not run a local production build alongside the development server because both use `.next`.

## Status update - Guest header navigation

- Replaced the public/guest desktop sidebar with a responsive top header containing Home, Scholarships, and Login.
- Preserved the authenticated Student and Admin workspace sidebars and the compact mobile menu.
- Fixed the initial-login transition so the login page follows the shared resolved session and role instead of making a competing role request that could leave the form visible beside the authenticated sidebar.
- Prevented tab-focus auth events from reloading the shell or repeating `/api/me`; successful login now also leaves `/login` immediately while role guards preserve the correct Student/Admin destination.
- Standardized the student scholarship page heading, highlighted the sidebar logout action, and made the full assistant workspace fill the viewport with an independently scrolling conversation area.
- Added a five-second timeout to backend PostgreSQL connections so authenticated API requests fail promptly when the Supabase pooler is unreachable instead of remaining pending indefinitely.
- Simplified the admin dashboard header, placed Add scholarship on the right, kept status cards before a draft-first scheme list, made scheme rows fully clickable, and aligned Back actions to the right of admin page headings.
- Reduced the admin-facing scheme lifecycle to two visible phases (Draft and Published) while retaining required internal verification checks, removed the redundant Open label from clickable scheme cards, and added a clear two-step workflow UI to the scheme workspace.
- Redesigned the admin scheme workspace with a compact header, clearer action hierarchy, collapsed required-content panels, and modal dialogs for metadata editing, academic-year creation, and verification history.
- Replaced the boxed admin scheme workspace with a flat editorial layout using whitespace, dividers, a linear two-step progress treatment, and restrained action emphasis.
- Removed multi-version scheme creation from the frontend and backend. Scholarship creation now creates its single internal workflow record transactionally, the admin workspace reads one record, and migration 0010 enforces one record per scheme.
- Removed Add scholarship from the Admin sidebar so creation starts from the dashboard, and refined the creation page with a compact flat header, clearer required fields, and a two-phase publishing explanation.
- Added an idempotent 2026-27 catalogue seed for the 15 user-supplied schemes. It creates draft-only single-record scholarships, unverified official sources, and document checklists; it deliberately creates no eligibility rules, deadlines, or published records.
- Added a guarded, atomic publication seed for the same 15 schemes after the user confirmed verification. It requires an explicit verifying Admin email, records verification/publication timestamps, updates sources and workflow state, and writes history plus audit entries.
- Fixed the public scholarship catalogue remaining empty after publication by disabling stale Next.js fetch caching in the shared API client. The live API and rendered `/scholarships` page now both return the published catalogue.
- Added a branded YOGYA browser-tab icon and root metadata so the application no longer displays the generic tab icon.

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

## Status update - Home and scholarship UI refresh

CORS update: local development accepts loopback `localhost`/`127.0.0.1` origins on changing ports, while production remains limited to explicit origins. All 8 CORS tests pass and the live port-3001 `/api/me` preflight returns 200.

DONE:
- Replaced the split admin candidate/name-first UI with one streamlined scholarship form. Only four required fields are initially visible; dates/benefits, documents, eligibility, advanced settings, and publishing guidance use collapsible sections. One save action creates the scheme, first academic-year version, official source, dates, benefits, documents, and deterministic source-backed eligibility criteria, then opens the verification workspace.
- Polished the admin creation hierarchy with a clear two-step workflow label, required-first layout, progressive disclosure, concise guidance, and a focused save path. Added an audited scholarship danger zone with exact-name confirmation; the API permits permanent deletion only when every version remains a draft and no student application or eligibility activity exists.
- Simplified the admin verification workspace with a four-stage progress indicator, prominent status and next-action guidance, collapsible scholarship content, nested document/rule sections, a focused official-source area, hidden secondary edit/version controls, and on-demand history. Frontend typecheck, lint, tests, and production build pass.
- Rebuilt the initial home page with a responsive hero, calls to action, a three-step explanation, and official-portal guidance.
- Reworked the scholarship catalogue header, search experience, results summary, responsive grid, pagination, and scholarship cards.
- Reworked scholarship details to show benefit information, overview fields, required documents, eligibility/save actions, and the official source in a responsive two-column layout.
- Updated the save action to fill its action panel consistently.
- Frontend verification: typecheck passed, lint passed, 2 tests passed, and the production build passed after clearing the generated `.next` cache.
- Fixed authenticated navigation so guest links are replaced, not appended, after login; added role-specific destinations, active-page states, and session-aware home actions.
- Updated the eligibility assistant for natural-language text, optional missing-detail follow-ups, a continue-with-available-details path, and English/Telugu browser voice input.
- Converted assistant review and follow-ups to one-field-at-a-time chat steps with quick-choice buttons where applicable; removed the duplicate follow-up API request by reusing questions returned by profile extraction.
- Fixed intermittent unstyled pages by separating Next.js development output (`.next`) from production build output (`.next-build`), preventing builds from invalidating a running dev server's CSS and JavaScript chunks.
- Redesigned the assistant as a ChatGPT-style conversation workspace with aligned message bubbles, inline review/follow-up controls, automatic scrolling, a sticky composer, language selection, voice input, and contextual result actions.
- Added authenticated `POST /api/ai/chat`: one guarded AI call now returns a grounded conversational answer plus extracted profile details, using recent history, existing profile data, and verified published-scheme context. Unknown facts are explicitly unavailable, sensitive input is redacted, and eligibility remains deterministic.
- Added account-scoped assistant conversation history in browser storage. Active chats save automatically and appear in a right-side history drawer, with reopen and delete actions. Scholarship browsing shows the first six published schemes inside the chat and keeps navigation for individual details or the full catalogue.
- Reworked the shared authenticated layout: the student navigation now uses the name Assistant; a functional bottom-right assistant widget is available across student pages except `/assistant`; the dashboard assistant card was removed; the full assistant uses the available width with history in a right slide-over; and shared/page gutters were reduced so primary pages fill the workspace.
- Prevented indefinite page loading by bounding initial Supabase session resolution to 10 seconds and API requests to 15 seconds. Removed duplicate stale development servers and verified the current frontend on port 3000 with the API healthy on port 8000.
- Refined admin operations for the manual-first workflow: added dashboard lifecycle guidance, status counts, filtering/search, clearer manual and official-URL candidate entry, an automation-ready notice, persistent version/source list APIs, and automatic workspace loading across refreshes. Added an audited operator SQL script plus instructions for promoting an existing Supabase Auth user to the single Admin role. Automation remains future work and must enter the same unverified review workflow.
- Completed the draft version content editor: admins can manage application start/end dates, official deadline wording, benefit summaries, required documents, and source-backed deterministic eligibility criteria before review. Added guarded content/document/rule APIs and applied migration 0009 for ordered application dates. Content becomes read-only after the version leaves draft status.
Not done (needs a shell): B9 — typecheck, lint, frontend tests, build. Not started: a UI to create a student application (the POST route exists).

