// Builds public/request-access/index.html — the /onboarding request-access page —
// from the Claude Design template (templates/request-access/RequestAccess.dc.html).
//
// Served at /onboarding via a rewrite in next.config.ts. Same hosting model as
// the landing page (scripts/build-landing.mjs): the dc-runtime (support.js) loads
// React and boots the <x-dc>. This page REUSES the landing's already-hosted
// runtime + design-system files (/landing/support.js, /landing/ds-base.js, the
// tokens/bundle it loads, and the mark image) — only field.js is page-specific.
//
// TO UPDATE after tweaking in Claude Design: re-pull the template + field.js into
// public/request-access/, then run:  node scripts/build-request-access.mjs
//
// The pulled template stays pristine. This script only (1) rewrites its relative
// paths to absolute /landing//request-access URLs, (2) sets a real <title>, and
// (3) swaps the design's mailto: submit for a POST to /api/request-access, which
// emails the request to nickderbis@gmail.com server-side.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'public', 'request-access', 'RequestAccess.dc.html');
const OUT = join(root, 'public', 'request-access', 'index.html');

let html = readFileSync(SRC, 'utf8');

// 1. Resolve references. Reuse the landing's runtime + DS files; field.js is local.
html = html
  .replace('src="./support.js"', 'src="/landing/support.js"')
  .replace('src="./ds-base.js"', 'src="/landing/ds-base.js"')
  .replace('src="./field.js"', 'src="/request-access/field.js"')
  .replace(/src="\.\.\/\.\.\/assets\/fundir-mark\.png"/g, 'src="/landing/assets/fundir-mark.png"')
  .replace(/href="\.\.\/landing-page\/LandingPage\.dc\.html"/g, 'href="/"');

// 2. Real <title>.
html = html.replace(/<head>/i, '<head>\n<title>Request access — Fundir</title>');

// 3. Server-side delivery: replace the design's mailto: submit with a POST to the
//    API route (which emails nickderbis@gmail.com). Everything else in the design's
//    submit handler — validation, the "Request received" state — is left intact.
html = html.replace(
  /window\.location\.href = 'mailto:'[\s\S]*?encodeURIComponent\(body\);/,
  "fetch('/api/request-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }).catch(function () {});",
);

writeFileSync(OUT, html);
console.log('Wrote', OUT, '—', html.length, 'bytes');
