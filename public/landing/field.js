/* Fundir hero field — ASCII-glyph rendering of the mark, expanding on scroll.
   Authored by the user in uploads/fundir-hero-v9.html; wrapped as an init fn. */
window.FundirField = {
  init: function (c) {
    if (!c || c.__fundirField) return; c.__fundirField = true;
    var x = c.getContext('2d');
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var N = 180, MAP = new Float32Array(N * N), L = 0, t = 0;

    function buildMap() {
      var o = document.createElement('canvas'); o.width = o.height = N;
      var g = o.getContext('2d'), k = N / 100;
      var grad = g.createLinearGradient(12 * k, 10 * k, 92 * k, 86 * k);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.74)');
      grad.addColorStop(1, 'rgba(0,0,0,0.40)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(52 * k, 48 * k, 40 * k, 0, 6.2832); g.fill();

      g.globalCompositeOperation = 'destination-out';
      g.lineCap = 'butt'; g.strokeStyle = '#000'; g.fillStyle = '#000';
      g.lineWidth = 8 * k;
      g.beginPath(); g.moveTo(-4 * k, 43 * k); g.lineTo(61 * k, 43 * k); g.stroke();
      g.beginPath(); g.moveTo(39 * k, 25 * k); g.lineTo(61 * k, 25 * k); g.stroke();
      g.beginPath(); g.moveTo(39.5 * k, 22 * k); g.lineTo(31 * k, 72 * k); g.stroke();
      g.beginPath();
      g.moveTo(61 * k, 16.5 * k); g.lineTo(75 * k, 25 * k); g.lineTo(61 * k, 33.5 * k);
      g.closePath(); g.fill();

      g.globalCompositeOperation = 'destination-in';
      var v = g.createRadialGradient(52 * k, 48 * k, 34 * k, 52 * k, 48 * k, 42 * k);
      v.addColorStop(0, 'rgba(0,0,0,1)');
      v.addColorStop(0.6, 'rgba(0,0,0,0.88)');
      v.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = v; g.fillRect(0, 0, N, N);
      g.globalCompositeOperation = 'source-over';

      var d = g.getImageData(0, 0, N, N).data;
      for (var i = 0; i < N * N; i++) MAP[i] = d[i * 4 + 3] / 255;
    }

    var SET = ['∧', '∨', 'λ', '∧', '∨', '·', '=', '-', ':', '∨', '∧', '·'];

    function resize() {
      var dpr = Math.min(2, devicePixelRatio || 1), w = innerWidth, h = innerHeight;
      c.width = w * dpr; c.height = h * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0);
      L = Math.min(w, h) * (w < 700 ? 0.74 : 0.52);
    }

    function scrollPos() {
      var w = window.scrollY || window.pageYOffset || 0;
      if (w > 0) return w;
      var d = document.scrollingElement || document.documentElement;
      if (d && d.scrollTop > 0) return d.scrollTop;
      var n = c.parentElement;
      while (n) { if (n.scrollTop > 0) return n.scrollTop; n = n.parentElement; }
      return 0;
    }

    function draw() {
      var w = innerWidth, h = innerHeight;
      x.clearRect(0, 0, w, h);
      if (!reduce) t += 0.016;

      var p = Math.min(1, Math.max(0, scrollPos() / h));
      var e = p * p * (3 - 2 * p);

      var scale = L * (1 + e * 2.5);
      var cx = w * (0.53 + e * 0.04), cy = h * (0.515 + e * 0.05);
      var step = w < 700 ? 7 : 8;
      var global = (1 - e * 0.55);

      x.textBaseline = 'middle'; x.textAlign = 'center';
      x.font = step * 0.98 + 'px "JetBrains Mono",monospace';

      var x0 = cx - scale * 0.5, y0 = cy - scale * 0.5;
      var half = step * 0.5;

      for (var gy = half; gy < h; gy += step) {
        for (var gx = half; gx < w; gx += step) {
          var u = (gx - x0) / scale, v = (gy - y0) / scale;
          if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
          var m = MAP[(v * N | 0) * N + (u * N | 0)];
          if (m < 0.07) continue;
          var n = (Math.sin(u * 10.4 + t * 0.95)
            + Math.sin(v * 8.7 - t * 0.74)
            + Math.sin((u + v) * 6.9 + t * 1.22)) / 3;
          var hsh = (((gx * 7301) ^ (gy * 1933)) % 977) / 977;
          var pick = (n * 0.5 + 0.5) * 0.70 + hsh * 0.30;
          var gl = SET[(pick * SET.length) | 0];
          var a = (0.11 + m * 0.38);
          if (m < 0.20) a *= 0.35 + 0.65 * (n * 0.5 + 0.5);
          a *= global;
          x.fillStyle = 'rgba(16,25,23,' + a.toFixed(3) + ')';
          x.fillText(gl, gx, gy);
        }
      }
      requestAnimationFrame(draw);
    }

    addEventListener('resize', function () { resize(); });
    buildMap(); resize(); draw();
  }
};
