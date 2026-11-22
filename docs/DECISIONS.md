# Decisions

## Confirmed decisions

- Web app: Next.js + TypeScript + Tailwind CSS — Confirmed (PRD 13)
- Mobile app: React Native + Expo + TypeScript — Confirmed (PRD 13)
- Backend: FastAPI (Python) — Confirmed (PRD 13)
- Database: PostgreSQL on Supabase with Supabase Auth — Confirmed (PRD 13/14)
- Roles: two authenticated roles (Student, Admin) plus guest discovery — Confirmed (PRD 5)
- Rule outcomes: PASS / FAIL / UNKNOWN per rule — Confirmed (PRD 10)
- IDs and security: UUID IDs and PostgreSQL row-level policies — Confirmed (PRD 14)
- AI scope: limited to extraction, follow-up and explanation — Confirmed (PRD 10)
- Identity data: no Aadhaar collection — Confirmed (PRD 16)
- Application tracking: self-reported unless an authorised integration exists — Confirmed (PRD 6/4)
- Application route: students apply via official portals — Confirmed (PRD 6)

## Pending decisions

- **AI provider**
  - Question: Which AI provider(s) to use?
  - Options: OpenAI; Gemini; both behind an abstraction
  - Blocks: AI Assistance (PRD 10), Eligibility Engine explanations (PRD 10)
  - Status: Pending

- **Database schema: column types, constraints, migration tool**
  - Question: What column types, constraints and migration tool define the schema?
  - Options: to be chosen (e.g. Supabase CLI migrations vs. another tool)
  - Blocks: packages/rules schema, all data-backed features (PRD 14)
  - Status: Pending

- **Scheme data sources and ingestion method**
  - Question: Where does scheme data come from and how is it ingested?
  - Options: manual entry; extraction; PDF processing; authorised API (PRD 8)
  - Blocks: Scholarship Discovery, Admin Scheme Management (PRD 8)
  - Status: Pending

- **Hosting and deployment** (web, mobile, API)
  - Question: Where and how is each platform hosted and deployed?
  - Options: to be chosen
  - Blocks: any deployment work (PRD 13)
  - Status: Pending

- **Reminder notification channels**
  - Question: Through which channels are reminders delivered? (reminders table has delivery_state; channel not stated)
  - Options: to be chosen
  - Blocks: reminder delivery (PRD 14)
  - Status: Pending

- **Telugu scope for document OCR/extraction and voice input**
  - Question: How much Telugu support is required for document OCR/extraction and voice input? (voice is optional per PRD)
  - Options: to be chosen
  - Blocks: document extraction (PRD 11), voice input (PRD 6)
  - Status: Pending

- **Rule representation format in packages/rules**
  - Question: What format represents scholarship rules?
  - Options: to be chosen
  - Blocks: packages/rules implementation, Eligibility Engine (PRD 10)
  - Status: Pending

- **Exact definition of the ten validation layers**
  - Question: What exactly does each of the ten validation layers check? (read PRD 9 before finalising)
  - Options: to be defined from PRD 9
  - Blocks: Eligibility Engine (PRD 9, 10)
  - Status: Pending

- **Monorepo tooling**
  - Question: Which package manager and workspace tool manage the monorepo?
  - Options: to be chosen
  - Blocks: project scaffolding across apps/ and packages/ (PRD 13)
  - Status: Pending

## Decision record — Step 3 verification
- Error contract: keep the project envelope {"error": {...}}; the test was aligned to it rather than changing the global handler, since the handler applies to all endpoints.
- Git: .gitignore excludes .env, .env.*, .venv/, __pycache__/, *.pyc. Real credential files are not committed; the repo has no commits yet.
- Secrets: credential values are never recorded in docs. Rotation is a manual, user-authorised action.
- Environment: the YOGYA backend should use its own interpreter. Recreate services/api/.venv from requirements.txt before the next test run.
- Admin provisioning should gain an audit record and a dry-run option (TBD, not implemented).

