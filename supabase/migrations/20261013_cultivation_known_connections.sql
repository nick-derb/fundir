-- "Known Connections" sheet of the Foundation Cultivation List.
--
-- CYC's board now records, per foundation, who at CYC knows the foundation and
-- where the outreach stands. Those facts live on the foundation row (not on a
-- board member), so cyc_cultivation grows the two columns and the trustee sync
-- learns to turn a foundation-level connection into graph edges:
--   CYC ──existing_cyc_relationship──▶ foundation   (what the scoring reads)
--   CYC person ──existing_cyc_relationship──▶ foundation   (the warm path)
-- Re-running the sync after a fresh upload removes the cyc_workbook edges the
-- file no longer supports, so a connection taken off the sheet leaves the graph.

alter table cyc_cultivation add column if not exists connection       text;
alter table cyc_cultivation add column if not exists outreach_status  text;
alter table cyc_cultivation add column if not exists list             text;

-- The foundation's canonical node: by EIN, else a unique exact name match, else a fresh node.
create or replace function network_resolve_cultivation_org(p_name text, p_ein text, p_funder_type text, p_source uuid, out o_id uuid, out o_created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ein  text;
  v_norm text;
  v_cnt  int;
  v_type text;
begin
  o_created := false;
  v_ein := nullif(regexp_replace(coalesce(p_ein, ''), '\D', '', 'g'), '');
  if v_ein is not null then v_ein := lpad(v_ein, 9, '0'); end if;
  v_norm := network_normalize_org_name(p_name);
  o_id := null;
  if v_ein is not null then
    select id into o_id from network_organizations where ein = v_ein limit 1;
  end if;
  if o_id is null then
    select count(*), (array_agg(id))[1] into v_cnt, o_id
      from network_organizations
     where normalized_name = v_norm and (v_ein is null or ein is null);
    if v_cnt <> 1 then
      select count(*), (array_agg(id))[1] into v_cnt, o_id
        from network_organizations
       where normalized_name = v_norm and (v_ein is null or ein is null)
         and (funder_id is not null or recipient_id is not null);
      if v_cnt <> 1 then o_id := null; end if;
    end if;
    if o_id is not null and v_ein is not null then
      update network_organizations set ein = v_ein where id = o_id and ein is null;
    end if;
  end if;
  if o_id is null then
    v_type := case
      when p_funder_type ilike '%corporate%' then 'corporate_foundation'
      when p_funder_type ilike '%community%' or p_name ~* 'community (trust|foundation|fund)\M' then 'community_foundation'
      when p_name ~* 'foundation|charitable trust|memorial (fund|trust)|family fund|philanthrop|giving fund|donor advised|\mtr\M|\mch\M' then 'foundation'
      else 'nonprofit' end;
    insert into network_organizations (name, normalized_name, organization_type, ein, source_id, confidence)
    values (trim(p_name), v_norm, v_type, v_ein, p_source, 0.85)
    returning id into o_id;
    o_created := true;
  end if;
end
$$;
revoke all on function network_resolve_cultivation_org(text, text, text, uuid) from public, anon, authenticated;

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
  v_new     boolean;
  v_person  uuid;
  v_own     uuid;
  v_title   text;
  v_conn    text;
  v_who     text;
  v_cnt     int;
  n_orgs    int := 0;
  n_people  int := 0;
  n_seats   int := 0;
  n_edges   int := 0;
  n_links   int := 0;
  n_removed int := 0;
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

  -- 0. Edges the current list no longer supports go first, so a connection removed
  --    from the sheet (or a foundation taken off it) leaves the graph on refresh.
  --    Only cyc_workbook edges are touched; derived and LinkedIn-backed ones stay.
  with keep_trustee as (
    select p.id
      from network_people p
      join funder_board_members b
        on b.org_id = p.org_id and network_person_name_key(b.member_name) = network_person_name_key(p.name)
     where p.org_id = p_org_id and p.kind = 'trustee'
       and nullif(trim(coalesce(b.connection_to_cyc, '')), '') is not null
       and lower(trim(b.connection_to_cyc)) not in ('unknown', 'no', 'none', 'not started', 'n/a', 'tbd')
  ), keep_foundation as (
    select o.id
      from cyc_cultivation c
      join network_organizations o
        on (c.bmf_ein is not null and o.ein = lpad(regexp_replace(c.bmf_ein, '\D', '', 'g'), 9, '0'))
        or o.normalized_name = network_normalize_org_name(c.foundation_name)
     where c.org_id = p_org_id
       and nullif(trim(coalesce(c.connection, '')), '') is not null
       and lower(trim(c.connection)) not in ('unknown', 'no', 'none', 'not started', 'n/a', 'tbd')
  ), gone as (
    delete from network_relationships rel   -- not "r": that is the loop record below
     where rel.org_id = p_org_id and rel.source_type = 'cyc_workbook' and rel.relationship_type = 'existing_cyc_relationship'
       and (
         -- trustee-level: the trustee no longer carries a connection on the list
         (exists (select 1 from network_people p where p.id in (rel.source_person_id, rel.target_person_id) and p.kind = 'trustee')
          and not exists (select 1 from keep_trustee k where k.id in (rel.source_person_id, rel.target_person_id)))
         or
         -- foundation-level: the foundation row no longer carries a connection
         (rel.evidence->>'level' = 'foundation'
          and not exists (select 1 from keep_foundation k where k.id = rel.target_organization_id))
       )
     returning 1
  )
  select count(*) into n_removed from gone;

  -- 1. Board members / staff listed per foundation.
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
    select o_id, o_created into v_org, v_new from network_resolve_cultivation_org(r.foundation_name, r.bmf_ein, r.funder_type, v_source);
    if v_new then n_orgs := n_orgs + 1; end if;

    -- The trustee: same name AND an existing seat at this foundation → same person; otherwise new.
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

    -- A CYC-recorded connection → trustee ↔ CYC edge (cyc_workbook source survives re-derivation).
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
                  'who_knows_them', r.who_knows_them, 'outreach_status', r.outreach_status, 'level', 'member'),
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
                  'who_knows_them', v_who, 'connection_type', r.connection_type, 'level', 'member'),
                v_source, 'cyc_workbook');
        n_links := n_links + 1;
      end if;
    end if;
  end loop;

  -- 2. Foundation-level connections ("Known Connections" sheet): CYC → foundation for the
  --    scoring, and the named CYC person → foundation for the warm path.
  if v_cyc is not null then
    for r in
      select c.foundation_name, c.bmf_ein, c.funder_type, c.connection, c.outreach_status, c.notes
        from cyc_cultivation c
       where c.org_id = p_org_id
         and coalesce(trim(c.foundation_name), '') <> ''
         and nullif(trim(coalesce(c.connection, '')), '') is not null
         and lower(trim(c.connection)) not in ('unknown', 'no', 'none', 'not started', 'n/a', 'tbd')
       order by c.foundation_name
    loop
      select o_id, o_created into v_org, v_new from network_resolve_cultivation_org(r.foundation_name, r.bmf_ein, r.funder_type, v_source);
      if v_new then n_orgs := n_orgs + 1; end if;
      v_conn := trim(r.connection);

      if not exists (select 1 from network_relationships
                      where org_id = p_org_id and relationship_type = 'existing_cyc_relationship'
                        and source_organization_id = v_cyc and target_organization_id = v_org and source_type = 'cyc_workbook') then
        insert into network_relationships (org_id, relationship_type, source_organization_id, target_organization_id,
                                           relationship_strength, confidence, verification, evidence, source_id, source_type)
        values (p_org_id, 'existing_cyc_relationship', v_cyc, v_org, 10, 0.8, 'probable',
                jsonb_build_object(
                  'summary', 'CYC''s board lists a known connection to ' || trim(r.foundation_name) || ': ' || v_conn
                             || case when nullif(trim(coalesce(r.outreach_status, '')), '') is not null then ' · ' || r.outreach_status else '' end,
                  'connection', v_conn, 'outreach_status', r.outreach_status, 'level', 'foundation'),
                v_source, 'cyc_workbook');
        n_edges := n_edges + 1;
      end if;

      select count(*), (array_agg(id))[1] into v_cnt, v_own
        from network_people
       where org_id = p_org_id and kind in ('board', 'staff', 'auxiliary', 'council')
         and network_person_name_key(name) = network_person_name_key(v_conn);
      if v_cnt = 1 and not exists (select 1 from network_relationships
                                    where org_id = p_org_id and relationship_type = 'existing_cyc_relationship'
                                      and source_person_id = v_own and target_organization_id = v_org and source_type = 'cyc_workbook') then
        insert into network_relationships (org_id, relationship_type, source_person_id, target_organization_id,
                                           relationship_strength, confidence, verification, evidence, source_id, source_type)
        values (p_org_id, 'existing_cyc_relationship', v_own, v_org, 10, 0.7, 'probable',
                jsonb_build_object(
                  'summary', v_conn || ' knows ' || trim(r.foundation_name) || ' — per the Known Connections sheet of CYC''s cultivation list'
                             || case when nullif(trim(coalesce(r.outreach_status, '')), '') is not null then ' (' || r.outreach_status || ')' else '' end,
                  'connection', v_conn, 'outreach_status', r.outreach_status, 'level', 'foundation'),
                v_source, 'cyc_workbook');
        n_links := n_links + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object('organizations', n_orgs, 'people', n_people, 'seats', n_seats, 'edges', n_edges, 'links', n_links, 'removed', n_removed);
end
$$;

revoke all on function network_sync_funder_boards(uuid) from public, anon, authenticated;
