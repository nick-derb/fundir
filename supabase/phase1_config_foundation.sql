-- ════════════════════════════════════════════════════════════════════════════
-- Phase 1A — Config Foundation
--
-- Introduces region/segment as first-class tenancy abstractions, plus a
-- grant_sources adapter registry, plus the top-level config columns on
-- organizations (region_id, segment_id, ntee_code, budget_band,
-- census_tract, lmi_flag).
--
-- Seeds exactly ONE region (Chicago Metro) and ONE segment (Youth/OST) as
-- the first instances of an otherwise general system. NO Chicago or Youth
-- literals end up in business logic — they live here.
--
-- IDEMPOTENT — safe to re-run. Run in Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. regions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  geo_scope   jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regions: read all" ON regions;
CREATE POLICY "regions: read all" ON regions
  FOR SELECT TO authenticated USING (true);

-- ── 2. segments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS segments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text UNIQUE NOT NULL,
  name              text NOT NULL,
  ntee_codes        text[] NOT NULL DEFAULT '{}',
  peer_rules        jsonb NOT NULL DEFAULT '{}'::jsonb,
  funder_categories text[] NOT NULL DEFAULT '{}',
  factor_weights    jsonb NOT NULL,
  exclusion_rules   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "segments: read all" ON segments;
CREATE POLICY "segments: read all" ON segments
  FOR SELECT TO authenticated USING (true);

-- ── 3. grant_sources (adapter registry) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS grant_sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_key  text UNIQUE NOT NULL,
  name         text NOT NULL,
  source_type  text NOT NULL CHECK (source_type IN ('federal','foundation','state_local','corporate','bank')),
  region_id    uuid REFERENCES regions(id),
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE grant_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grant_sources: read all" ON grant_sources;
CREATE POLICY "grant_sources: read all" ON grant_sources
  FOR SELECT TO authenticated USING (true);

-- ── 4. organizations — region/segment + config columns ─────────────────────
-- These belong as top-level columns (not buried in profile_data) because
-- joins, RLS-shape filtering, and the discovery cron all read them.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS region_id    uuid REFERENCES regions(id),
  ADD COLUMN IF NOT EXISTS segment_id   uuid REFERENCES segments(id),
  ADD COLUMN IF NOT EXISTS ntee_code    text,
  ADD COLUMN IF NOT EXISTS budget_band  text,
  ADD COLUMN IF NOT EXISTS census_tract text,
  ADD COLUMN IF NOT EXISTS lmi_flag     boolean;

CREATE INDEX IF NOT EXISTS organizations_region_id_idx  ON organizations(region_id);
CREATE INDEX IF NOT EXISTS organizations_segment_id_idx ON organizations(segment_id);

-- ── 5. SEED: Chicago Metro region ──────────────────────────────────────────
INSERT INTO regions (slug, name, geo_scope) VALUES (
  'chicago-metro',
  'Chicago Metro',
  jsonb_build_object(
    'states',   jsonb_build_array('IL'),
    'counties', jsonb_build_array('Cook','DuPage','Kane','Lake','McHenry','Will'),
    'metro',    'Chicago-Naperville-Elgin MSA',
    'cities',   jsonb_build_array('Chicago')
  )
)
ON CONFLICT (slug) DO UPDATE
  SET geo_scope = EXCLUDED.geo_scope,
      name      = EXCLUDED.name;

