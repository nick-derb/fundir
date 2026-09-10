// Phase 8 smoke: exercise the console read models against the live database
// (no HTTP, no auth) and print shapes + timings. Nothing is written.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function loadEnv() {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

async function main() {
  loadEnv();
  const { createServerClient } = await import('@/lib/supabase');
  const q = await import('@/lib/network/queries');
  const db = createServerClient();
  const { data: org } = await db.from('organizations').select('id').eq('org_code', 'CYC2026').single();
  const orgId = org!.id as string;
  const t = (label: string, t0: number) => console.log(`  ${label.padEnd(28)} ${(Date.now() - t0).toString().padStart(5)} ms`);

  let t0 = Date.now(); const leads = await q.listLeads(db, orgId); t('listLeads', t0);
  console.log(`    ${leads.length} leads · top: ${leads[0]?.target?.name} ${leads[0]?.score} ${leads[0]?.confidence} · path ${leads[0]?.path.map(p => p.label).join(' → ')}`);
  console.log(`    thesis: ${leads[0]?.thesis}`);
  const untapped = leads.find(l => l.insight_type === 'Untapped Funder'); console.log(`    untapped path: ${untapped?.path.map(p => p.label).join(' → ')}`);
  const corp = leads.find(l => l.insight_type === 'Corporate Giving Opportunity'); console.log(`    corporate path: ${corp?.path.map(p => p.label).join(' → ')}`);

  t0 = Date.now(); const detail = await q.getLeadDetail(db, orgId, leads[0].id); t('getLeadDetail', t0);
  console.log(`    sections ${detail?.explanation?.sections.length} · sources ${detail?.explanation?.sources.length} · actions ${detail?.actions.length} · insights ${detail?.insights.length}`);

  t0 = Date.now(); const ins = await q.listInsights(db, orgId); t('listInsights', t0); console.log(`    ${ins.length} insights · ${ins[0]?.title}`);
  t0 = Date.now(); const orgs = await q.listOrganizations(db, orgId); t('listOrganizations', t0); console.log(`    ${orgs.length} orgs · ${orgs.slice(0, 3).map(o => `${o.name} (${o.type}, peers ${o.peer_events}, trustees ${o.trustees}, lead ${o.top_score})`).join(' | ')}`);
  t0 = Date.now(); const edges = await q.listRelationships(db, orgId, { limit: 400 }); t('listRelationships', t0); console.log(`    ${edges.length} edges · ${edges[0]?.a.name} — ${edges[0]?.b.name} (${edges[0]?.type}, ${edges[0]?.verification})`);
  t0 = Date.now(); const ov = await q.graphOverview(db, orgId); t('graphOverview', t0); console.log(`    ${ov.nodes.length} nodes · ${ov.links.length} links · types ${[...new Set(ov.links.map(l => l.type))].join(', ')}`);
  const mc = ov.nodes.find(n => /McCormick/.test(n.label));
  if (mc?.rowId) { t0 = Date.now(); const nb = await q.graphNeighborhood(db, orgId, { kind: 'org', id: mc.rowId }); t('graphNeighborhood(org)', t0); console.log(`    ${nb.nodes.length} nodes · ${nb.links.length} links · focus ${nb.focus?.label}`); }
  const ph = ov.nodes.find(n => /Doherty/.test(n.label));
  if (ph?.rowId) { t0 = Date.now(); const nb = await q.graphNeighborhood(db, orgId, { kind: 'person', id: ph.rowId }); t('graphNeighborhood(person)', t0); console.log(`    ${nb.nodes.length} nodes · ${nb.links.length} links · ${nb.nodes.slice(0, 6).map(n => n.label).join(', ')}`); }
  t0 = Date.now(); const hit = await q.findNode(db, orgId, 'joyce'); t('findNode', t0); console.log(`    ${hit?.kind} ${hit?.label}`);
}
main().catch(e => { console.error('FAILED:', e); process.exit(1); });
