-- IRS Business Master File replacement (Prospecting → "Replace IRS data").
--
-- A run stages the rows of a freshly dropped IRS file, a diff is computed
-- against the live reference sheet (irs_bmf_il), and applying the run swaps
-- that locked sheet wholesale and rejoins the derived CYC sheets on EIN so
-- owners, notes and outreach status stay attached. Everything here is
-- service-role only; the API route authenticates and authorizes.

create table if not exists irs_bmf_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references organizations(id) on delete set null,
  user_id       uuid,
  user_email    text,
  file_name     text,
  source_rows   integer not null default 0,   -- rows in the dropped file
  staged_rows   integer not null default 0,   -- rows that made it into staging
  skipped_rows  integer not null default 0,   -- no EIN / other state
  status        text not null default 'staging',  -- staging | previewed | applied | cancelled
  added         integer,
  changed       integer,
  removed       integer,
  unchanged     integer,
  created_at    timestamptz not null default now(),
  applied_at    timestamptz
);

create table if not exists irs_bmf_staging (
  run_id           uuid not null references irs_bmf_runs(id) on delete cascade,
  ein              text not null,
  name             text,
  ico              text,
  street           text,
  city             text,
  state            text,
  zip              text,
  subsection       text,
  classification   text,
  ruling           text,
  deductibility    text,
  foundation       text,
  activity         text,
  organization     text,
  status           text,
  tax_period       text,
  asset_cd         text,
  income_cd        text,
  filing_req_cd    text,
  pf_filing_req_cd text,
  asset_amt        numeric,
  income_amt       numeric,
  revenue_amt      numeric,
  ntee_cd          text,
  sort_name        text,
  primary key (run_id, ein)
);

-- RLS: service role only (no policies).
alter table irs_bmf_runs    enable row level security;
alter table irs_bmf_staging enable row level security;

