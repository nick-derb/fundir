/* Fundir panels — dithered ASCII marks that relay across a group.
   Ported from uploads/fundir-network-v3.html; generalized to any
   [data-fd-panel] frame with data-icon, data-group and data-tone. */
window.FundirPanels = {
  init: function (root) {
    root = root || document;
    var frames = [].slice.call(root.querySelectorAll('[data-fd-panel]')).filter(function (el) { return !el.__fdPanel; });
    if (!frames.length) return;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var SET = ['∧', '∨', 'λ', '∧', '∨', '·', '=', '-', ':', '∨', '∧', '·'];
    function hash(a, b) { return (((a * 7301) ^ (b * 1933)) % 977) / 977; }

    function icon(paint) {
      var N = 120, o = document.createElement('canvas'); o.width = o.height = N;
      var g = o.getContext('2d'), k = N / 100;
      g.strokeStyle = '#000'; g.fillStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round';
      paint(g, k);
      var d = g.getImageData(0, 0, N, N).data, m = new Float32Array(N * N);
      for (var i = 0; i < N * N; i++) m[i] = d[i * 4 + 3] / 255;
      return { m: m, N: N };
    }

    var ICONS = {
      people: icon(function (g, k) {
        g.lineWidth = 6 * k;
        g.beginPath(); g.arc(36 * k, 34 * k, 12 * k, 0, 6.2832); g.stroke();
        g.beginPath(); g.arc(36 * k, 72 * k, 23 * k, Math.PI * 1.13, Math.PI * 1.87); g.stroke();
        g.beginPath(); g.arc(68 * k, 40 * k, 10 * k, 0, 6.2832); g.stroke();
        g.beginPath(); g.arc(68 * k, 75 * k, 19 * k, Math.PI * 1.18, Math.PI * 1.82); g.stroke();
      }),
      path: icon(function (g, k) {
        g.lineWidth = 5 * k;
        g.beginPath(); g.moveTo(22 * k, 62 * k); g.lineTo(50 * k, 34 * k); g.lineTo(78 * k, 62 * k); g.stroke();
        g.beginPath(); g.arc(22 * k, 62 * k, 11 * k, 0, 6.2832); g.fill();
        g.beginPath(); g.arc(50 * k, 34 * k, 8 * k, 0, 6.2832); g.fill();
        g.beginPath(); g.arc(78 * k, 62 * k, 11 * k, 0, 6.2832); g.fill();
      }),
      flag: icon(function (g, k) {
        g.lineWidth = 6 * k;
        g.beginPath(); g.moveTo(31 * k, 18 * k); g.lineTo(31 * k, 84 * k); g.stroke();
        g.beginPath();
        g.moveTo(34 * k, 22 * k); g.lineTo(76 * k, 22 * k); g.lineTo(76 * k, 52 * k); g.lineTo(34 * k, 52 * k);
        g.closePath(); g.stroke();
        g.lineWidth = 4 * k;
        g.beginPath(); g.moveTo(42 * k, 37 * k); g.lineTo(68 * k, 37 * k); g.stroke();
      }),
      ranked: icon(function (g, k) {
        g.lineWidth = 5 * k;
        [[24, 30, 78], [24, 50, 64], [24, 70, 46]].forEach(function (r) {
          g.beginPath(); g.moveTo(r[0] * k, r[1] * k); g.lineTo(r[2] * k, r[1] * k); g.stroke();
        });
        g.beginPath(); g.arc(15 * k, 30 * k, 5.5 * k, 0, 6.2832); g.fill();
        g.beginPath(); g.arc(15 * k, 50 * k, 5.5 * k, 0, 6.2832); g.fill();
        g.beginPath(); g.arc(15 * k, 70 * k, 5.5 * k, 0, 6.2832); g.fill();
      }),
      sheets: icon(function (g, k) {
        function sheet(ox, oy, w, h, f) {
          g.lineWidth = 5 * k; g.beginPath();
          g.moveTo(ox * k, oy * k); g.lineTo((ox + w - f) * k, oy * k); g.lineTo((ox + w) * k, (oy + f) * k);
          g.lineTo((ox + w) * k, (oy + h) * k); g.lineTo(ox * k, (oy + h) * k); g.closePath(); g.stroke();
        }
        sheet(14, 12, 50, 60, 13); sheet(30, 28, 50, 60, 13);
      }),
      quote: icon(function (g, k) {
        g.lineWidth = 5.5 * k;
        g.beginPath();
        g.moveTo(16 * k, 22 * k); g.lineTo(84 * k, 22 * k); g.lineTo(84 * k, 66 * k);
        g.lineTo(44 * k, 66 * k); g.lineTo(28 * k, 84 * k); g.lineTo(28 * k, 66 * k);
        g.lineTo(16 * k, 66 * k); g.closePath(); g.stroke();
        g.lineWidth = 4 * k;
        g.beginPath(); g.moveTo(29 * k, 38 * k); g.lineTo(71 * k, 38 * k); g.stroke();
        g.beginPath(); g.moveTo(29 * k, 51 * k); g.lineTo(58 * k, 51 * k); g.stroke();
      }),
      workspace: icon(function (g, k) {
        g.lineWidth = 5 * k;
        [[14, 16], [56, 16], [14, 56], [56, 56]].forEach(function (p, i) {
          g.beginPath(); g.rect(p[0] * k, p[1] * k, 30 * k, 28 * k); g.stroke();
          if (i === 0 || i === 3) { g.fillRect((p[0] + 8) * k, (p[1] + 9) * k, 14 * k, 10 * k); }
        });
      }),
      gauge: icon(function (g, k) {
        g.lineWidth = 7 * k;
        g.beginPath(); g.arc(50 * k, 56 * k, 33 * k, Math.PI * 0.85, Math.PI * 2.15); g.stroke();
        g.lineWidth = 5 * k;
        g.beginPath(); g.moveTo(50 * k, 56 * k); g.lineTo(70 * k, 34 * k); g.stroke();
        g.beginPath(); g.arc(50 * k, 56 * k, 7 * k, 0, 6.2832); g.fill();
      }),
      check: icon(function (g, k) {
        g.lineWidth = 5.5 * k;
        g.beginPath(); g.rect(18 * k, 18 * k, 64 * k, 64 * k); g.stroke();
        g.lineWidth = 8 * k;
        g.beginPath(); g.moveTo(32 * k, 51 * k); g.lineTo(45 * k, 64 * k); g.lineTo(70 * k, 35 * k); g.stroke();
      }),
      table: icon(function (g, k) {
        g.lineWidth = 4.5 * k;
        g.beginPath(); g.rect(12 * k, 20 * k, 76 * k, 60 * k); g.stroke();
        g.beginPath(); g.moveTo(12 * k, 38 * k); g.lineTo(88 * k, 38 * k); g.stroke();
        g.beginPath(); g.moveTo(12 * k, 56 * k); g.lineTo(88 * k, 56 * k); g.stroke();
        g.beginPath(); g.moveTo(44 * k, 20 * k); g.lineTo(44 * k, 80 * k); g.stroke();
        g.fillRect(16 * k, 24 * k, 24 * k, 10 * k);
      })
    };

    var groups = {};
    var panels = frames.map(function (el) {
      el.__fdPanel = true;
      var c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      el.appendChild(c);
      var g = el.dataset.group || 'default';
      (groups[g] = groups[g] || []).push(el);
      return {
        el: el, c: c, x: c.getContext('2d'),
        icon: ICONS[el.dataset.icon] || ICONS.path,
        dark: el.dataset.tone === 'dark',
        group: g,
        tag: el.querySelector('[data-fd-panel-tag]'),
        ring: el.querySelector('[data-fd-panel-ring]')
      };
    });
    Object.keys(groups).forEach(function (g) {
      groups[g].forEach(function (el, i) { el.__fdIndex = i; el.__fdCount = groups[g].length; });
    });

    function fit(f) {
      var d = Math.min(2, devicePixelRatio || 1), w = f.c.clientWidth, h = f.c.clientHeight;
      if (!w || !h) return false;
      var wantW = Math.round(w * d), wantH = Math.round(h * d);
      if (f.c.width === wantW && f.c.height === wantH) return false;
      f.c.width = wantW; f.c.height = wantH; f.x.setTransform(d, 0, 0, d, 0, 0);
      return true;
    }
    function resize() { panels.forEach(fit); }

    var T = 0, last = performance.now();

    function render(f, w, h, step, live, p, phase) {
      var ic = f.icon, N = ic.N, m = ic.m;
      var breathe = 1 + Math.sin(T * 0.9 + phase * 2.1) * 0.014;
      var size = Math.min(w, h) * 0.92 * breathe;
      var x0 = w / 2 - size / 2, y0 = h / 2 - size / 2;
      var wash = live ? Math.min(1, p * 1.7) : 0;
      var base = f.dark ? 'rgba(243,246,244,' : 'rgba(16,25,23,';
      var lit = f.dark ? 'rgba(127,191,158,' : 'rgba(12,107,90,';
      for (var gy = step; gy < h; gy += step) {
        for (var gx = step; gx < w; gx += step) {
          var u = (gx - x0) / size, v = (gy - y0) / size;
          if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
          var val = m[(v * N | 0) * N + (u * N | 0)];
          if (val < 0.10) continue;
          var n = (Math.sin(u * 9.6 + T * 1.15) + Math.sin(v * 8.2 - T * 0.86) + Math.sin((u + v) * 6.4 + T * 1.4)) / 3;
          var hs = hash(gx, gy);
          var a = (f.dark ? 0.20 : 0.16) + val * 0.34;
          if (val < 0.42) a *= 0.45 + 0.55 * (n * 0.5 + 0.5);
          var col = base;
          if (wash > 0 && (1 - v) < wash) { a = (f.dark ? 0.30 : 0.26) + val * 0.48; col = lit; }
          f.x.fillStyle = col + Math.min(a, 0.86).toFixed(3) + ')';
          f.x.fillText(SET[(((n * 0.5 + 0.5) * 0.7 + hs * 0.3) * SET.length) | 0], gx, gy);
        }
      }
    }

    function draw(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!reduce) T += dt;
      panels.forEach(function (f) {
        var w = f.c.clientWidth, h = f.c.clientHeight;
        if (!w || !h) return;
        fit(f);
        var i = f.el.__fdIndex, count = f.el.__fdCount;
        var cycle = 3.4 * count + 1.4;
        var lt = T % cycle;
        var open = 0.4 + i * 3.4, close = open + 2.9;
        var live = !reduce && lt >= open && lt < close;
        var p = live ? (lt - open) / (close - open) : 0;
        if (f.tag) f.tag.style.color = live ? (f.dark ? '#7FBF9E' : '#0C6B5A') : (f.dark ? '#5E7268' : '#9AA7A1');
        if (f.ring) f.ring.style.boxShadow = 'inset 0 0 0 1px rgba(' + (f.dark ? '127,191,158,' : '12,107,90,') + (live ? '.34' : '0') + ')';
        var step = w < 300 ? 5 : 6;
        f.x.clearRect(0, 0, w, h);
        f.x.textBaseline = 'middle'; f.x.textAlign = 'center';
        f.x.font = step * 0.96 + 'px "JetBrains Mono",monospace';
        render(f, w, h, step, live, p, i);
      });
      requestAnimationFrame(draw);
    }
    addEventListener('resize', resize);
    resize(); requestAnimationFrame(draw);
  }
};
