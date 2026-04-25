-- Migration: Self-reported org profile data
-- Run in Supabase SQL Editor

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS profile_data         jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_updated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS profile_updated_by   text; -- user email

-- profile_data structure (stored as JSONB):
-- {
--   fiscal_year_end: "December 31",
--   current_annual_budget: 18000000,
--   current_annual_revenue: 17500000,
--   current_govt_revenue_pct: 62,
--   current_private_grants_pct: 15,
--   current_program_revenue_pct: 8,
--   current_other_revenue_pct: 15,
--   current_net_assets: 4200000,
--   current_months_reserves: 4.2,
--   num_full_time_staff: 95,
--   num_part_time_staff: 40,
--   num_volunteers: 200,
--   participants_served_annually: 4500,
--   num_program_sites: 19,
--   primary_ntee: "O20",
--   mission_statement: "...",
--   program_descriptions: [...],
--   geographic_service_area: "Chicago South and West sides",
--   accreditations: ["NAEYC", "GATA"],
--   key_funders: ["Chicago Community Trust", "United Way"],
--   grant_history: [{ funder, amount, year, program }],
--   pending_grants: [{ funder, amount, submitted_date, program }],
--   awarded_grants: [{ funder, amount, year, program }],
--   strategic_priorities: ["...", "..."],
--   capacity_notes: "...",
-- }
