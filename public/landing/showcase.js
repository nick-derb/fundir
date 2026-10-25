/* Fundir home page — the motion behind the product cards: expand toggles,
   score rings, the Data Hub reading loop, the bar chart, the morphing network
   behind the stats row, and the relationship-map edges. Every loop starts when
   its card scrolls into view and respects prefers-reduced-motion. */
window.FundirShowcase = {
  init: function (root) {
    root = root || document;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var SAGE = [101, 154, 128], ACC = [12, 107, 90], GOLD = [183, 164, 106];
    function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
    function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function rnd(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
    function onVisible(el, cb) {
      if (!('IntersectionObserver' in window)) { cb(); return; }
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); cb(); } }); }, { threshold: 0.25 });
      io.observe(el);
    }
    function fitCanvas(c) {
      var r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
      if (!r.width || !r.height) return null;
      if (c.width !== Math.round(r.width * d) || c.height !== Math.round(r.height * d)) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); }
      var g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); return { g: g, w: r.width, h: r.height };
    }

    boot(root);

    function boot(scope) {
      /* expand buttons: the card takes the full row */
      [].forEach.call(scope.querySelectorAll('[data-sc-expand]'), function (b) {
        b.addEventListener('click', function () {
          var card = b.closest('.sc-card'); var open = card.classList.toggle('is-open');
          b.setAttribute('aria-expanded', String(open));
          if (open) card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
          window.dispatchEvent(new Event('resize'));
        });
      });


      /* score rings */
      [].forEach.call(scope.querySelectorAll('[data-sc-ring]'), function (svg) {
        var arc = svg.querySelector('[data-arc]'); if (!arc) return;
        var r = +arc.getAttribute('r'), c = 2 * Math.PI * r, score = +svg.getAttribute('data-sc-ring') / 100;
        arc.setAttribute('stroke-dasharray', c); arc.setAttribute('stroke-dashoffset', c);
        arc.style.transition = reduce ? 'none' : 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)';
        onVisible(svg, function () { requestAnimationFrame(function () { arc.setAttribute('stroke-dashoffset', c * (1 - score)); }); });
      });

      /* Data Hub: files are read one after another, then the queue replays */
      [].forEach.call(scope.querySelectorAll('[data-sc-reading]'), function (box) {
        var files = [].slice.call(box.querySelectorAll('.sc-file'));
        var stages = ['Uploading', 'Extracting text', 'Reading', 'Updating profile', 'Indexed'];
        function reset() { files.forEach(function (f) { f.removeAttribute('data-done'); f.querySelector('.sc-prog i').style.width = '0%'; f.querySelector('.sc-stage-lbl').textContent = 'Queued'; }); }
        if (reduce) { files.forEach(function (f) { f.setAttribute('data-done', ''); f.querySelector('.sc-prog i').style.width = '100%'; f.querySelector('.sc-stage-lbl').textContent = 'Indexed'; }); return; }
        onVisible(box, function () {
          function run() {
            reset(); var t = 300;
            files.forEach(function (f) {
              stages.forEach(function (st, i) {
                setTimeout(function () { f.querySelector('.sc-stage-lbl').textContent = st; f.querySelector('.sc-prog i').style.width = ((i + 1) / stages.length * 100) + '%'; if (i === stages.length - 1) f.setAttribute('data-done', ''); }, t);
                t += 420;
              });
              t += 300;
            });
          }
          run(); setInterval(run, 11000);
        });
      });

      /* bar chart */
      [].forEach.call(scope.querySelectorAll('[data-sc-chart]'), function (ch) { onVisible(ch, function () { ch.classList.add('is-live'); }); });


      /* morphing network behind the stats row */
      [].forEach.call(scope.querySelectorAll('[data-sc-viz]'), function (box) {
        var c = box.querySelector('canvas'), stats = [].slice.call(scope.querySelectorAll('[data-sc-stat]'));
        var L = 84, K = 28, R = rnd(23), seedL = [], seedR = [], seedA = [], seedT = [];
        for (var i = 0; i < L; i++) { seedL.push(R()); seedR.push(R()); seedA.push(R()); seedT.push(R()); }
        var order = seedR.map(function (v, i) { return [v, i]; }).sort(function (a, b) { return a[0] - b[0]; }).map(function (x) { return x[1]; });
        function targets(mode, w, h) {
          var out = [];
          for (var i = 0; i < L; i++) {
            var line = [], u = i / (L - 1);
            if (mode === 0) { /* braid: board (left) through the organization (pinch) to funders (right) */
              var yl = h * (0.22 + 0.7 * u), yr = h * (0.22 + 0.7 * (order[i] / (L - 1))), xl = w * (0.1 + 0.07 * seedT[i]), xr = w * (0.76 + 0.14 * seedA[i]), px = w * 0.5, py = h * 0.78 + (seedA[i] - 0.5) * 10;
              for (var k = 0; k < K; k++) { var t = k / (K - 1), x, y; if (t < 0.5) { var s = t * 2; x = xl + (px - xl) * s; y = (1 - s) * (1 - s) * yl + 2 * (1 - s) * s * yl + s * s * py; } else { var s2 = (t - 0.5) * 2; x = px + (xr - px) * s2; y = (1 - s2) * (1 - s2) * py + 2 * (1 - s2) * s2 * yr + s2 * s2 * yr; } line.push([x, y]); }
            } else if (mode === 1) { /* burst: every trustee read from a filing, radiating from one source */
              var ang = -Math.PI + 0.12 + (Math.PI - 0.24) * u + (seedA[i] - 0.5) * 0.05, rad = h * (0.42 + 0.55 * seedT[i]), ox = w * 0.5, oy = h * 0.985;
              for (var k2 = 0; k2 < K; k2++) { var t2 = k2 / (K - 1); line.push([ox + Math.cos(ang) * rad * t2, oy + Math.sin(ang) * rad * t2]); }
            } else if (mode === 2) { /* globe: passages on the surface of the corpus */
              var lat = 0.06 + 1.35 * seedT[i], lon0 = -1.35 + 2.0 * seedL[i], dl = 0.5 + 0.9 * seedA[i], cx = w * 0.5, cy = h * 0.96, Rr = h * 0.66;
              for (var k3 = 0; k3 < K; k3++) { var t3 = k3 / (K - 1), lon = lon0 + dl * t3; line.push([cx + Rr * Math.cos(lat) * Math.sin(lon), cy - Rr * Math.sin(lat) * 0.92 + Rr * Math.cos(lat) * Math.cos(lon) * 0.22]); }
            } else { /* spiral ribbon: paths found over time */
              var tt = u * Math.PI * 4, x4 = w * 0.5 + w * 0.3 * Math.cos(tt), ytop = h * 0.3 + u * h * 0.3 + Math.sin(tt) * h * 0.07, ybot = h * 0.98;
              for (var k4 = 0; k4 < K; k4++) { var t4 = k4 / (K - 1); line.push([x4, ytop + (ybot - ytop) * t4]); }
            }
            out.push(line);
          }
          return out;
        }
        var cur = null, from = null, to = null, t0 = 0, mode = 0, hover = null, raf2, lastW = 0, lastH = 0, auto;
        function setMode(m, instant) { var f = fitCanvas(c); if (!f) return; mode = m; from = cur || targets(m, f.w, f.h); to = targets(m, f.w, f.h); t0 = instant ? -1e9 : performance.now(); stats.forEach(function (s, i) { s.setAttribute('aria-pressed', String(i === m)); }); }
        function frame(ts) {
          var f = fitCanvas(c); if (!f) { raf2 = requestAnimationFrame(frame); return; }
          var g = f.g, w = f.w, h = f.h;
          if (w !== lastW || h !== lastH) { lastW = w; lastH = h; from = cur = targets(mode, w, h); to = targets(mode, w, h); }
          var p = Math.min(1, (ts - t0) / 1100), e = ease(p);
          cur = to.map(function (line, i) { return line.map(function (pt, k) { var a = from[i][k]; return [a[0] + (pt[0] - a[0]) * e, a[1] + (pt[1] - a[1]) * e]; }); });
          g.clearRect(0, 0, w, h);
          for (var i = 0; i < L; i++) {
            var line = cur[i], a = line[0], b = line[K - 1];
            var grad = g.createLinearGradient(a[0], a[1], b[0], b[1]); grad.addColorStop(0, rgba(SAGE, 0.25)); grad.addColorStop(0.55, rgba(SAGE, 0.75)); grad.addColorStop(1, rgba(ACC, 0.95));
            g.strokeStyle = grad; g.lineWidth = 0.9 + seedT[i] * 0.7; g.beginPath(); g.moveTo(a[0], a[1]);
            for (var k = 1; k < K; k++) g.lineTo(line[k][0], line[k][1]);
            g.stroke();
            g.fillStyle = rgba(ACC, 0.9); g.beginPath(); g.arc(b[0], b[1], 1.6 + seedT[i] * 1.2, 0, 6.283); g.fill();
            g.fillStyle = rgba(SAGE, 0.55); g.beginPath(); g.arc(a[0], a[1], 1.2, 0, 6.283); g.fill();
          }
          raf2 = requestAnimationFrame(frame);
        }
        stats.forEach(function (s, i) {
          s.addEventListener('mouseenter', function () { hover = i; setMode(i); });
          s.addEventListener('focus', function () { hover = i; setMode(i); });
          s.addEventListener('click', function () { hover = i; setMode(i); });
          s.addEventListener('mouseleave', function () { hover = null; });
        });
        onVisible(box, function () {
          setMode(0, true); raf2 = requestAnimationFrame(frame);
          if (!reduce) auto = setInterval(function () { if (hover === null) setMode((mode + 1) % 4); }, 4200);
        });
      });

      /* relationship map edges (variant C): drawn between the placed cards */
      [].forEach.call(scope.querySelectorAll('[data-sc-map]'), function (map) {
        var inner = map.querySelector('.sc-map-inner'), svg = map.querySelector('svg.sc-edges'), W = 748, H = 440;
        function fit() {
          var s = Math.min(1, (map.clientWidth || W) / W);
          inner.style.transform = 'scale(' + s + ')';
          if (map.parentNode && map.parentNode.classList.contains('sc-stage')) map.parentNode.style.minHeight = Math.round(H * s) + 'px';
          return s;
        }
        function draw() {
          var s = fit(), r0 = inner.getBoundingClientRect(); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.innerHTML = '';
          [].forEach.call(inner.querySelectorAll('.sc-mcard[data-parent]'), function (card) {
            var par = inner.querySelector('#' + card.getAttribute('data-parent')); if (!par) return;
            var a = par.getBoundingClientRect(), b = card.getBoundingClientRect();
            var x1 = (a.left - r0.left + a.width / 2) / s, y1 = (a.bottom - r0.top) / s, x2 = (b.left - r0.left + b.width / 2) / s, y2 = (b.top - r0.top) / s, my = (y1 + y2) / 2;
            var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            p.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + my + ' ' + x2 + ' ' + my + ' ' + x2 + ' ' + y2);
            var on = card.hasAttribute('data-path'), ws = card.hasAttribute('data-ws');
            p.setAttribute('fill', 'none'); p.setAttribute('stroke', on ? '#0C6B5A' : ws ? '#C0852B' : '#B8C3BE'); p.setAttribute('stroke-width', on ? '2' : '1.25');
            var ver = card.getAttribute('data-ver'); if (ver === 'probable') p.setAttribute('stroke-dasharray', '6 4'); if (ver === 'inferred') p.setAttribute('stroke-dasharray', '2 4');
            if (card.hasAttribute('data-dim')) p.setAttribute('opacity', '0.35');
            svg.appendChild(p);
          });
        }
        draw(); window.addEventListener('resize', draw); setTimeout(draw, 400); setTimeout(draw, 1200);
      });
    }
  }
};
