-- Publish the 15 verified 2026-27 catalogue schemes.
--
-- BEFORE RUNNING:
-- 1. Replace REPLACE_WITH_ADMIN_EMAIL with the exact verified YOGYA Admin email.
-- 2. Run only after reviewing the official sources and document checklists.
-- 3. This script records the execution time as verified_at and published_at.
--
-- The script is atomic: any missing scheme, missing source, missing Admin, or
-- unexpected workflow state rolls back the entire publication batch.

BEGIN;

DO $$
DECLARE
  verifying_admin_email text := lower(trim('REPLACE_WITH_ADMIN_EMAIL'));
  verifying_admin_id uuid;
  verified_on timestamptz := now();
  expected_count integer := 15;
  actual_count integer;
  item record;
  evidence_source_id uuid;
BEGIN
  IF verifying_admin_email = 'replace_with_admin_email'
     OR position('@' IN verifying_admin_email) = 0 THEN
    RAISE EXCEPTION 'Replace REPLACE_WITH_ADMIN_EMAIL with the verifying Admin email';
  END IF;

  SELECT u.id
    INTO verifying_admin_id
    FROM users u
    JOIN role_assignments ra ON ra.user_id = u.id
   WHERE lower(u.email) = verifying_admin_email
     AND ra.role = 'admin';

  IF verifying_admin_id IS NULL THEN
    RAISE EXCEPTION 'No YOGYA Admin role found for email %', verifying_admin_email;
  END IF;

  SELECT count(*)
    INTO actual_count
    FROM schemes
   WHERE slug = ANY (ARRAY[
     'ts-pms','ts-pre','ts-aovn','ts-mjp','ts-cmos','in-csss','in-pragati',
     'in-saksham','in-swanath','in-nmmss','in-yasasvi','in-sc-top','in-st-top',
     'in-pwd-pms','in-ishan'
   ]);

  IF actual_count <> expected_count THEN
    RAISE EXCEPTION 'Expected % seeded schemes, found %', expected_count, actual_count;
  END IF;

  FOR item IN
    SELECT s.id AS scheme_id, s.slug, s.name,
           v.id AS record_id, v.status AS workflow_status
      FROM schemes s
      JOIN scheme_versions v ON v.scheme_id = s.id
     WHERE s.slug = ANY (ARRAY[
       'ts-pms','ts-pre','ts-aovn','ts-mjp','ts-cmos','in-csss','in-pragati',
       'in-saksham','in-swanath','in-nmmss','in-yasasvi','in-sc-top','in-st-top',
       'in-pwd-pms','in-ishan'
     ])
     ORDER BY s.slug
     FOR UPDATE OF s, v
  LOOP
    IF item.workflow_status NOT IN ('draft', 'in_review', 'verified', 'published') THEN
      RAISE EXCEPTION 'Scheme % has unsupported workflow status %',
        item.slug, item.workflow_status;
    END IF;

    SELECT id
      INTO evidence_source_id
      FROM scheme_sources
     WHERE scheme_id = item.scheme_id
     ORDER BY CASE WHEN notes LIKE 'User-supplied draft source%' THEN 0 ELSE 1 END,
              retrieved_at,
              id
     LIMIT 1;

    IF evidence_source_id IS NULL THEN
      RAISE EXCEPTION 'Scheme % has no official source', item.slug;
    END IF;

    UPDATE scheme_sources
       SET verified_at = COALESCE(verified_at, verified_on),
           verified_by = COALESCE(verified_by, verifying_admin_id)
     WHERE scheme_id = item.scheme_id;

    IF item.workflow_status <> 'published' THEN
      UPDATE scheme_versions
         SET status = 'published',
             verified_at = COALESCE(verified_at, verified_on),
             verified_by = COALESCE(verified_by, verifying_admin_id),
             source_id = COALESCE(source_id, evidence_source_id),
             published_at = COALESCE(published_at, verified_on),
             updated_at = now()
       WHERE id = item.record_id;

      INSERT INTO scheme_verification_history
        (scheme_version_id, action, actor_user_id, note, recorded_at)
      VALUES
        (item.record_id, 'verified', verifying_admin_id,
         'Official sources and 2026-27 catalogue data verified by Admin.', verified_on),
        (item.record_id, 'published', verifying_admin_id,
         'Published through verified catalogue batch.', verified_on);

      INSERT INTO audit_logs
        (actor_user_id, action, entity_type, entity_id, details)
      VALUES
        (verifying_admin_id, 'scheme.published', 'scheme', item.scheme_id,
         jsonb_build_object(
           'method', 'verified_catalogue_seed',
           'academic_year', '2026-27',
           'workflow_record_id', item.record_id,
           'source_id', evidence_source_id
         ));
    END IF;

    UPDATE schemes
       SET status = 'published', updated_at = now()
     WHERE id = item.scheme_id;
  END LOOP;
END
$$;

COMMIT;

-- Verification: must return exactly 15 published scheme/workflow rows.
SELECT s.slug, s.name, s.status AS scheme_status,
       v.status AS workflow_status, v.verified_at, v.published_at,
       src.official_url, src.verified_at AS source_verified_at
  FROM schemes s
  JOIN scheme_versions v ON v.scheme_id = s.id
  JOIN scheme_sources src ON src.id = v.source_id
 WHERE s.slug = ANY (ARRAY[
   'ts-pms','ts-pre','ts-aovn','ts-mjp','ts-cmos','in-csss','in-pragati',
   'in-saksham','in-swanath','in-nmmss','in-yasasvi','in-sc-top','in-st-top',
   'in-pwd-pms','in-ishan'
 ])
 ORDER BY s.slug;
