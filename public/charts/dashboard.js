/* Fundir console charts — bars, sparklines and progress meters drawn on
   canvas so they read crisply at any density. Every canvas carries
   data-chart="bars|spark" and data-values="1,2,3"; bars accept
   data-live="n" to pale everything past index n. */
window.FundirCharts = {
  init: function (root) {
    root = root || document;
    var nodes = [].slice.call(root.querySelectorAll('[data-chart]')).filter(function (c) { return !c.__fdChart; });
    if (!nodes.length) return;
    var SAGE = '101,154,128', DEEP = '12,107,90', FAINT = '205,214,209';

    var charts = nodes.map(function (c) {
      c.__fdChart = true;
      return {
        c: c, x: c.getContext('2d'),
        kind: c.dataset.chart,
        vals: (c.dataset.values || '').split(',').map(Number),
        live: c.dataset.live ? +c.dataset.live : 1e9,
        tone: c.dataset.tone || 'sage'
      };
    });

    function fit(f) {
      var d = Math.min(2, devicePixelRatio || 1), w = f.c.clientWidth, h = f.c.clientHeight;
      if (!w || !h) return false;
      var ww = Math.round(w * d), hh = Math.round(h * d);
      if (f.c.width === ww && f.c.height === hh) return false;
      f.c.width = ww; f.c.height = hh; f.x.setTransform(d, 0, 0, d, 0, 0);
      return true;
    }

    function bars(f, w, h, p) {
      var v = f.vals, n = v.length, max = Math.max.apply(null, v) || 1;
      var gap = Math.max(3, w * 0.012), bw = (w - gap * (n - 1)) / n;
      v.forEach(function (val, i) {
        var grow = Math.max(0, Math.min(1, (p - i * 0.035) / 0.5));
        var bh = (val / max) * h * grow;
        var past = i < f.live;
        f.x.fillStyle = 'rgba(' + (past ? SAGE : FAINT) + ',' + (past ? 0.92 : 0.85) + ')';
        f.x.fillRect(i * (bw + gap), h - bh, bw, bh);
      });
    }

    function spark(f, w, h, p) {
      var v = f.vals, n = v.length;
      var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), span = (hi - lo) || 1;
      var pad = 3, X = function (i) { return (i / (n - 1)) * w; };
      var Y = function (k) { return pad + (1 - (k - lo) / span) * (h - pad * 2); };
      var upto = Math.max(1, Math.floor(p * (n - 1)));
      f.x.beginPath(); f.x.moveTo(0, h);
      for (var i = 0; i <= upto; i++) f.x.lineTo(X(i), Y(v[i]));
      f.x.lineTo(X(upto), h); f.x.closePath();
      var g = f.x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(' + SAGE + ',.20)'); g.addColorStop(1, 'rgba(' + SAGE + ',0)');
      f.x.fillStyle = g; f.x.fill();
      f.x.beginPath();
      for (var j = 0; j <= upto; j++) { var fx = X(j), fy = Y(v[j]); j ? f.x.lineTo(fx, fy) : f.x.moveTo(fx, fy); }
      f.x.strokeStyle = 'rgba(' + DEEP + ',.85)'; f.x.lineWidth = 1.4; f.x.lineJoin = 'round'; f.x.stroke();
      if (p >= 1) {
        f.x.beginPath(); f.x.arc(X(n - 1), Y(v[n - 1]), 2.4, 0, 6.2832);
        f.x.fillStyle = 'rgb(' + DEEP + ')'; f.x.fill();
      }
    }

    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var started = new WeakMap();
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && !started.has(e.target)) started.set(e.target, performance.now()); });
    }, { threshold: 0.25 }) : null;
    charts.forEach(function (f) { io ? io.observe(f.c) : started.set(f.c, performance.now()); });

    function frame(now) {
      charts.forEach(function (f) {
        var w = f.c.clientWidth, h = f.c.clientHeight;
        if (!w || !h) return;
        fit(f);
        var t0 = started.get(f.c);
        var p = (reduce || !t0) ? (t0 || reduce ? 1 : 0) : Math.min(1, (now - t0) / 900);
        if (!t0 && !reduce) p = 0;
        f.x.clearRect(0, 0, w, h);
        if (p <= 0) return;
        f.kind === 'spark' ? spark(f, w, h, p) : bars(f, w, h, p);
      });
      requestAnimationFrame(frame);
    }
    addEventListener('resize', function () { charts.forEach(fit); });
    requestAnimationFrame(frame);
  }
};
