import { redirect } from 'next/navigation';

// "Cultivation" was never a separate list — it is the middle of the one funder
// pipeline (Intro needed → Intro requested → Contacted → Meeting). Keeping a
// second page meant the same funder lived in two places, so old links now land
// on the pipeline itself.
export default function CultivationPage() {
  redirect('/connections?tab=pipeline');
}
