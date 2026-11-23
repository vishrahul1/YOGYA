-- YOGYA draft scholarship catalogue seed for academic year 2026-27.
-- Source: user-supplied catalogue data. Apply after migrations 0001-0010.
--
-- SAFETY:
-- * Every scheme remains draft and every source remains unverified.
-- * No eligibility rules, benefit amounts, or deadlines are invented.
-- * Document names are checklist labels only; no Aadhaar or other ID number is stored.
-- * Existing non-draft records are never overwritten.
-- * Re-running this file is idempotent for schemes, workflow records, sources,
--   and required-document names.

BEGIN;

DO $$
DECLARE
  item jsonb;
  scheme_uuid uuid;
  scheme_state text;
  record_uuid uuid;
  document_source_uuid uuid;
  checklist_item text;
BEGIN
  FOR item IN
    SELECT value FROM jsonb_array_elements($catalogue$
    [
      {"slug":"ts-pms","name":"Telangana Post-Matric Scholarship (ePASS)","authority":"Government of Telangana ePASS","year":"2026-27","benefit":"Tuition reimbursement / maintenance support subject to rules","official":"https://telanganaepass.cgg.gov.in/Scholarships.do","portal":"https://telanganaepass.cgg.gov.in/epassonlinelinks.do","documents_url":"https://telanganaepass.cgg.gov.in/FreshRegistration202627.do","documents":"Student Aadhaar card;recent passport-size photograph;MeeSeva caste certificate;MeeSeva income certificate;bank passbook first page;study/bonafide certificates for last 7 years","conditional":"CET allotment order (CET courses);gap/residence certificate (if applicable);bank passbook not required for EBC students"},
      {"slug":"ts-pre","name":"Telangana Pre-Matric Scholarship","authority":"Government of Telangana ePASS","year":"2026-27","benefit":"School-level scholarship support as per category-specific rules","official":"https://telanganaepass.cgg.gov.in/","portal":"https://telanganaepass.cgg.gov.in/","documents_url":"https://telanganaepass.cgg.gov.in/downloads/SCDD-RTIManual.pdf","documents":"Aadhaar card;MeeSeva caste certificate;MeeSeva income certificate;study/bonafide certificate;bank passbook first-page copy;school application/covering letter","conditional":"Parent/guardian-linked bank arrangement for minors;additional category-specific evidence if requested"},
      {"slug":"ts-aovn","name":"Ambedkar Overseas Vidya Nidhi","authority":"Government of Telangana ePASS","year":"2026-27","benefit":"Overseas education grant subject to current guidelines","official":"https://telanganaepass.cgg.gov.in/OverseasLinks.do","portal":"https://telanganaepass.cgg.gov.in/AOVNPreRequisites.do","documents_url":"https://telanganaepass.cgg.gov.in/OverseasReg.do","documents":"Student photograph;Aadhaar;SSC certificate;transfer certificate;last course marksheet;bonafide certificate;income certificate;caste certificate;bank passbook;foreign university admission/I-20 letter;passport;residence/nativity certificate;GRE/GMAT and English-test scorecards","conditional":"Research guide acceptance letter (research scholars);gap certificate (if applicable);disability certificate (if applicable);visa/fee details as requested"},
      {"slug":"ts-mjp","name":"Mahatma Jyothiba Phule Overseas Vidya Nidhi","authority":"Government of Telangana ePASS","year":"2026-27","benefit":"Overseas education grant subject to current guidelines","official":"https://telanganaepass.cgg.gov.in/OverseasLinks.do","portal":"https://telanganaepass.cgg.gov.in/OverseasLinks.do","documents_url":"https://telanganaepass.cgg.gov.in/OverseasReg.do","documents":"Student photograph;Aadhaar;SSC certificate;transfer certificate;last course marksheet;bonafide certificate;income certificate;BC/EBC category proof as applicable;bank passbook;foreign admission letter;passport;residence/nativity certificate;qualifying and English-language scorecards","conditional":"Gap certificate;research guide letter;disability certificate, if applicable;EBC applicants may not need a caste certificate"},
      {"slug":"ts-cmos","name":"Chief Minister's Overseas Scholarship Scheme for Minorities","authority":"Government of Telangana ePASS","year":"2026-27","benefit":"Overseas education grant subject to current guidelines","official":"https://telanganaepass.cgg.gov.in/OverseasLinks.do","portal":"https://telanganaepass.cgg.gov.in/OverseasLinks.do","documents_url":"https://telanganaepass.cgg.gov.in/OverseasLinks.do","documents":"Aadhaar;passport;foreign university admission letter;graduation marksheets and degree;income proof;bank details;residence proof;student photograph","conditional":"Community/minority declaration or certificate as specified;qualifying test scores;visa;parent salary slips/tax documents if requested"},
      {"slug":"in-csss","name":"PM-USP Central Sector Scheme of Scholarship for College and University Students","authority":"Government of India - National Scholarship Portal","year":"2026-27","benefit":"Scholarship support per published annual guidelines","official":"https://scholarships.gov.in/All-Scholarships","portal":"https://scholarships.gov.in/All-Scholarships","documents_url":"https://scholarships.gov.in/All-Scholarships","documents":"Aadhaar/NSP OTR;Class 12 marksheet;current admission/enrolment proof;bank account details;family income certificate","conditional":"Category/disability certificate where claiming reservation;previous-year marksheet for renewal"},
      {"slug":"in-pragati","name":"AICTE Pragati Scholarship Scheme for Girl Students","authority":"AICTE / National Scholarship Portal","year":"2026-27","benefit":"Scholarship financial support subject to norms","official":"https://scholarships.gov.in/All-Scholarships","portal":"https://scholarships.gov.in/All-Scholarships","documents_url":"https://scholarships.gov.in/All-Scholarships","documents":"Aadhaar/NSP OTR;Class 10 and 12 or relevant qualifying marksheets;admission proof to eligible technical course;family income certificate;bank details","conditional":"Entrance/allotment letter;fee receipt;previous-year marksheet for renewal, if required"},
      {"slug":"in-saksham","name":"AICTE Saksham Scholarship Scheme","authority":"AICTE / National Scholarship Portal","year":"2026-27","benefit":"Scholarship financial support subject to norms","official":"https://scholarships.gov.in/All-Scholarships","portal":"https://scholarships.gov.in/All-Scholarships","documents_url":"https://scholarships.gov.in/All-Scholarships","documents":"Aadhaar/NSP OTR;valid disability certificate/UDID as applicable;qualifying marksheets;eligible technical course admission proof;income certificate;bank details","conditional":"Allotment letter;fee receipt;renewal marksheet if requested"},
      {"slug":"in-swanath","name":"AICTE Swanath Scholarship Scheme","authority":"AICTE / National Scholarship Portal","year":"2026-27","benefit":"Scholarship financial support subject to norms","official":"https://scholarships.gov.in/All-Scholarships","portal":"https://scholarships.gov.in/All-Scholarships","documents_url":"https://scholarships.gov.in/All-Scholarships","documents":"Aadhaar/NSP OTR;qualifying marksheets;eligible technical course admission proof;bank details;category-of-eligibility supporting document","conditional":"Orphan status evidence;parent COVID-19 death certificate(s);armed forces/paramilitary martyr certificate, depending on applicable category;income proof where requested"},
      {"slug":"in-nmmss","name":"National Means Cum Merit Scholarship Scheme","authority":"Government of India - National Scholarship Portal","year":"2026-27","benefit":"Merit-cum-means scholarship","official":"https://scholarships.gov.in/All-Scholarships","portal":"https://scholarships.gov.in/All-Scholarships","documents_url":"https://scholarships.gov.in/All-Scholarships","documents":"Aadhaar/NSP OTR;Class 7/8 academic records as applicable;state NMMSS selection/merit details;family income certificate;school enrolment proof;bank details","conditional":"Caste/category certificate if relevant;disability certificate if relevant;renewal marksheets"},
      {"slug":"in-yasasvi","name":"PM YASASVI Top Class Education in Colleges for OBC/EBC/DNT","authority":"Ministry of Social Justice and Empowerment","year":"2026-27","benefit":"Top-class college education scholarship","official":"https://socialjustice.gov.in/schemes/110","portal":"https://scholarships.gov.in/All-Scholarships","documents_url":"https://socialjustice.gov.in/schemes/101","documents":"Aadhaar/NSP OTR;OBC/EBC/DNT category certificate as applicable;family income certificate;qualifying marksheets;eligible institution admission proof;bank account details","conditional":"Fee receipt;hostel proof if claiming hostel benefits;renewal progress records"},
      {"slug":"in-sc-top","name":"Central Sector Scholarship of Top Class Education for SC Students","authority":"Ministry of Social Justice and Empowerment","year":"2026-27","benefit":"Education costs support within scheme rules","official":"https://socialjustice.gov.in/index.php/schemes","portal":"https://scholarships.gov.in/All-Scholarships","documents_url":"https://socialjustice.gov.in/schemes/27","documents":"Aadhaar/NSP OTR;SC caste certificate;family income certificate;eligible institution admission proof;qualifying marksheets;bank account details","conditional":"Fee structure/receipt;hostel certificate (if claiming);renewal course progress proof"},
      {"slug":"in-st-top","name":"National Fellowship and Scholarship for Higher Education of ST Students - Scholarship","authority":"Ministry of Tribal Affairs","year":"2026-27","benefit":"Higher education scholarship within scheme rules","official":"https://tribal.nic.in/Scholarship.aspx","portal":"https://scholarships.gov.in/All-Scholarships","documents_url":"https://scholarships.gov.in/All-Scholarships","documents":"Aadhaar/NSP OTR;ST community certificate;family income certificate;qualifying marksheets;eligible institute admission proof;bank account details","conditional":"Fee receipt;hostel certificate if applicable;renewal academic record"},
      {"slug":"in-pwd-pms","name":"Post-Matric Scholarship for Students with Disabilities","authority":"Government of India - National Scholarship Portal","year":"2026-27","benefit":"Fees and maintenance support under scheme rules","official":"https://scholarships.gov.in/All-Scholarships","portal":"https://scholarships.gov.in/All-Scholarships","documents_url":"https://scholarships.gov.in/All-Scholarships","documents":"Aadhaar/NSP OTR;disability certificate/UDID as applicable;family income certificate;previous qualifying marksheet;current enrolment certificate;bank details","conditional":"Fee receipt;hostel certificate;category certificate and renewal record when applicable"},
      {"slug":"in-ishan","name":"Ishan Uday Special Scholarship Scheme for NER","authority":"UGC / National Scholarship Portal","year":"2026-27","benefit":"Scholarship support per UGC/NSP rules","official":"https://scholarships.gov.in/All-Scholarships","portal":"https://scholarships.gov.in/All-Scholarships","documents_url":"https://scholarships.gov.in/All-Scholarships","documents":"Aadhaar/NSP OTR;Class 12 marksheet;first-year UG admission proof;North Eastern domicile/residence certificate;bank account details","conditional":"Income proof and relevant category documents if requested;continuation/renewal records"}
    ]$catalogue$::jsonb)
  LOOP
    INSERT INTO schemes
      (slug, name, issuing_body, status, benefit_summary, ingestion_source_type, updated_at)
    VALUES
      (item->>'slug', item->>'name', item->>'authority', 'draft', item->>'benefit', 'manual', now())
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO scheme_uuid;

    IF scheme_uuid IS NULL THEN
      SELECT id, status INTO scheme_uuid, scheme_state
        FROM schemes WHERE slug = item->>'slug';
      IF scheme_state <> 'draft' THEN
        scheme_uuid := NULL;
        scheme_state := NULL;
        CONTINUE;
      END IF;
      UPDATE schemes
         SET name = item->>'name',
             issuing_body = item->>'authority',
             benefit_summary = item->>'benefit',
             updated_at = now()
       WHERE id = scheme_uuid AND status = 'draft';
    END IF;

    SELECT id INTO record_uuid
      FROM scheme_versions
     WHERE scheme_id = scheme_uuid
     LIMIT 1;

    IF record_uuid IS NULL THEN
      INSERT INTO scheme_versions
        (scheme_id, version_number, academic_year, status, benefit_summary,
         ingestion_source_type, created_at, updated_at)
      VALUES
        (scheme_uuid, 1, item->>'year', 'draft', item->>'benefit', 'manual', now(), now())
      RETURNING id INTO record_uuid;
    ELSE
      UPDATE scheme_versions
         SET academic_year = item->>'year',
             benefit_summary = item->>'benefit',
             updated_at = now()
       WHERE id = record_uuid AND status = 'draft';
    END IF;

    INSERT INTO scheme_sources
      (scheme_id, official_url, issuing_authority, notes, retrieved_at)
    SELECT scheme_uuid, item->>'official', item->>'authority',
           'User-supplied draft source; detailed 2026-27 guideline verification required.', now()
    WHERE NOT EXISTS (
      SELECT 1 FROM scheme_sources
       WHERE scheme_id = scheme_uuid AND official_url = item->>'official'
    );

    INSERT INTO scheme_sources
      (scheme_id, official_url, issuing_authority, notes, retrieved_at)
    SELECT scheme_uuid, item->>'portal', item->>'authority',
           'Official application portal; students apply externally.', now()
    WHERE item->>'portal' <> item->>'official'
      AND NOT EXISTS (
        SELECT 1 FROM scheme_sources
         WHERE scheme_id = scheme_uuid AND official_url = item->>'portal'
      );

    SELECT id INTO document_source_uuid
      FROM scheme_sources
     WHERE scheme_id = scheme_uuid
       AND official_url = item->>'documents_url'
     LIMIT 1;

    IF document_source_uuid IS NULL THEN
      INSERT INTO scheme_sources
        (scheme_id, official_url, issuing_authority, notes, retrieved_at)
      VALUES
        (scheme_uuid, item->>'documents_url', item->>'authority',
         'Document-checklist source; verification is still required.', now())
      RETURNING id INTO document_source_uuid;
    END IF;

    FOR checklist_item IN
      SELECT trim(value)
        FROM unnest(string_to_array(item->>'documents', ';')) AS value
       WHERE trim(value) <> ''
    LOOP
      INSERT INTO scheme_required_documents
        (scheme_version_id, document_name, document_kind, is_mandatory, source_id)
      VALUES
        (record_uuid, checklist_item, 'other', true, document_source_uuid)
      ON CONFLICT (scheme_version_id, document_name) DO NOTHING;
    END LOOP;

    FOR checklist_item IN
      SELECT trim(value)
        FROM unnest(string_to_array(item->>'conditional', ';')) AS value
       WHERE trim(value) <> ''
    LOOP
      INSERT INTO scheme_required_documents
        (scheme_version_id, document_name, document_kind, is_mandatory, source_id)
      VALUES
        (record_uuid, checklist_item, 'other', false, document_source_uuid)
      ON CONFLICT (scheme_version_id, document_name) DO NOTHING;
    END LOOP;

    scheme_uuid := NULL;
    scheme_state := NULL;
    record_uuid := NULL;
    document_source_uuid := NULL;
  END LOOP;
END
$$;

COMMIT;

-- Verification summary: all seeded schemes must remain draft/unpublished.
SELECT s.slug, s.name, s.status, v.academic_year, v.status AS workflow_status,
       count(DISTINCT src.id) AS source_count,
       count(DISTINCT doc.id) AS document_count
  FROM schemes s
  JOIN scheme_versions v ON v.scheme_id = s.id
  LEFT JOIN scheme_sources src ON src.scheme_id = s.id
  LEFT JOIN scheme_required_documents doc ON doc.scheme_version_id = v.id
 WHERE s.slug IN (
   'ts-pms','ts-pre','ts-aovn','ts-mjp','ts-cmos','in-csss','in-pragati',
   'in-saksham','in-swanath','in-nmmss','in-yasasvi','in-sc-top','in-st-top',
   'in-pwd-pms','in-ishan'
 )
 GROUP BY s.slug, s.name, s.status, v.academic_year, v.status
 ORDER BY s.slug;
