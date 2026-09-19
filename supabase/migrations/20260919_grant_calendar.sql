-- CYC's own grant calendar workbook (one sheet per fiscal year: July → June,
-- one row per proposal / LOI / report / outreach item, with the month it falls
-- in). Kept separately from the Instrumentl tracker because it carries items
-- Instrumentl does not (reports, renewals, outreach, the "Considered &
-- Rejected" list) and CYC's own projections. A fiscal year is replaced whole
-- on each upload: the workbook is the source of truth for that year.

create table if not exists cyc_grant_calendar (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  fiscal_year           text not null,                  -- 'FY27'
  sheet                 text,                           -- sheet the row came from
  row_order             int  not null default 0,        -- position in the sheet, for stable display
  month_label           text,                           -- 'July', 'Misc. Rolling', 'July FY28'
  funder                text not null,
  status                text,                           -- Planned / Drafted / Submitted / Awarded / Declined / N/A / Rejected
  item_type             text,                           -- Proposal / LOI / Report / Outreach / Update / Reminder / Considered
  ask_type              text,                           -- New / Renewal
  format                text,                           -- Online Portal / Email / Mail / In Person
  funding               text,                           -- Unrestricted / Program / Capital / …
  program               text,                           -- the "CYC" column: Genops, OST, STEM, …
  portal                text,
  lead                  text,
  re_id                 text,                           -- Raiser's Edge id
  due_date              date,
  due_text              text,                           -- 'Rolling', 'TBD', or the raw cell when not a date
  internal_due_date     date,
  anticipated_gift_date date,
  ly_award              numeric,
  planned_ask           numeric,
  projection_high       numeric,
  projection_low        numeric,
  outcome               text,
  amount                numeric,
  outcome_date          date,
  notes                 text,
  re_notes              text,                           -- "Things to put into RE"
  actions               text,
  imported_at           timestamptz not null default now()
);

create index if not exists cyc_grant_calendar_org_fy_idx  on cyc_grant_calendar (org_id, fiscal_year, row_order);
create index if not exists cyc_grant_calendar_org_due_idx on cyc_grant_calendar (org_id, due_date);

alter table cyc_grant_calendar enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'cyc_grant_calendar' and policyname = 'service_role_only_cyc_grant_calendar') then
    create policy "service_role_only_cyc_grant_calendar" on cyc_grant_calendar using (false) with check (false);
  end if;
end $$;
