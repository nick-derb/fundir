-- Re-score an org's stored matches under new weights, exactly and in one
-- statement. Every composite is a pure function of the six stored sub-scores, so
-- changing weights in Settings never requires re-embedding or re-extraction.
--
-- Backfill: funder affinity was blended into the composite but never persisted.
-- Recover it algebraically from the stored composite and the other five factors
-- (composite = Σ subscore × weight, so the one unknown solves exactly).
update match_results
set funder_affinity_score = greatest(0, least(100,
  (composite_score - (
      coalesce(semantic_similarity,0)*0.32 +
      coalesce(eligibility_score,0)*0.20 +
      coalesce(financial_score,0)*0.18 +
      coalesce(strategic_score,0)*0.12 +
      coalesce(historical_score,0)*0.06
  )) / 0.12))
where funder_affinity_score is null and composite_score is not null and composite_score > 0;

update match_results set funder_affinity_score = 35 where funder_affinity_score is null;

-- A grant the matcher hard-zeroed (international/defense exclusion, geography
-- hard-fail) carries all-zero sub-scores. Its affinity must be 0 as well, or a
-- weight change would revive an excluded grant with a nonzero score.
update match_results set funder_affinity_score = 0
where coalesce(semantic_similarity,0)=0 and coalesce(eligibility_score,0)=0
  and coalesce(financial_score,0)=0   and coalesce(strategic_score,0)=0
  and coalesce(historical_score,0)=0;

create or replace function recompute_match_composites(
  p_org_id uuid,
  w_sem numeric, w_elig numeric, w_fin numeric,
  w_aff numeric, w_strat numeric, w_hist numeric
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update match_results set composite_score =
    case
      when coalesce(semantic_similarity,0)=0 and coalesce(eligibility_score,0)=0
       and coalesce(financial_score,0)=0   and coalesce(strategic_score,0)=0
       and coalesce(historical_score,0)=0
      then 0  -- excluded stays excluded, at any weighting
      else greatest(0, least(100,
          coalesce(semantic_similarity,0)   * w_sem   / 100 +
          coalesce(eligibility_score,0)     * w_elig  / 100 +
          coalesce(financial_score,0)       * w_fin   / 100 +
          coalesce(funder_affinity_score,35)* w_aff   / 100 +
          coalesce(strategic_score,0)       * w_strat / 100 +
          coalesce(historical_score,0)      * w_hist  / 100))
    end
  where org_id = p_org_id;
  get diagnostics n = row_count;
  return n;
end; $$;

revoke all on function recompute_match_composites(uuid,numeric,numeric,numeric,numeric,numeric,numeric)
  from public, anon, authenticated;
