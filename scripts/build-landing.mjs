// Builds public/landing/index.html — the fundir.ai homepage — from the Claude
// Design landing template + its runtime/modules, all under public/landing/.
//
// SOURCE OF TRUTH: the "Fundir Design System" project on claude.ai/design,
// template templates/landing-page/LandingPage.dc.html. The self-contained
// export exceeds the Design API's 256 KiB per-file read cap, so instead we host
// the raw source files (dc template + support.js runtime + ds-base.js + the
// canvas modules + DS token CSS + _ds_bundle.js + assets/fundir-mark.png). The
// runtime (support.js) loads React from unpkg and boots the <x-dc> on load.
//
// TO UPDATE after tweaking in Claude Design: re-pull these files into
// public/landing/ (ask Claude to pull them via the Design MCP — the dc template,
// the modules, and any changed tokens/bundle), then run:
//     node scripts/build-landing.mjs
// and commit + push. The pulled dc template stays pristine; this script only
// (1) rewrites its "./" paths to "/landing/…" so they resolve when served at "/",
// (2) sets a real <title>, and (3) wires the CTAs to real auth routes.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'public', 'landing', 'LandingPage.dc.html');
const OUT = join(root, 'public', 'landing', 'index.html');

let html = readFileSync(SRC, 'utf8');

// 1. Resolve relative references against /landing/ (the page is served at "/"
//    via a rewrite, so bare "./x" would otherwise resolve against "/").
html = html.replace(/src="\.\//g, 'src="/landing/');
html = html.replace(/href="\.\//g, 'href="/landing/');
html = html.replace(/assets\/fundir-mark\.png/g, '/landing/assets/fundir-mark.png');

// 2. Real <title> (the template ships without one).
if (/<title>[\s\S]*?<\/title>/i.test(html)) {
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>Fundir — AI Grant Intelligence</title>');
} else {
  html = html.replace(/<head>/i, '<head>\n<title>Fundir — AI Grant Intelligence</title>');
}

// 2b. Google Search Console site-verification tag (proves domain ownership for
//     Google OAuth branding verification). Injected here so it survives re-pulls
//     of the design template.
const GSC_META = '<meta name="google-site-verification" content="-SIIxl204u88xB92Zmu8jc2Mwnbjpkq-tODsBnonOPE">';
if (!html.includes('google-site-verification')) {
  html = html.replace(/<head>/i, `<head>\n${GSC_META}`);
}

// 3. CTA wiring. Capture-phase delegation on the document so it wins over the
//    design's own handlers and survives React re-renders. Exact (trimmed,
//    lowercased) text match avoids catching the same words in body copy.
const CTA_SCRIPT = `
<script>
/* Injected by scripts/build-landing.mjs — wires the design's CTAs to real routes. */
(function () {
  var MAP = { 'sign in': '/login', 'request access': '/onboarding' };
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a,button,[role="button"]') : null;
    if (!el) return;
    var href = MAP[(el.textContent || '').trim().toLowerCase()];
    if (href) { e.preventDefault(); e.stopPropagation(); window.location.assign(href); }
  }, true);
  var mark = function () {
    var els = document.querySelectorAll('a,button,[role="button"]');
    for (var i = 0; i < els.length; i++) {
      if (MAP[(els[i].textContent || '').trim().toLowerCase()]) els[i].style.cursor = 'pointer';
    }
  };
  var n = 0, iv = setInterval(function () { mark(); if (++n > 40) clearInterval(iv); }, 200);
})();
</script>`;

html = html.includes('</body>') ? html.replace('</body>', CTA_SCRIPT + '\n</body>') : html + CTA_SCRIPT;

writeFileSync(OUT, html);
console.log('Wrote', OUT, '—', html.length, 'bytes');
