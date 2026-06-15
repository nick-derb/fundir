-- ════════════════════════════════════════════════════════════════════════════
-- Phase 5 — register Chicago Metro region-scoped grant sources.
--
-- These rows are the registry-side counterpart to the adapter scaffolds in
-- lib/adapters/{chicago-dfss,cook-county,illinois-gata,isbe}-adapter.ts.
-- Each row carries the region_id of the chicago-metro region (added in
-- phase1_config_foundation.sql); the ingestion runner uses that linkage
-- to know which adapters to call for each org's region.
--
-- IDEMPOTENT — safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO grant_sources (adapter_key, name, source_type, region_id, config) VALUES
  ('city_of_chicago_dfss', 'City of Chicago — Department of Family & Support Services',
   'state_local', (SELECT id FROM regions WHERE slug = 'chicago-metro'),
   jsonb_build_object('seed_only', true,
                      'phase', '5A',
                      'reference', 'https://www.chicago.gov/city/en/depts/dfss/provdrs/serv/svcs/funding-opportunities.html')),

  ('cook_county', 'Cook County, Illinois',
   'state_local', (SELECT id FROM regions WHERE slug = 'chicago-metro'),
   jsonb_build_object('seed_only', true,
                      'phase', '5A',
                      'reference', 'https://www.cookcountyil.gov/agency/bureau-economic-development')),

  ('illinois_gata', 'Illinois GATA Portal',
   'state_local', (SELECT id FROM regions WHERE slug = 'chicago-metro'),
   jsonb_build_object('seed_only', true,
                      'phase', '5A',
                      'reference', 'https://gata.illinois.gov/')),

  ('isbe', 'Illinois State Board of Education',
   'state_local', (SELECT id FROM regions WHERE slug = 'chicago-metro'),
   jsonb_build_object('seed_only', true,
                      'phase', '5A',
                      'reference', 'https://www.isbe.net/Pages/Grants.aspx'))
ON CONFLICT (adapter_key) DO UPDATE
  SET name        = EXCLUDED.name,
      source_type = EXCLUDED.source_type,
      region_id   = EXCLUDED.region_id,
      config      = EXCLUDED.config;
