-- Application windows belong to an academic-year scheme version.
ALTER TABLE scheme_versions
  ADD COLUMN IF NOT EXISTS application_start_date date,
  ADD COLUMN IF NOT EXISTS application_end_date date;

ALTER TABLE scheme_versions
  DROP CONSTRAINT IF EXISTS scheme_versions_application_date_order;
ALTER TABLE scheme_versions
  ADD CONSTRAINT scheme_versions_application_date_order CHECK (
    application_start_date IS NULL OR application_end_date IS NULL
    OR application_start_date <= application_end_date
  );
