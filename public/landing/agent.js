/* Fundir prospecting-agent demo — typed query, streamed answer, callouts.
   Ported from uploads/fundir-agent-demo-v3.html; styles are inline so the
   sequence drives element.style directly instead of class toggles. */
window.FundirAgent = {
  init: function (scene) {
    if (!scene || scene.__fundirAgent) return; scene.__fundirAgent = true;
    var q = function (s) { return scene.querySelector('[data-agent="' + s + '"]'); };
    var c = q('bg'), x = c.getContext('2d'), T = 0;
    var SET = ['∧', '∨', 'λ', '∧', '∨', '·', '=', '-', ':'];
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    function rz() {
      var d = Math.min(2, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      var wantW = Math.round(w * d), wantH = Math.round(h * d);
      if (c.width === wantW && c.height === wantH) return;
      c.width = wantW; c.height = wantH; x.setTransform(d, 0, 0, d, 0, 0);
    }
    function bg() {
      var w = c.clientWidth, h = c.clientHeight, step = 9;
      if (!w || !h) return;
      x.clearRect(0, 0, w, h);
      x.textBaseline = 'middle'; x.textAlign = 'center'; x.font = '8.6px "JetBrains Mono",monospace';
      var cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
      for (var gy = 4; gy < h; gy += step) for (var gx = 4; gx < w; gx += step) {
        var d = Math.hypot(gx - cx, gy - cy) / R; if (d > 1) continue;
        var n = (Math.sin(gx * 0.02 + T * 0.9) + Math.sin(gy * 0.017 - T * 0.7) + Math.sin((gx + gy) * 0.012 + T * 1.1)) / 3;
        var a = (0.10 + (1 - d) * 0.14) * (0.55 + 0.45 * (n * 0.5 + 0.5));
        x.fillStyle = 'rgba(16,25,23,' + a.toFixed(3) + ')';
        x.fillText(SET[(((n * 0.5 + 0.5) * 0.7 + (((gx * 7301) ^ (gy * 1933)) % 977) / 977 * 0.3) * SET.length) | 0], gx, gy);
      }
    }

    var Q = "Which closed foundations fund early childhood in Cook County?";
    var PROSE = "Fourteen Illinois foundations filed as preselected-only and granted to early childhood organizations in Cook County within the last two filing years. Three have a resolvable path to your board.";
    var qEl = q('q'), send = q('send'), row = q('inputrow'), ans = q('answer'),
        prose = q('prose'), tbl = q('table'), notes = q('notes'), card = q('card');
    var pops = [0, 1, 2].map(function (i) { return q('pop' + i); });

    function show(el, on, shift) {
      el.style.opacity = on ? '1' : '0';
      if (shift) el.style.transform = on ? 'none' : shift;
    }
    var CYCLE = 12.6, t = 0, last = performance.now();
    function reset() {
      qEl.style.color = '#9AA7A1'; qEl.textContent = 'Start a chat';
      send.style.background = '#FFFFFF'; send.style.color = '#5E6D67'; send.style.borderColor = '#DFE5E2';
      row.style.display = ''; ans.style.display = 'none';
      show(tbl, false, 'translateY(4px)'); show(notes, false);
      card.style.filter = 'none'; card.style.opacity = '1';
      pops.forEach(function (p) { show(p, false, 'translateY(7px) scale(.97)'); });
      prose.textContent = '';
    }
    reset();

    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible) { requestAnimationFrame(frame); return; }
      if (!reduce) { T += dt; t += dt; }
      else if (t < 7.7) { t = 7.7; }
      if (t > CYCLE) { t = 0; reset(); }
      rz();
      bg();

      if (t < 1.0) { /* idle */ }
      else if (t < 3.4) {
        var k = Math.floor((t - 1.0) / 2.4 * Q.length);
        qEl.style.color = '#101917';
        qEl.innerHTML = Q.slice(0, k) + '<span style="display:inline-block;width:1.5px;height:15px;background:#0C6B5A;vertical-align:-3px;margin-left:1px;animation:fd-caret .95s step-end infinite"></span>';
        var hot = k > 3;
        send.style.background = hot ? '#0C6B5A' : '#FFFFFF';
        send.style.color = hot ? '#fff' : '#5E6D67';
        send.style.borderColor = hot ? '#0C6B5A' : '#DFE5E2';
      }
      else if (t < 3.9) { qEl.style.color = '#101917'; qEl.textContent = Q; }
      else {
        if (row.style.display !== 'none') { row.style.display = 'none'; ans.style.display = 'block'; }
        var p = t - 3.9;
        prose.textContent = PROSE.slice(0, Math.floor(Math.min(1, p / 2.2) * PROSE.length));
        if (p > 2.0) show(tbl, true, 'translateY(4px)');
        if (p > 3.0) show(notes, true);
        if (p > 4.0) { card.style.filter = 'blur(4px) saturate(.9)'; card.style.opacity = '.62'; }
        pops.forEach(function (el, i) { if (p > 4.15 + i * 0.42) show(el, true, 'translateY(7px) scale(.97)'); });
      }
      requestAnimationFrame(frame);
    }

    var visible = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && e.intersectionRatio >= 0.3) { if (!visible) { reset(); t = reduce ? 7.7 : 0; } visible = true; }
          else if (!e.isIntersecting) { visible = false; }
        });
      }, { threshold: [0, 0.3] }).observe(scene);
    } else { visible = true; }
    addEventListener('resize', rz);
    rz(); requestAnimationFrame(frame);
  }
};