-- Diff a staged run against the live sheet. Also records the counts on the
-- run and moves it to 'previewed' so apply() can insist on a preview first.
create or replace function irs_bmf_diff(p_run uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staged integer; v_current integer;
  v_added integer; v_removed integer; v_changed integer; v_unchanged integer;
  v_tracked_removed integer;
  v_added_sample jsonb; v_removed_sample jsonb; v_changed_sample jsonb;
begin
  if not exists (select 1 from irs_bmf_runs where id = p_run) then
    raise exception 'unknown run %', p_run;
  end if;

  select count(*) into v_staged  from irs_bmf_staging where run_id = p_run;
  select count(*) into v_current from irs_bmf_il;

  select count(*) into v_added
    from irs_bmf_staging s left join irs_bmf_il b on b.ein = s.ein
   where s.run_id = p_run and b.ein is null;

  select count(*) into v_removed
    from irs_bmf_il b
   where not exists (select 1 from irs_bmf_staging s where s.run_id = p_run and s.ein = b.ein);

  select count(*) into v_changed
    from irs_bmf_staging s join irs_bmf_il b on b.ein = s.ein
   where s.run_id = p_run and coalesce(s.asset_amt, 0) <> coalesce(b.asset_amt, 0);

  v_unchanged := v_staged - v_added - v_changed;

  -- Organizations that vanish from the IRS file but appear on a CYC sheet.
  select count(*) into v_tracked_removed
    from irs_bmf_il b
   where not exists (select 1 from irs_bmf_staging s where s.run_id = p_run and s.ein = b.ein)
     and (   exists (select 1 from cyc_cultivation      c where c.bmf_ein = b.ein)
          or exists (select 1 from cyc_research_queue   q where q.ein     = b.ein)
          or exists (select 1 from cyc_funder_prospects p where p.ein     = b.ein)
          or exists (select 1 from cyc_peer_orgs        o where o.ein     = b.ein));

  select coalesce(jsonb_agg(jsonb_build_object('ein', x.ein, 'name', x.name, 'city', x.city, 'assets', x.asset_amt)), '[]'::jsonb)
    into v_added_sample
    from (select s.ein, s.name, s.city, s.asset_amt
            from irs_bmf_staging s left join irs_bmf_il b on b.ein = s.ein
           where s.run_id = p_run and b.ein is null
           order by s.asset_amt desc nulls last limit 6) x;

  select coalesce(jsonb_agg(jsonb_build_object('ein', x.ein, 'name', x.name, 'city', x.city, 'assets', x.asset_amt, 'tracked', x.tracked)), '[]'::jsonb)
    into v_removed_sample
    from (select b.ein, b.name, b.city, b.asset_amt,
                 (   exists (select 1 from cyc_cultivation      c where c.bmf_ein = b.ein)
                  or exists (select 1 from cyc_research_queue   q where q.ein     = b.ein)
                  or exists (select 1 from cyc_funder_prospects p where p.ein     = b.ein)
                  or exists (select 1 from cyc_peer_orgs        o where o.ein     = b.ein)) as tracked
            from irs_bmf_il b
           where not exists (select 1 from irs_bmf_staging s where s.run_id = p_run and s.ein = b.ein)
           order by tracked desc, b.asset_amt desc nulls last limit 6) x;

  select coalesce(jsonb_agg(jsonb_build_object('ein', x.ein, 'name', x.name, 'city', x.city, 'before', x.before_amt, 'after', x.after_amt)), '[]'::jsonb)
    into v_changed_sample
    from (select s.ein, s.name, s.city, b.asset_amt as before_amt, s.asset_amt as after_amt
            from irs_bmf_staging s join irs_bmf_il b on b.ein = s.ein
           where s.run_id = p_run and coalesce(s.asset_amt, 0) <> coalesce(b.asset_amt, 0)
           order by abs(coalesce(s.asset_amt, 0) - coalesce(b.asset_amt, 0)) desc limit 6) x;

  update irs_bmf_runs
     set status = 'previewed', staged_rows = v_staged,
         added = v_added, changed = v_changed, removed = v_removed, unchanged = v_unchanged
   where id = p_run;

  return jsonb_build_object(
    'staged', v_staged, 'current', v_current,
    'added', v_added, 'removed', v_removed, 'changed', v_changed, 'unchanged', v_unchanged,
    'trackedRemoved', v_tracked_removed,
    'addedSample', v_added_sample, 'removedSample', v_removed_sample, 'changedSample', v_changed_sample
  );
end;
$$;

-- Apply a previewed run: swap irs_bmf_il wholesale, then rejoin the derived
-- sheets on EIN. Only the columns that come from the IRS file are touched;
-- everything CYC typed (owners, notes, statuses, funder type, cultivation
-- assets) is left alone. Runs in one transaction.
create or replace function irs_bmf_apply(p_run uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_upserted integer; v_deleted integer;
  v_prospects integer; v_peers integer; v_queue integer; v_cult integer; v_cult_dropped integer;
begin
  select status into v_status from irs_bmf_runs where id = p_run;
  if v_status is null then raise exception 'unknown run %', p_run; end if;
  if v_status <> 'previewed' then raise exception 'run % is %; preview it first', p_run, v_status; end if;

  insert into irs_bmf_il (ein, name, ico, street, city, state, zip, subsection, classification, ruling,
                          deductibility, foundation, activity, organization, status, tax_period, asset_cd,
                          income_cd, filing_req_cd, pf_filing_req_cd, asset_amt, income_amt, revenue_amt,
                          ntee_cd, sort_name, imported_at)
  select ein, name, ico, street, city, state, zip, subsection, classification, ruling,
         deductibility, foundation, activity, organization, status, tax_period, asset_cd,
         income_cd, filing_req_cd, pf_filing_req_cd, asset_amt, income_amt, revenue_amt,
         ntee_cd, sort_name, now()
    from irs_bmf_staging where run_id = p_run
  on conflict (ein) do update set
    name = excluded.name, ico = excluded.ico, street = excluded.street, city = excluded.city,
    state = excluded.state, zip = excluded.zip, subsection = excluded.subsection,
    classification = excluded.classification, ruling = excluded.ruling, deductibility = excluded.deductibility,
    foundation = excluded.foundation, activity = excluded.activity, organization = excluded.organization,
    status = excluded.status, tax_period = excluded.tax_period, asset_cd = excluded.asset_cd,
    income_cd = excluded.income_cd, filing_req_cd = excluded.filing_req_cd, pf_filing_req_cd = excluded.pf_filing_req_cd,
    asset_amt = excluded.asset_amt, income_amt = excluded.income_amt, revenue_amt = excluded.revenue_amt,
    ntee_cd = excluded.ntee_cd, sort_name = excluded.sort_name, imported_at = excluded.imported_at;
  get diagnostics v_upserted = row_count;

  delete from irs_bmf_il b
   where not exists (select 1 from irs_bmf_staging s where s.run_id = p_run and s.ein = b.ein);
  get diagnostics v_deleted = row_count;

  -- Rejoin on EIN. Locked (source) columns only.
  update cyc_funder_prospects p
     set name = b.name, street = b.street, city = b.city, zip = b.zip, ntee_code = b.ntee_cd,
         total_assets = coalesce(b.asset_amt, 0), income = coalesce(b.income_amt, 0),
         files_990pf = case when b.pf_filing_req_cd = '1' then 'Yes' else 'No' end
    from irs_bmf_il b where b.ein = p.ein;
  get diagnostics v_prospects = row_count;

  update cyc_peer_orgs o
     set name = b.name, city = b.city, zip = b.zip, ntee_code = b.ntee_cd,
         total_assets = coalesce(b.asset_amt, 0), revenue = coalesce(b.revenue_amt, 0)
    from irs_bmf_il b where b.ein = o.ein;
  get diagnostics v_peers = row_count;

  update cyc_research_queue q
     set organization_name = b.name, city = b.city, total_assets = coalesce(b.asset_amt, 0)
    from irs_bmf_il b where b.ein = q.ein;
  get diagnostics v_queue = row_count;

  update cyc_cultivation c
     set bmf_legal_name = b.name, in_il_bmf = 'Yes'
    from irs_bmf_il b where b.ein = c.bmf_ein;
  get diagnostics v_cult = row_count;

  update cyc_cultivation c
     set in_il_bmf = 'No - dropped from IRS file'
   where c.bmf_ein is not null and c.in_il_bmf = 'Yes'
     and not exists (select 1 from irs_bmf_il b where b.ein = c.bmf_ein);
  get diagnostics v_cult_dropped = row_count;

  update irs_bmf_runs set status = 'applied', applied_at = now() where id = p_run;
  delete from irs_bmf_staging where run_id = p_run;

  return jsonb_build_object(
    'upserted', v_upserted, 'deleted', v_deleted,
    'prospects', v_prospects, 'peers', v_peers, 'queue', v_queue,
    'cultivation', v_cult, 'cultivationDropped', v_cult_dropped
  );
end;
$$;

revoke all on function irs_bmf_diff(uuid)  from public, anon, authenticated;
revoke all on function irs_bmf_apply(uuid) from public, anon, authenticated;
