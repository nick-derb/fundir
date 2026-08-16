/* Fundir automated-prospecting demo — 4-step pipeline ending in a shared sheet
   with three live cursors. Ported from uploads/fundir-prospecting-demo-v4.html;
   class toggles converted to inline style writes. */
window.FundirProspecting = {
  init: function (scene) {
    if (!scene || scene.__fundirProspecting) return; scene.__fundirProspecting = true;
    var q = function (s) { return scene.querySelector('[data-p="' + s + '"]'); };
    var qa = function (s) { return [].slice.call(scene.querySelectorAll('[data-p="' + s + '"]')); };
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var ACCENT = '#0C6B5A', SAGE = '#659A80', FAINT = '#9AA7A1', RULE = '#DFE5E2', INK = '#101917';

    var c = q('bg'), x = c.getContext('2d'), T = 0;
    var GL = ['∧', '∨', 'λ', '·', '=', '-', ':'];
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
      var cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.48;
      for (var gy = 4; gy < h; gy += step) for (var gx = 4; gx < w; gx += step) {
        var d = Math.hypot(gx - cx, gy - cy) / R; if (d > 1) continue;
        var n = (Math.sin(gx * 0.02 + T * 0.9) + Math.sin(gy * 0.017 - T * 0.7) + Math.sin((gx + gy) * 0.012 + T * 1.1)) / 3;
        var a = (0.09 + (1 - d) * 0.13) * (0.55 + 0.45 * (n * 0.5 + 0.5));
        x.fillStyle = 'rgba(16,25,23,' + a.toFixed(3) + ')';
        x.fillText(GL[(((n * 0.5 + 0.5) * 0.7 + (((gx * 7301) ^ (gy * 1933)) % 977) / 977 * 0.3) * GL.length) | 0], gx, gy);
      }
    }

    var RAW = [
      '&lt;Return returnVersion="2024v5.0"&gt;',
      '  &lt;ReturnHeader&gt;',
      '    &lt;Filer&gt;&lt;EIN&gt;363689171&lt;/EIN&gt;',
      '    &lt;BusinessNameLine1Txt&gt;ROBERT R MCCORMICK FOUNDATION',
      '  &lt;IRS990PF&gt;',
      '    &lt;SupplementaryInformationGrp&gt;',
      '      <u style="color:' + ACCENT + ';text-decoration:none">OnlyContriToPreselectedInd</u>: true',
      '      &lt;GrantOrContributionPdDurYrGrp&gt;',
      '        &lt;RecipientPersonNm/&gt;',
      '        &lt;RecipientBusinessName&gt;...',
      '        &lt;Amt&gt;150000&lt;/Amt&gt;',
      '        &lt;GrantOrContributionPurposeTxt&gt;EARLY',
      '          CHILDHOOD EDUCATION PROGRAMMING'
    ];

    var L = [0, 1, 2, 3].map(function (i) { return q('l' + i); });
    var S = [0, 1, 2, 3].map(function (i) { return q('s' + i); });
    var B = [0, 1, 2].map(function (i) { return q('b' + i); });
    var raw = q('raw'), tick = q('tick');
    var t1 = qa('t1row'), ctxItems = qa('ctx'), join = q('join');
    var sheet = q('sheet'), gbRows = qa('gbrow'), who = qa('who'), savedtxt = q('savedtxt');

    var USERS = [
      { n: 'A. Reyes', c: ACCENT, sel: q('sel0'), cur: q('cur0'), from: [0.10, 1.02], row: 0, col: 'status', move: [1.5, 2.7], act: 2.9, text: 'Outreach sent' },
      { n: 'J. Marsh', c: '#9C7A2A', sel: q('sel1'), cur: q('cur1'), from: [1.04, 0.16], row: 3, col: 'owner', move: [4.3, 5.4], act: 5.6, text: 'JM' },
      { n: 'D. Cole', c: '#5B7383', sel: q('sel2'), cur: q('cur2'), from: [0.52, 1.06], row: 4, col: 'status', move: [7.0, 8.1], act: 8.3, text: 'Check board link' }
    ];
    USERS.forEach(function (u) {
      u.sel.style.borderColor = u.c;
      u.sel.querySelector('span').style.background = u.c;
      u.cur.innerHTML = '<svg width="15" height="19" viewBox="0 0 15 19" style="position:absolute;top:0;left:0"><path d="M1 1 L1 15 L4.6 11.6 L7 17.4 L9.6 16.2 L7.2 10.6 L12 10.6 Z" fill="' + u.c + '" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"></path></svg>';
    });

    function cellBox(r, cname) {
      var tr = gbRows[r]; if (!tr) return null;
      var td = tr.querySelector('[data-c="' + cname + '"]'); if (!td) return null;
      var a = td.getBoundingClientRect(), b = sheet.getBoundingClientRect();
      return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
    }
    function resetSheet() {
      gbRows.forEach(function (tr) {
        tr.style.opacity = '0';
        [].forEach.call(tr.children, function (td) { td.style.background = ''; });
        [].forEach.call(tr.querySelectorAll('[data-c]'), function (td) { td.textContent = ''; });
      });
      who.forEach(function (b) { b.style.opacity = '0'; b.style.transform = 'scale(.7)'; });
      USERS.forEach(function (u) { u.sel.style.opacity = '0'; u.cur.style.opacity = '0'; });
      savedtxt.textContent = 'Saved';
    }
    function reset() {
      L.forEach(function (e) { e.style.opacity = '0'; });
      setStep(-1);
      t1.forEach(function (r) { r.style.opacity = '0'; r.style.transform = 'translateY(3px)'; });
      ctxItems.forEach(function (r) { r.style.opacity = '0'; r.style.transform = 'translateY(6px)'; });
      join.style.opacity = '0';
      raw.innerHTML = ''; tick.textContent = 'Idle';
    }
    function setStep(i) {
      S.forEach(function (e, k) {
        var num = e.querySelector('[data-p="stn"]'), lab = e.querySelector('[data-p="stl"]');
        var on = k === i, done = k < i;
        num.style.background = on ? ACCENT : '#fff';
        num.style.borderColor = on ? ACCENT : done ? SAGE : RULE;
        num.style.color = on ? '#fff' : done ? SAGE : FAINT;
        lab.style.color = on ? INK : FAINT;
      });
      B.forEach(function (e, k) { e.style.transform = 'scaleX(' + (k < i ? 1 : 0) + ')'; });
      L.forEach(function (e, k) { e.style.opacity = k === i ? '1' : '0'; });
    }

    var CYCLE = 25.5, t = 0, last = performance.now();
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible) { requestAnimationFrame(frame); return; }
      if (!reduce) { T += dt; t += dt; }
      else if (t < 22.0) { t = 22.0; }
      if (t > CYCLE) { t = 0; reset(); resetSheet(); }
      rz(); bg();

      if (t < 0.8) { /* idle */ }
      else if (t < 4.6) {
        setStep(0);
        var p = (t - 0.8) / 3.8;
        raw.innerHTML = RAW.slice(0, Math.floor(p * RAW.length) + 1).join('\n');
        tick.textContent = Math.floor(p * 8412).toLocaleString() + ' filings parsed';
      }
      else if (t < 8.6) {
        setStep(1);
        var p2 = (t - 4.6) / 4.0;
        tick.textContent = 'Resolved to EIN';
        t1.forEach(function (r, i) { if (p2 > 0.12 + i * 0.16) { r.style.opacity = '1'; r.style.transform = 'none'; } });
      }
      else if (t < 12.4) {
        setStep(2);
        var p3 = (t - 8.6) / 3.8;
        tick.textContent = 'Applying CYC context';
        ctxItems.forEach(function (r, i) { if (p3 > 0.06 + i * 0.10) { r.style.opacity = '1'; r.style.transform = 'none'; } });
        if (p3 > 0.72) join.style.opacity = '1';
      }
      else {
        setStep(3);
        var p4 = t - 12.4;
        tick.textContent = '27 ranked · 3 editing';
        gbRows.forEach(function (tr, i) { if (p4 > 0.15 + i * 0.11) tr.style.opacity = '1'; });
        who.forEach(function (b, i) { if (p4 > 1.0 + i * 0.16) { b.style.opacity = '1'; b.style.transform = 'none'; } });

        var editing = false;
        USERS.forEach(function (u) {
          var box = cellBox(u.row, u.col); if (!box) return;
          var W = sheet.clientWidth, H = sheet.clientHeight;
          if (p4 < u.move[0]) { u.cur.style.opacity = '0'; u.sel.style.opacity = '0'; return; }
          var k = Math.min(1, (p4 - u.move[0]) / (u.move[1] - u.move[0]));
          var e = k * k * (3 - 2 * k);
          var sx = u.from[0] * W, sy = u.from[1] * H;
          var tx = box.x + box.w * 0.42, ty = box.y + box.h * 0.55;
          u.cur.style.opacity = '1';
          u.cur.style.transform = 'translate(' + (sx + (tx - sx) * e).toFixed(1) + 'px,' + (sy + (ty - sy) * e).toFixed(1) + 'px)';
          if (k >= 1) {
            u.sel.style.opacity = '1';
            u.sel.style.left = box.x + 'px'; u.sel.style.top = box.y + 'px';
            u.sel.style.width = box.w + 'px'; u.sel.style.height = box.h + 'px';
          }
          if (p4 > u.act) {
            editing = true;
            var td = gbRows[u.row].querySelector('[data-c="' + u.col + '"]');
            var kk = Math.min(1, (p4 - u.act) / 0.9);
            td.textContent = u.text.slice(0, Math.ceil(kk * u.text.length));
            td.style.fontSize = '11.5px';
            td.style.color = (u.col === 'status') ? INK : u.c;
            if (u.col === 'owner') { td.style.fontFamily = "'JetBrains Mono',monospace"; td.style.fontSize = '10.5px'; }
            if (kk >= 1 && u.row === 4) {
              [].forEach.call(gbRows[4].children, function (cell) { cell.style.background = '#F4F9F6'; });
            }
          }
        });
        savedtxt.textContent = editing ? 'Saving…' : 'Saved';
      }
      requestAnimationFrame(frame);
    }
    reset(); resetSheet();

    var visible = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && e.intersectionRatio >= 0.3) { if (!visible) { reset(); resetSheet(); t = reduce ? 22.0 : 0; } visible = true; }
          else if (!e.isIntersecting) { visible = false; }
        });
      }, { threshold: [0, 0.3] }).observe(scene);
    } else { visible = true; }
    addEventListener('resize', rz);
    rz(); requestAnimationFrame(frame);
  }
};
