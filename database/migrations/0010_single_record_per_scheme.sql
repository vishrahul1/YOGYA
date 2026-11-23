-- YOGYA stores one workflow record for each scholarship scheme.
-- The existing scheme_versions table name is retained for compatibility with
-- eligibility, application, audit, and publication foreign keys.

DO $$
BEGIN
  IF EXISTS (
    SELECT scheme_id
      FROM scheme_versions
     GROUP BY scheme_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce one scholarship record per scheme: duplicate scheme_ids exist';
  END IF;
END
$$;

DROP INDEX IF EXISTS scheme_versions_one_published_idx;

CREATE UNIQUE INDEX IF NOT EXISTS scheme_versions_one_per_scheme_idx
  ON scheme_versions (scheme_id);

COMMENT ON INDEX scheme_versions_one_per_scheme_idx IS
  'Enforces one internal scholarship workflow record per scheme.';
