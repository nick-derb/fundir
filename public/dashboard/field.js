/* Fundir hero field — ASCII-glyph rendering of the mark, centered (no scroll).
   Used on the dashboard "Ask Fundir" card. window.FundirField.init(canvas). */
window.FundirField = {
  init: function (c) {
    if (!c || c.__fundirField) return; c.__fundirField = true;
    var x = c.getContext('2d');
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var N = 180, MAP = new Float32Array(N * N), L = 0, STEP = 8, t = 0;

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
      g.beginPath(); g.moveTo(39 * k, 25 * k); g.lineTo(63 * k, 25 * k); g.stroke();
      g.beginPath(); g.moveTo(39.5 * k, 22 * k); g.lineTo(31 * k, 72 * k); g.stroke();
      g.beginPath();
      g.moveTo(59 * k, 16.5 * k); g.lineTo(75 * k, 25 * k); g.lineTo(59 * k, 33.5 * k);
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
      var dpr = Math.min(2, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      var wantW = Math.round(w * dpr), wantH = Math.round(h * dpr);
      if (c.width !== wantW || c.height !== wantH) { c.width = wantW; c.height = wantH; x.setTransform(dpr, 0, 0, dpr, 0, 0); }
      L = Math.min(w, h) * 0.92;
      STEP = Math.max(4, Math.min(8, Math.round(L / 30)));
    }

    function draw() {
      resize();
      var w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) { requestAnimationFrame(draw); return; }
      x.clearRect(0, 0, w, h);
      if (!reduce) t += 0.016;

      var scale = L;
      var cx = w * 0.5, cy = h * 0.5;
      var step = STEP;
      var global = 1;

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
          var a = (0.30 + m * 0.82);
          if (m < 0.20) a *= 0.55 + 0.45 * (n * 0.5 + 0.5);
          a *= global;
          x.fillStyle = 'rgba(58,110,88,' + a.toFixed(3) + ')';
          x.fillText(gl, gx, gy);
        }
      }
      requestAnimationFrame(draw);
    }

    addEventListener('resize', function () { resize(); });
    buildMap(); resize(); draw();
  }
};
