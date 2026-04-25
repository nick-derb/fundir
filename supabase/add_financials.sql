-- Add 990 financial fields to organizations
alter table organizations
  add column if not exists ein             text,
  add column if not exists financial_data  jsonb,
  add column if not exists financial_year  integer,
  add column if not exists financial_fetched_at timestamptz;

-- Unique index on EIN
create unique index if not exists organizations_ein_idx
  on organizations (ein)
  where ein is not null;

-- Seed CYC's EIN (Chicago Youth Centers — replace with actual EIN if different)
update organizations
set ein = '362166791'
where org_code = 'CYC2025';
