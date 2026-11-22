# YOGYA — Project Context

## Purpose
YOGYA is an AI-powered government scholarship discovery and application assistance platform for low-income students in Telangana, India (PRD 1, 2).
Students describe their circumstances in Telugu or English. The system:
- matches them with verified scholarship rules,
- explains likely eligibility,
- gives document checklists,
- tracks applications.

## Target users
- Low-income students in Telangana, India (PRD 2, 5). Students may use Telugu or English (PRD 6).
- Admins who ingest, verify, and publish scheme data (PRD 7, 8).
- Guests who can discover schemes without signing in (PRD 5).

## Roles and access
- Exactly two authenticated roles: **Student** and **Admin** (PRD 5).
- Guest access allows discovery only. Guest is not a third role.

## Business rules
- Eligibility uses verified, deterministic rules. Each rule outcome is PASS, FAIL, or UNKNOWN (PRD 10).
- AI never invents requirements, benefits, or deadlines.
- AI is limited to profile extraction, follow-up questions, and explanations (PRD 10).
- Every published scheme references official government information and its verification date (PRD 8, 9).
- Aadhaar and other sensitive ID numbers are not collected (PRD 16).
- Application tracking is self-reported unless an authorised government integration exists.
- Students apply through official government portals.

## Platforms and stack (PRD 13)
- Web: Next.js, TypeScript, Tailwind CSS.
- Mobile: React Native, Expo, TypeScript.
- Backend: Python FastAPI.
- Database: PostgreSQL on Supabase.
- Auth: Supabase Auth.
- AI: provider abstraction supporting OpenAI or Gemini (provider choice TBD).

## Source of truth
The PRD, `YOGYA_Complete_PRD.docx` in the project root, is the source of truth. It has 20 sections plus an Appendix of official research sources. Read only the section you need. Anything not in the PRD is TBD.
