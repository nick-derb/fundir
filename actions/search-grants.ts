'use server';

import { createServerClient } from '@/lib/supabase';

export interface GrantSearchHit {
  id:         string;
  title:      string;
  agency:     string;
  score:      number;
  stage:      string | null;
  close_date: string | null;
}

export async function searchGrantsAction(query: string): Promise<GrantSearchHit[]> {
  if (!query || query.trim().length < 2) return [];

  const supabase = createServerClient();
  const q = query.trim();

  // Step 1: find matching grant opportunities
  const { data: grants } = await supabase
    .from('grant_opportunities')
    .select('id, title, agency_name, close_date')
    .ilike('title', `%${q}%`)
    .limit(20);

  if (!grants?.length) return [];

  const grantIds = grants.map(g => g.id);

  // Step 2: look up match scores for those grants
  const { data: matches } = await supabase
    .from('match_results')
    .select('grant_id, match_score, pipeline_stage')
    .in('grant_id', grantIds)
    .order('match_score', { ascending: false })
    .limit(8);

  const scoreMap = new Map(
    (matches || []).map(m => [m.grant_id, { score: m.match_score, stage: m.pipeline_stage }])
  );

  // Merge and return only grants with match data
  return grants
    .filter(g => scoreMap.has(g.id))
    .map(g => ({
      id:         g.id,
      title:      g.title,
      agency:     g.agency_name,
      score:      scoreMap.get(g.id)!.score,
      stage:      scoreMap.get(g.id)!.stage,
      close_date: g.close_date,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}