-- ── 6. SEED: Youth / OST segment ───────────────────────────────────────────
-- factor_weights matches Section 3 of PHASE_0_PLAN.md (6-factor engine,
-- semantic dropped from 0.40 → 0.32 to make room for funder_affinity 0.12).
-- exclusion_rules carries the lists currently hardcoded in lib/matching.ts.
-- peer_rules.keyword_profiles carries the list currently in TARGETED_SEARCHES
-- and the cron's CRON_PROFILES — read from here in Phase 1C.
INSERT INTO segments (
  slug, name, ntee_codes, peer_rules, funder_categories,
  factor_weights, exclusion_rules
) VALUES (
  'youth-ost',
  'Youth / Out-of-School-Time',
  ARRAY['O20','O21','O22','O23','O30','O50','B92','P30'],
  jsonb_build_object(
    'budget_bands',           jsonb_build_array('500k-2m','2m-10m','10m-50m'),
    'ages_served',            '5-18',
    'baseline_win_rate',      0.35,
    'baseline_state_code',    'IL',
    'baseline_state_label',   'Illinois',
    'recommendation_thresholds', jsonb_build_object('pursue', 70, 'maybe', 50),
    'keyword_profiles',       jsonb_build_array(
      jsonb_build_object('name','Youth Afterschool',     'keyword','youth afterschool out-of-school time',           'rows',25),
      jsonb_build_object('name','Early Childhood',       'keyword','early childhood education Head Start pre-K',     'rows',25),
      jsonb_build_object('name','Youth Workforce Dev',   'keyword','youth workforce development job training 14-24', 'rows',25),
      jsonb_build_object('name','21st CCLC',             'keyword','21st Century Community Learning Centers',        'rows',20),
      jsonb_build_object('name','Violence Prevention',   'keyword','youth violence prevention community nonprofit',  'rows',20),
      jsonb_build_object('name','Mentoring',             'keyword','youth mentoring at-risk young people nonprofit', 'rows',20),
      jsonb_build_object('name','STEM Youth',            'keyword','STEM youth nonprofit afterschool',                'rows',20),
      jsonb_build_object('name','Social-Emotional',      'keyword','social emotional learning youth development nonprofit', 'rows',20),
      jsonb_build_object('name','Low-Income Youth',      'keyword','low-income youth education nonprofit disadvantaged','rows',20),
      jsonb_build_object('name','Summer Learning',       'keyword','summer learning loss youth camps nonprofit',     'rows',15),
      jsonb_build_object('name','Nonprofit Capacity',    'keyword','nonprofit capacity building community organization grant','rows',15)
    )
  ),
  ARRAY['youth_development','education','workforce_development','violence_prevention','arts_education','early_childhood','mentoring'],
  jsonb_build_object(
    'semantic',        0.32,
    'eligibility',     0.20,
    'financial_990',   0.18,
    'funder_affinity', 0.12,
    'strategic',       0.12,
    'historical',      0.06
  ),
  jsonb_build_object(
    'agencies',         jsonb_build_array('DOS','STATE','DOD','USAID','ARMY','NAVY','AIR','MDA','DARPA','NSA','DIA','USMC'),
    'agency_prefixes',  jsonb_build_array('DOD-','ARMY-','NAVY-','USAF-','DLA-','DOS-','STATE-','USAID-'),
    'keywords',         jsonb_build_array(
      'ukraine','ukrainian','russia','russian',
      'afghanistan','afghan',
      'israel','gaza','west bank',
      'iraq','syria','somalia','sudan','myanmar',
      'overseas','foreign country','foreign nation',
      'international development',
      'foreign assistance',
      'refugees abroad','displaced persons abroad',
      'global health',
      'democracy abroad','rule of law abroad',
      'peacekeeping','military support',
      'arms','weapons','combat',
      'embassy','consulate'
    )
  )
)
ON CONFLICT (slug) DO UPDATE
  SET ntee_codes        = EXCLUDED.ntee_codes,
      peer_rules        = EXCLUDED.peer_rules,
      funder_categories = EXCLUDED.funder_categories,
      factor_weights    = EXCLUDED.factor_weights,
      exclusion_rules   = EXCLUDED.exclusion_rules,
      name              = EXCLUDED.name;

-- ── 7. SEED: grant_sources rows for adapters that already exist ────────────
-- region_id is NULL for national sources. Phase 5 will add the four
-- Chicago Metro state/local rows.
INSERT INTO grant_sources (adapter_key, name, source_type, region_id, config) VALUES
  ('grants_gov',       'Grants.gov',                    'federal',    NULL,
    jsonb_build_object('base_url','https://api.grants.gov','rate_limit_qps',2)),
  ('propublica_990pf', 'ProPublica Nonprofit Explorer', 'foundation', NULL,
    jsonb_build_object('base_url','https://projects.propublica.org/nonprofits/api/v2','rate_limit_qps',1)),
  ('foundation_seed',  'Curated foundation seed list',  'foundation', NULL,
    jsonb_build_object('static',true))
ON CONFLICT (adapter_key) DO UPDATE
  SET name        = EXCLUDED.name,
      source_type = EXCLUDED.source_type,
      config      = EXCLUDED.config;

-- ── 8. BACKFILL: pin existing CYC + YMCA orgs to the seeded region/segment ─
-- Decision 6: migrate in place; do not wipe.
DO $$
DECLARE
  v_region_id  uuid;
  v_segment_id uuid;
BEGIN
  SELECT id INTO v_region_id  FROM regions  WHERE slug = 'chicago-metro';
  SELECT id INTO v_segment_id FROM segments WHERE slug = 'youth-ost';

  UPDATE organizations
  SET    region_id   = COALESCE(region_id, v_region_id),
         segment_id  = COALESCE(segment_id, v_segment_id),
         ntee_code   = COALESCE(ntee_code, 'O20'),
         budget_band = COALESCE(budget_band, '10m-50m')
  WHERE  org_code IN ('CYC2026','YOM2026');
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- POST-RUN VERIFICATION
-- (run these by hand after applying)
--
--   SELECT slug, name FROM regions;
--   SELECT slug, name, factor_weights FROM segments;
--   SELECT adapter_key, source_type FROM grant_sources ORDER BY adapter_key;
--   SELECT org_code, region_id, segment_id, ntee_code, budget_band
--     FROM organizations WHERE org_code IN ('CYC2026','YOM2026');
-- ════════════════════════════════════════════════════════════════════════════
