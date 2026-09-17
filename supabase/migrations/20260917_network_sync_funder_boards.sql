-- Sync CYC's recorded foundation trustees (funder_board_members joined to
-- cyc_cultivation) into the relationship graph, from inside the database so
-- the in-app cultivation importer and a hand-run refresh share one logic.
--
-- Mirrors scripts/migrate-funder-boards.ts:
--   • each foundation → its canonical org node (BMF EIN, else a unique exact
--     normalized name; else a new node),
--   • each trustee → network_people (kind 'trustee'; same name + a seat at the
--     same foundation = same person),
--   • a network_boards seat per (person, foundation, title),
--   • an existing_cyc_relationship edge whenever CYC recorded a connection,
--     plus an inferred person↔person edge to the CYC person the sheet names
--     when that name resolves to exactly one of CYC's own people.
-- Emails on the sheet are personal contact data and are never copied.
-- Idempotent: re-running after a refresh adds only what is new.

-- lib/network/normalize.ts normalizeOrgName, minus the employer alias table.
create or replace function network_normalize_org_name(p text) returns text
language sql immutable as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(coalesce(p, '')), '&', ' and ', 'g'),
            '[.,''’"()]', '', 'g'),
          '[^a-z0-9 ]', ' ', 'g'),
        '\s+', ' ', 'g'),
      '(\s+(inc|incorporated|corp|corporation|llc|llp|lp|ltd|plc|co|company|n a|and|of|the))+\s*$', ''),
    '^\s*the\s+', '')
$$;

-- lib/network/normalize.ts personNameKey: a candidate-retrieval key, never a merge decision.
create or replace function network_person_name_key(p text) returns text
language sql immutable as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(p, '')), '\m(jr|sr|ii|iii|iv|cfa|cpa|esq|phd|md|mba|msw|med|m\.?s\.?w\.?|m\.?ed\.?)\M\.?', '', 'g'),
        '\(.*?\)|["“”]', '', 'g'),
      '[^a-z ]', ' ', 'g'),
    '\s+', ' ', 'g'))
$$;

