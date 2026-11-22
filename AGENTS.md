# AGENTS.md — YOGYA working rules

## Project overview
YOGYA is an AI-powered government scholarship discovery and application assistance platform for low-income students in Telangana, India. Students describe their circumstances in Telugu or English; the system matches them with verified scholarship rules, explains likely eligibility, gives document checklists, and tracks applications.
Source of truth for product facts: `YOGYA_Complete_PRD.docx` (project root). Cite PRD section numbers in docs.

## Business rules (non-negotiable)
- Eligibility is decided by verified, deterministic rules. Each rule outcome is PASS, FAIL, or UNKNOWN.
- AI never invents requirements, benefits, or deadlines.
- AI is used only for profile extraction, follow-up questions, and explanations.
- Every published scheme references official government information and its verification date.
- Do not collect Aadhaar or other sensitive ID numbers.
- Application tracking is self-reported unless an authorised government integration exists.
- Students apply through official government portals.
- Exactly two authenticated roles: Student and Admin. Guest discovery is not a third role.

## Token rules
- Read only the docs relevant to the current task.
- Do not reload the full PRD. Open only the needed section of `YOGYA_Complete_PRD.docx`.
- Do not rewrite unrelated files.
- Work in small, testable tasks.
- Reuse existing code and docs before creating new ones.
- Update `docs/CURRENT_TASK.md` after each approved task.
- Anything not stated in the PRD is marked TBD, never invented.

## Planned monorepo layout (proposed)
```
apps/web            Next.js + TypeScript + Tailwind
apps/mobile         React Native + Expo + TypeScript
services/api        Python FastAPI backend
packages/shared     Shared TypeScript types and utilities
packages/rules      Deterministic eligibility rules engine
database/migrations PostgreSQL (Supabase) schema migrations
database/seeds      Seed data
docs/features       Feature docs
docs/prd            PRD-derived reference material
```

## Documentation pointers
- `docs/PROJECT_CONTEXT.md` — purpose, users, roles, business rules, platforms
- `docs/ARCHITECTURE.md` — proposed architecture and TBD items
- `docs/DECISIONS.md` — decision log
- `docs/CURRENT_TASK.md` — the active task and its status

## Working agreement
- Read a file before editing it.
- Edit only the files the current task names.
- Lint or test each change where tooling exists.
- Record open questions as TBD in the relevant doc rather than guessing.
