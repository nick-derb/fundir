/* Fundir pillars — three cycling ASCII marks with linked pillar list.
   Ported from uploads/fundir-pillars-v2.html. */
window.FundirPillars = {
  init: function (c) {
    if (!c || c.__fundirPillars) return; c.__fundirPillars = true;
    var x = c.getContext('2d');
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var N = 170, t = 0, MASKS = [];
    var SET = ['∧', '∨', 'λ', '∧', '∨', '·', '=', '-', ':', '∨', '∧', '·'];
    var LABELS = ['Automated prospecting', 'In-house intelligence', 'Relationship network'];

    function mask(paint) {
      var o = document.createElement('canvas'); o.width = o.height = N;
      var g = o.getContext('2d'), k = N / 100;
      g.strokeStyle = '#000'; g.fillStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round';
      paint(g, k);
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000'; g.fillRect(6 * k, 42 * k, 88 * k, 16 * k);
      g.globalCompositeOperation = 'source-over';
      var d = g.getImageData(0, 0, N, N).data, m = new Float32Array(N * N);
      for (var i = 0; i < N * N; i++) m[i] = d[i * 4 + 3] / 255;
      return m;
    }

    MASKS.push(mask(function (g, k) {
      [43, 32, 21].forEach(function (r, i) { g.lineWidth = (3.4 - i * 0.5) * k; g.beginPath(); g.arc(50 * k, 50 * k, r * k, 0, 6.2832); g.stroke(); });
      g.lineWidth = 2.6 * k;
      [[50, 2, 50, 13], [50, 87, 50, 98], [2, 50, 13, 50], [87, 50, 98, 50]].forEach(function (s) {
        g.beginPath(); g.moveTo(s[0] * k, s[1] * k); g.lineTo(s[2] * k, s[3] * k); g.stroke();
      });
      g.beginPath(); g.arc(50 * k, 50 * k, 8 * k, 0, 6.2832); g.fill();
    }));

    MASKS.push(mask(function (g, k) {
      function sheet(ox, oy, w, h, f) {
        g.lineWidth = 3 * k; g.beginPath();
        g.moveTo(ox * k, oy * k); g.lineTo((ox + w - f) * k, oy * k); g.lineTo((ox + w) * k, (oy + f) * k);
        g.lineTo((ox + w) * k, (oy + h) * k); g.lineTo(ox * k, (oy + h) * k); g.closePath(); g.stroke();
        g.beginPath(); g.moveTo((ox + w - f) * k, oy * k); g.lineTo((ox + w - f) * k, (oy + f) * k);
        g.lineTo((ox + w) * k, (oy + f) * k); g.stroke();
      }
      sheet(12, 9, 52, 64, 13); sheet(23, 20, 52, 64, 13); sheet(34, 31, 52, 64, 13);
      g.lineWidth = 2.4 * k;
      [64, 73, 82].forEach(function (y, i) {
        g.beginPath(); g.moveTo(41 * k, y * k); g.lineTo((i === 2 ? 66 : 79) * k, y * k); g.stroke();
      });
    }));

    MASKS.push(mask(function (g, k) {
      var pts = [], n = 7;
      for (var i = 0; i < n; i++) { var a = -1.57 + i * 6.2832 / n; pts.push([50 + Math.cos(a) * 37, 50 + Math.sin(a) * 37]); }
      g.lineWidth = 1.9 * k;
      pts.forEach(function (p, i) {
        g.beginPath(); g.moveTo(50 * k, 50 * k); g.lineTo(p[0] * k, p[1] * k); g.stroke();
        var q = pts[(i + 2) % n];
        g.beginPath(); g.moveTo(p[0] * k, p[1] * k); g.lineTo(q[0] * k, q[1] * k); g.stroke();
      });
      pts.forEach(function (p, i) { g.beginPath(); g.arc(p[0] * k, p[1] * k, (i % 2 ? 5 : 6.4) * k, 0, 6.2832); g.fill(); });
      g.beginPath(); g.arc(50 * k, 50 * k, 11 * k, 0, 6.2832); g.fill();
    }));

    var HOLD = 4.2, TRANS = 1.5;
    var cur = 0, nxt = null, tp = 0, clock = 0, swapped = false, userPicked = false;
    var last = performance.now();
    var scope = c.parentElement;
    var badge = scope.querySelector('[data-fd-badge]');
    var bt = scope.querySelector('[data-fd-badge-text]');
    var stage = scope.querySelector('[data-fd-stage-slot]');
    var pills = [].slice.call(scope.querySelectorAll('[data-fd-pillar]'));

    function paintPills(active) {
      pills.forEach(function (p, k) {
        var on = k === active;
        p.setAttribute('aria-pressed', on ? 'true' : 'false');
        p.style.opacity = on ? '1' : '.38';
        var rule = p.querySelector('[data-fd-pillar-rule]');
        if (rule) rule.style.transform = on ? 'scaleY(1)' : 'scaleY(0)';
        var h = p.querySelector('[data-fd-pillar-kicker]');
        if (h) h.style.color = on ? '#0C6B5A' : '#9AA7A1';
      });
    }
    function go(i) { if (i === cur || nxt !== null) return; nxt = i; tp = 0; swapped = false; clock = 0; }
    pills.forEach(function (p) {
      var btn = p.querySelector('[data-fd-pillar-btn]') || p;
      btn.addEventListener('click', function () { userPicked = true; go(+p.dataset.i); });
      p.addEventListener('mouseenter', function () { if (p.getAttribute('aria-pressed') !== 'true') p.style.opacity = '.72'; });
      p.addEventListener('mouseleave', function () { if (p.getAttribute('aria-pressed') !== 'true') p.style.opacity = '.38'; });
    });
    paintPills(0);

    var geo = { cx: 0, cy: 0, size: 0 };
    function resize() {
      var d = Math.min(2, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      c.width = w * d; c.height = h * d; x.setTransform(d, 0, 0, d, 0, 0);
      var st = stage.getBoundingClientRect(), cr = c.getBoundingClientRect();
      geo.cx = st.left - cr.left + st.width / 2;
      geo.cy = st.top - cr.top + st.height / 2;
      geo.size = Math.min(st.width, st.height) * 1.02;
    }

    function draw(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!reduce) t += dt;
      if (!geo.size) resize();

      if (nxt === null) {
        if (!userPicked && !reduce) { clock += dt; if (clock > HOLD) go((cur + 1) % MASKS.length); }
      } else {
        tp = Math.min(1, tp + dt / TRANS);
        if (tp > 0.5 && !swapped) { swapped = true; bt.textContent = LABELS[nxt]; paintPills(nxt); }
        if (tp >= 1) { cur = nxt; nxt = null; tp = 0; clock = 0; }
      }
      badge.style.opacity = (nxt !== null && tp > 0.16 && tp < 0.84) ? 0 : 1;

      var A = MASKS[cur], B = nxt !== null ? MASKS[nxt] : null;
      var outA = B ? Math.min(1, Math.max(0, tp / 0.46)) : 0;
      var inB = B ? Math.min(1, Math.max(0, (tp - 0.54) / 0.46)) : 0;

      var w = c.clientWidth, h = c.clientHeight;
      x.clearRect(0, 0, w, h);
      var size = geo.size, x0 = geo.cx - size / 2, y0 = geo.cy - size / 2;
      var step = w < 700 ? 7 : 8, half = step / 2;
      x.textBaseline = 'middle'; x.textAlign = 'center';
      x.font = step * 0.98 + 'px "JetBrains Mono",monospace';

      for (var gy = half; gy < h; gy += step) {
        for (var gx = half; gx < w; gx += step) {
          var u = (gx - x0) / size, v = (gy - y0) / size;
          if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
          var idx = (v * N | 0) * N + (u * N | 0);
          var hsh = (((gx * 7301) ^ (gy * 1933)) % 977) / 977;
          var m = 0;
          if (A[idx] > 0.05 && hsh > outA) m = A[idx];
          if (B && B[idx] > 0.05 && hsh < inB) m = Math.max(m, B[idx]);
          if (m < 0.07) continue;
          var n = (Math.sin(u * 10.4 + t * 0.95) + Math.sin(v * 8.7 - t * 0.74) + Math.sin((u + v) * 6.9 + t * 1.22)) / 3;
          var pick = (n * 0.5 + 0.5) * 0.70 + hsh * 0.30;
          var a = 0.13 + m * 0.42;
          if (m < 0.30) a *= 0.4 + 0.6 * (n * 0.5 + 0.5);
          x.fillStyle = 'rgba(16,25,23,' + a.toFixed(3) + ')';
          x.fillText(SET[(pick * SET.length) | 0], gx, gy);
        }
      }
      requestAnimationFrame(draw);
    }
    addEventListener('resize', resize);
    resize();
    requestAnimationFrame(draw);
  }
};