create or replace function network_sync_funder_boards(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cyc     uuid;
  v_source  uuid;
  r         record;
  v_org     uuid;
  v_person  uuid;
  v_own     uuid;
  v_title   text;
  v_conn    text;
  v_who     text;
  v_ein     text;
  v_norm    text;
  v_type    text;
  v_cnt     int;
  n_orgs    int := 0;
  n_people  int := 0;
  n_seats   int := 0;
  n_edges   int := 0;
  n_links   int := 0;
begin
  select id into v_cyc from network_organizations where ein = '362344429' limit 1;

  select id into v_source from network_sources
   where source_type = 'cyc_workbook' and raw_reference like 'Foundation Cultivation List%'
   order by created_at limit 1;
  if v_source is null then
    insert into network_sources (source_type, source_name, raw_reference, confidence)
    values ('cyc_workbook', 'Foundation Cultivation List (CYC)', 'Foundation Cultivation List (Data Hub upload)', 0.85)
    returning id into v_source;
  end if;

  for r in
    select b.foundation_name, b.member_name, b.title, b.connection_to_cyc, b.connection_type,
           b.who_knows_them, b.outreach_status, c.bmf_ein, c.funder_type
      from funder_board_members b
      left join cyc_cultivation c
        on c.org_id = b.org_id and lower(trim(c.foundation_name)) = lower(trim(b.foundation_name))
     where b.org_id = p_org_id
       and coalesce(trim(b.foundation_name), '') <> ''
       and coalesce(trim(b.member_name), '') <> ''
     order by b.foundation_name, b.member_name
  loop
    -- 1. The foundation's canonical node.
    v_ein := nullif(regexp_replace(coalesce(r.bmf_ein, ''), '\D', '', 'g'), '');
    if v_ein is not null then v_ein := lpad(v_ein, 9, '0'); end if;
    v_norm := network_normalize_org_name(r.foundation_name);
    v_org := null;
    if v_ein is not null then
      select id into v_org from network_organizations where ein = v_ein limit 1;
    end if;
    if v_org is null then
      -- A unique exact name match is the org (with an EIN in hand only an EIN-less node may absorb it);
      -- among several, the one already backed by the 990 graph; otherwise insert fresh.
      select count(*), (array_agg(id))[1] into v_cnt, v_org
        from network_organizations
       where normalized_name = v_norm and (v_ein is null or ein is null);
      if v_cnt <> 1 then
        select count(*), (array_agg(id))[1] into v_cnt, v_org
          from network_organizations
         where normalized_name = v_norm and (v_ein is null or ein is null)
           and (funder_id is not null or recipient_id is not null);
        if v_cnt <> 1 then v_org := null; end if;
      end if;
      if v_org is not null and v_ein is not null then
        update network_organizations set ein = v_ein where id = v_org and ein is null;
      end if;
    end if;
    if v_org is null then
      v_type := case
        when r.funder_type ilike '%corporate%' then 'corporate_foundation'
        when r.funder_type ilike '%community%' or r.foundation_name ~* 'community (trust|foundation|fund)\M' then 'community_foundation'
        when r.foundation_name ~* 'foundation|charitable trust|memorial (fund|trust)|family fund|philanthrop|giving fund|donor advised|\mtr\M|\mch\M' then 'foundation'
        else 'nonprofit' end;
      insert into network_organizations (name, normalized_name, organization_type, ein, source_id, confidence)
      values (trim(r.foundation_name), v_norm, v_type, v_ein, v_source, 0.85)
      returning id into v_org;
      n_orgs := n_orgs + 1;
    end if;

    -- 2. The trustee: same name AND an existing seat at this foundation → same person; otherwise new.
    select p.id into v_person
      from network_people p
      join network_boards s on s.person_id = p.id and s.organization_id = v_org
     where p.org_id = p_org_id and p.kind = 'trustee'
       and network_person_name_key(p.name) = network_person_name_key(r.member_name)
     limit 1;
    if v_person is null then
      insert into network_people (org_id, kind, name, status, current_title, current_org, organization_id, note, source_id, verification)
      values (p_org_id, 'trustee', trim(r.member_name), 'new', nullif(trim(r.title), ''), trim(r.foundation_name), v_org,
              'Trustee of ' || trim(r.foundation_name) || ' per CYC''s foundation cultivation list'
                || case when nullif(trim(coalesce(r.outreach_status, '')), '') is not null then ' · outreach: ' || r.outreach_status else '' end || '.',
              v_source, 'probable')
      returning id into v_person;
      n_people := n_people + 1;
    end if;

    v_title := coalesce(nullif(trim(r.title), ''), 'Board member');
    if not exists (select 1 from network_boards where person_id = v_person and organization_id = v_org and title = v_title) then
      insert into network_boards (person_id, organization_id, title, is_current, source_id, confidence)
      values (v_person, v_org, v_title, true, v_source, 0.85);
      n_seats := n_seats + 1;
    end if;

    -- 3. A CYC-recorded connection → trustee ↔ CYC edge (cyc_workbook source survives re-derivation).
    v_conn := nullif(trim(coalesce(r.connection_to_cyc, '')), '');
    if v_conn is not null and lower(v_conn) not in ('unknown', 'no', 'none', 'not started', 'n/a', 'tbd') and v_cyc is not null then
      if not exists (select 1 from network_relationships
                      where org_id = p_org_id and relationship_type = 'existing_cyc_relationship'
                        and source_person_id = v_person and target_organization_id = v_cyc and source_type = 'cyc_workbook') then
        insert into network_relationships (org_id, relationship_type, source_person_id, target_organization_id,
                                           relationship_strength, confidence, verification, evidence, source_id, source_type)
        values (p_org_id, 'existing_cyc_relationship', v_person, v_cyc, 10, 0.8, 'probable',
                jsonb_build_object(
                  'summary', 'CYC recorded a connection to ' || trim(r.member_name) || ' (' || trim(r.foundation_name) || '): ' || v_conn
                             || case when nullif(trim(coalesce(r.connection_type, '')), '') is not null then ' · ' || r.connection_type else '' end,
                  'connection_to_cyc', v_conn, 'connection_type', r.connection_type,
                  'who_knows_them', r.who_knows_them, 'outreach_status', r.outreach_status),
                v_source, 'cyc_workbook');
        n_edges := n_edges + 1;
      end if;

      -- "Who at CYC knows them" (or the connection text itself, when it is just a name) →
      -- person ↔ person edge when it resolves to exactly one of CYC's own people.
      v_who := coalesce(nullif(trim(coalesce(r.who_knows_them, '')), ''), v_conn);
      select count(*), (array_agg(id))[1] into v_cnt, v_own
        from network_people
       where org_id = p_org_id and kind in ('board', 'staff', 'auxiliary', 'council')
         and network_person_name_key(name) = network_person_name_key(v_who);
      if v_cnt = 1 and not exists (select 1 from network_relationships
                                    where org_id = p_org_id and relationship_type = 'existing_cyc_relationship'
                                      and source_person_id = v_own and target_person_id = v_person and source_type = 'cyc_workbook') then
        insert into network_relationships (org_id, relationship_type, source_person_id, target_person_id,
                                           relationship_strength, confidence, verification, evidence, source_id, source_type)
        values (p_org_id, 'existing_cyc_relationship', v_own, v_person, 10, 0.6, 'inferred',
                jsonb_build_object(
                  'summary', v_who || ' is recorded as knowing ' || trim(r.member_name) || ' (' || coalesce(nullif(trim(coalesce(r.connection_type, '')), ''), 'connection') || ') — name-resolved from CYC''s cultivation list',
                  'who_knows_them', v_who, 'connection_type', r.connection_type),
                v_source, 'cyc_workbook');
        n_links := n_links + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('organizations', n_orgs, 'people', n_people, 'seats', n_seats, 'edges', n_edges, 'links', n_links);
end
$$;

revoke all on function network_sync_funder_boards(uuid) from public, anon, authenticated;
