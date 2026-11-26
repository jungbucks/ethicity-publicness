/* Browser-only completion certificates. No identity verification or backend.
 * Keep this standalone file identical across the five independent games. */
(function (root) {
  'use strict';
  function create(options) {
    var key = 'completion-certificate.' + options.game + '.v1';
    var storage = options.storage;
    var crypto = options.crypto || root.crypto;
    var locks = options.locks || (root.navigator && root.navigator.locks);
    var seen = null, blocked = false;
    try { if (!storage) storage = root.localStorage; } catch (_) { blocked = true; }
    var storageMessage = '인증서을 저장할 수 없어요. 브라우저의 사이트 저장을 허용한 뒤 새로고침해 주세요.';
    // 번호 = 접두어 + 6자리(헷갈리는 0·1·I·O 제외). 회차 값(run)에서 뽑으므로 다시 저장해도 같다. 서버 검증용이 아니다.
    var ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    function idOf(run) {
      var s = ''; for (var i = 0; i < 6; i++) s += ALPHA[parseInt(run.substr(i * 2, 2), 16) & 31];
      return options.prefix + '-' + s;
    }
    function oldIdOf(run) { return options.prefix + '-' + run.match(/.{8}/g).join('-'); }   // 긴 번호로 저장된 옛 기록도 읽는다
    function validName(value) {
      if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(value)) throw Error('이름을 확인해 주세요.');
      var name = value.trim();
      if (!name.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Mark}\u2800\u3164\uffa0]/gu, '') || Array.from(name).length > 30) throw Error('이름은 1~30자로 입력해 주세요.');
      return name;
    }
    function read() {
      try {
        if (blocked || !storage) throw Error();
        var raw = storage.getItem(key);
        if (raw === null) return null;
        var r = JSON.parse(raw);
        if (!r || r.v !== 1 || r.game !== options.game || !/^[A-F0-9]{32}$/.test(r.run) ||
            !(r.completedAt === null || (typeof r.completedAt === 'string' && Number.isFinite(Date.parse(r.completedAt)))) ||
            !(r.name === null || validName(r.name) === r.name) ||
            !(r.completedAt ? (r.id === idOf(r.run) || r.id === oldIdOf(r.run)) : r.id === null) ||
            (r.name !== null && !r.completedAt)) throw Error();
        return { v: 1, game: r.game, run: r.run, id: r.completedAt ? idOf(r.run) : null, completedAt: r.completedAt, name: r.name };
      } catch (_) { throw Error(storageMessage); }
    }
    function write(r) {
      try {
        var raw = JSON.stringify(r);
        storage.setItem(key, raw);
        if (storage.getItem(key) !== raw) throw Error();
      } catch (_) { throw Error(storageMessage); }
      return Object.assign({}, r);
    }
    function token() {
      if (!crypto || !crypto.getRandomValues) throw Error('이 브라우저에서는 인증서 번호를 만들 수 없어요. 최신 브라우저에서 열어 주세요.');
      return Array.from(crypto.getRandomValues(new Uint8Array(16)), function (n) { return n.toString(16).padStart(2, '0'); }).join('').toUpperCase();
    }
    function checked() {
      var r = read();
      if (seen && (!r || r.run !== seen)) throw Error('다른 탭에서 새 게임을 시작했어요. 새로고침한 뒤 이어서 진행해 주세요.');
      if (r) seen = r.run;
      return r;
    }
    function lock(fn) {
      if (!locks || !locks.request) return Promise.reject(Error('인증서 발급에는 HTTPS 주소와 최신 브라우저가 필요해요. 선생님이 안내한 주소로 다시 열어 주세요.'));
      return locks.request(key, fn);
    }
    // Establish identity at page load, before a legacy completed-save tab can adopt a new run.
    var ready = lock(function () {
      var r = read();
      if (!r) r = write({ v: 1, game: options.game, run: token(), completedAt: null, name: null, id: null });
      seen = r.run;
    });
    ready.catch(function () { /* Shown by mount; never break game startup. */ });
    function begin() {
      // Only the game's confirmed new-game/reset path calls this method.
      return ready.then(function () { return lock(function () {
        checked();
        var r = { v: 1, game: options.game, run: token(), completedAt: null, name: null, id: null };
        write(r); seen = r.run; blocked = false;
        return r;
      }); }).catch(function () { blocked = true; return null; });
    }
    function completeNow() {
      var r = checked();
      if (!r) {
        r = { v: 1, game: options.game, run: token(), completedAt: null, name: null, id: null };
      }
      if (!r.completedAt) {
        r.completedAt = new Date().toISOString();
        r.id = idOf(r.run);
        write(r);
      }
      seen = r.run;
      return Object.assign({}, r);
    }
    function issueNow(name) {
      var r = checked();
      if (!r || !r.completedAt) throw Error('게임을 끝까지 완료한 뒤 발급할 수 있어요.');
      if (r.name !== null) return r;
      r.name = validName(name);
      return write(r);
    }
    function complete() { return ready.then(function () { return lock(completeNow); }); }
    function issue(name) { return ready.then(function () { return lock(function () { return issueNow(name); }); }); }
    function get() { return ready.then(checked); }
    // Game save adapters can refuse stale-tab writes without making gameplay asynchronous.
    function current() {
      if (!seen) return true;
      try { var r = read(); return !!r && r.run === seen; } catch (_) { return true; }
    }
    function block() { blocked = true; }
    function dateText(r) {
      // Explicit time zone keeps downloaded text stable if the device time zone changes.
      return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(r.completedAt)) + ' (한국 시간)';
    }
    // ── 색: 게임마다 script 태그의 data-paper·data-ink·data-accent(#rrggbb)로 넘긴다. 없으면 흰 바탕·청록 ──
    function rgb(value, fallback) {
      var m = /^#([0-9a-f]{6})$/i.exec(value || '');
      var h = m ? m[1] : fallback;
      return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
    }
    function mix(a, b, t) { return 'rgb(' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); }).join(',') + ')'; }
    var PAPER = rgb(options.paper, 'ffffff'), INK = rgb(options.ink, '16201f'), ACCENT = rgb(options.accent, '0f766e');
    var C = {
      paper: mix(PAPER, PAPER, 0), ink: mix(INK, INK, 0), accent: mix(ACCENT, ACCENT, 0),
      mute: mix(INK, PAPER, 0.32), line: mix(PAPER, INK, 0.16), tint: mix(PAPER, ACCENT, 0.14),
      on: (0.299 * ACCENT[0] + 0.587 * ACCENT[1] + 0.114 * ACCENT[2]) > 150 ? '#14161f' : '#fff'
    };
    var FONT = 'px Pretendard, "Malgun Gothic", sans-serif';
    var extra = {};   // mount(container, { art: 인물 그림 주소(투명 배경), bg: 배경 그림 주소, lines: [{ label, value }] }) — 게임이 덧붙이는 것(없어도 된다)
    var FOCUS = Math.max(0, Math.min(1, parseFloat(options.artFocus)));   // 배경 그림에서 보여 줄 곳(가로 0~1)
    if (!isFinite(FOCUS)) FOCUS = 0.7;
    function dayText(r) {
      return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(r.completedAt));
    }
    // 회차 값(run)으로 도는 난수 — 인증서마다 별자리 무늬가 다르고, 같은 인증서는 다시 저장해도 같다
    function rng(run) {
      var a = parseInt(run.substr(8, 8), 16) >>> 0;
      return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
    function starPath(ctx, x, y, r, rot) {
      ctx.beginPath();
      for (var i = 0; i < 10; i++) { var rr = i % 2 ? r * 0.44 : r, an = rot - Math.PI / 2 + i * Math.PI / 5; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
      ctx.closePath();
    }
    // art = { bg: 배경 그림(화면 가득), figure: 인물 그림(투명 배경, 오른쪽 아래) } — 둘 다 없어도 된다
    function draw(r, art, lines) {
      art = art || {};
      var W = 1600, H = 1000;
      var canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext('2d');
      if (!ctx) throw Error('이미지를 만들 수 없어요. 다른 브라우저에서 다시 시도해 주세요.');
      var rnd = rng(r.run || '00000000000000000000000000000000');
      var dark = (0.299 * PAPER[0] + 0.587 * PAPER[1] + 0.114 * PAPER[2]) < 128;
      ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
      // ① 배경 그림: 높이에 맞춰 키우고, 그림의 초점(options.artFocus 0~1)이 화면 오른쪽 3/4 지점에 오게. 왼쪽은 바탕색으로 덮인다
      if (art.bg) {
        var k = Math.max(H / art.bg.height, W * 0.62 / art.bg.width), bw = art.bg.width * k, bh = art.bg.height * k;
        var bx = Math.max(W - bw, Math.min(W * 0.74 - bw * FOCUS, W * 0.36));
        ctx.drawImage(art.bg, bx, (H - bh) / 2, bw, bh);
      } else {
        // 그림이 없으면 강조색 빛 두 덩이
        [[W * 0.78, H * 0.42, 620, 0.34], [W * 0.98, H * 0.95, 520, 0.22]].forEach(function (g) {
          var gr = ctx.createRadialGradient(g[0], g[1], 0, g[0], g[1], g[2]);
          gr.addColorStop(0, rgba(ACCENT, g[3])); gr.addColorStop(1, rgba(ACCENT, 0));
          ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
        });
      }
      // ② 글 자리: 왼쪽은 바탕색, 오른쪽으로 갈수록 그림이 드러난다
      var veil = ctx.createLinearGradient(0, 0, W, 0);
      veil.addColorStop(0, rgba(PAPER, 1)); veil.addColorStop(0.4, rgba(PAPER, 0.97)); veil.addColorStop(0.62, rgba(PAPER, art.bg ? 0.55 : 0.2)); veil.addColorStop(0.8, rgba(PAPER, art.bg ? 0.08 : 0)); veil.addColorStop(1, rgba(PAPER, 0));
      ctx.fillStyle = veil; ctx.fillRect(0, 0, W, H);
      // ③ 이 인증서만의 별자리(회차 값으로 정해진다)
      var pts = [];
      for (var i = 0; i < 46; i++) pts.push({ x: W * (0.6 + rnd() * 0.37), y: H * (0.06 + rnd() * 0.5), s: 2 + rnd() * 4, a: 0.35 + rnd() * 0.6 });
      var link = pts.slice(0, 7).sort(function (p, q) { return p.x - q.x; });
      var starCol = art.bg && !dark ? PAPER : ACCENT;
      ctx.strokeStyle = rgba(starCol, 0.38); ctx.lineWidth = 2; ctx.beginPath();
      link.forEach(function (p, j) { ctx[j ? 'lineTo' : 'moveTo'](p.x, p.y); }); ctx.stroke();
      pts.forEach(function (p, j) {
        ctx.fillStyle = rgba(starCol, p.a);
        if (j < 7) { starPath(ctx, p.x, p.y, 9 + p.s * 2, rnd() * 6); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 0.7, 0, Math.PI * 2); ctx.fill(); }
      });
      // ④ 인물(투명 배경 그림): 오른쪽 아래
      if (art.figure) {
        var fk = Math.min(620 / art.figure.width, 800 / art.figure.height), fw = art.figure.width * fk, fh = art.figure.height * fk;
        ctx.drawImage(art.figure, W * 0.775 - fw / 2, H - 46 - fh, fw, fh);
      }
      // ⑤ 테두리: 두 줄 + 네 귀 별
      ctx.strokeStyle = rgba(ACCENT, 0.9); ctx.lineWidth = 3; ctx.strokeRect(34, 34, W - 68, H - 68);
      ctx.strokeStyle = rgba(ACCENT, 0.4); ctx.lineWidth = 1.5; ctx.strokeRect(46, 46, W - 92, H - 92);
      [[40, 40], [W - 40, 40], [40, H - 40], [W - 40, H - 40]].forEach(function (p) {
        ctx.fillStyle = C.paper; ctx.beginPath(); ctx.arc(p[0], p[1], 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.accent; starPath(ctx, p[0], p[1], 15, 0); ctx.fill();
      });
      function text(value, x, y, size, weight, color, max, spacing) {
        ctx.fillStyle = color || C.ink;
        ctx.font = (weight || 400) + ' ' + size + FONT;
        if (spacing && 'letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
        while (max && ctx.measureText(value).width > max && size > 20) { size -= 1; ctx.font = (weight || 400) + ' ' + size + FONT; }
        ctx.fillText(value, x, y);
        if (spacing && 'letterSpacing' in ctx) ctx.letterSpacing = '0px';
        return ctx.measureText(value).width;
      }
      // ⑥ 글
      var x = 116, max = 760;
      text('CERTIFICATE OF COMPLETION', x, 142, 22, 600, C.accent, max, 7);
      text('인증서', x, 214, 54, 800, C.accent);
      text(r.name, x, 392, 132, 800, null, max);
      ctx.fillStyle = C.accent; ctx.fillRect(x, 428, 96, 8);
      text(options.title, x, 520, 50, 800, null, max);
      text('게임을 끝까지 마쳤습니다.', x, 578, 30, 400, C.mute);
      (lines || []).slice(0, 3).forEach(function (row, n) {
        var y = 668 + n * 54;
        text(String(row.label), x, y, 24, 400, C.mute, 180);
        text(String(row.value), x + 196, y, 27, 600, null, max - 196);
      });
      // 번호표(오른쪽 위가 살짝 잘린 표 모양) + 날짜
      var by = 852, bw2;
      ctx.font = '800 30' + FONT; bw2 = ctx.measureText(r.id).width + 150;
      ctx.fillStyle = C.accent; ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + bw2 - 22, by); ctx.lineTo(x + bw2, by + 22); ctx.lineTo(x + bw2, by + 64); ctx.lineTo(x, by + 64); ctx.closePath(); ctx.fill();
      text('No.', x + 22, by + 43, 24, 600, C.on);
      text(r.id, x + 74, by + 44, 30, 800, C.on);
      text(dateText(r), x + bw2 + 26, by + 42, 24, 400, C.mute);
      // ⑦ 인장: 둥근 글자 띠 + 가운데 별 — 살짝 기울여 찍은 도장처럼
      var sx = 880, sy = 300, R = 118;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(-0.21);
      ctx.fillStyle = rgba(PAPER, 0.92); ctx.beginPath(); ctx.arc(0, 0, R + 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.accent; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R - 34, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.accent; ctx.font = '800 23' + FONT; ctx.textAlign = 'center';
      var ring = 'GAME CLEAR ★ ' + dayText(r).replace(/\s/g, '').replace(/\.$/, '') + ' ★ ';
      Array.from(ring).forEach(function (ch, n, all) {
        ctx.save(); ctx.rotate(n / all.length * Math.PI * 2); ctx.fillText(ch, 0, -(R - 25)); ctx.restore();
      });
      starPath(ctx, 0, -26, 30, 0); ctx.fill();
      ctx.font = '800 44' + FONT; ctx.fillText('완주', 0, 48);
      ctx.restore(); ctx.textAlign = 'left';
      return canvas;
    }
    function loadImage(src) {
      if (!src) return Promise.resolve(null);
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { resolve(img); }; img.onerror = function () { resolve(null); };   // 그림을 못 읽으면 그림 없이 그린다
        img.src = src;
      });
    }
    async function png() {
      var r = await get();
      if (!r || !r.name) throw Error('이름을 확정한 뒤 저장해 주세요.');
      if (document.fonts && document.fonts.load) {   // 캔버스는 아직 안 쓴 굵기를 스스로 불러오지 않는다
        try { await Promise.all([400, 600, 800].map(function (w) { return document.fonts.load(w + ' 40px Pretendard', '인증서 Aa1'); })); } catch (_) {}
      }
      var loaded = await Promise.all([loadImage(extra.bg || options.art), loadImage(extra.art || options.figure)]);
      // Recheck after awaiting fonts: another tab may have started a new game.
      r = await get();
      var canvas = draw(r, { bg: loaded[0], figure: loaded[1] }, extra.lines);
      return new Promise(function (resolve, reject) {
        try { canvas.toBlob(function (blob) { if (blob) resolve({ blob: blob, record: r }); else reject(Error('PNG 저장에 실패했어요. 다시 눌러 주세요.')); }, 'image/png'); }
        catch (_) { reject(Error('이 주소에서는 그림을 저장할 수 없어요. 선생님이 안내한 주소로 다시 열어 주세요.')); }
      });
    }
    function mount(container, extras) {
      if (!container) return;
      extra = extras || {};
      var old = container.querySelector('[data-completion-certificate]');
      if (old) old.remove();
      var section = document.createElement('section');
      section.className = 'completion-certificate'; section.dataset.completionCertificate = options.game;
      section.setAttribute('aria-label', '게임 인증서');
      ['paper', 'ink', 'accent', 'mute', 'line', 'tint', 'on'].forEach(function (n) { section.style.setProperty('--cc-' + n, C[n]); });
      container.appendChild(section);
      var shown = null;   // 미리보기 그림 주소(다시 그릴 때 놓아 준다)
      var opened = false; // [인증서 받기]를 눌렀나
      function node(tag, value, cls) {
        var n = document.createElement(tag); if (value) n.textContent = value; if (cls) n.className = cls; return n;
      }
      async function render() {
        section.replaceChildren();
        if (shown) { URL.revokeObjectURL(shown); shown = null; }
        section.appendChild(node('p', '인증서', 'cc-eyebrow'));
        section.appendChild(node('h3', options.title));
        section.appendChild(node('p', '게임을 끝까지 마쳤습니다.'));
        var status = node('p', '', 'cc-status'); status.setAttribute('role', 'status');
        var r;
        try { r = await complete(); } catch (e) { status.textContent = e.message; section.appendChild(status); return; }
        if (!section.isConnected) return;
        if (!r.name && !opened) {
          var cta = node('button', '인증서 받기', 'cc-cta'); cta.type = 'button';
          cta.addEventListener('click', async function () { opened = true; await render(); var first = section.querySelector('input'); if (first) first.focus(); });
          section.appendChild(cta);
          section.appendChild(node('p', '이름을 넣으면 나만의 인증서 그림을 받을 수 있어요.', 'cc-note'));
        } else if (!r.name) {
          var form = node('form');
          var label = node('label', '인증서에 사용할 이름');
          var input = node('input'); input.type = 'text'; input.name = 'certificateName'; input.autocomplete = 'name'; input.maxLength = 60; input.required = true;
          label.appendChild(input); form.appendChild(label);
          form.appendChild(node('p', '이름은 한 번만 확정할 수 있어요. 발급 후에는 변경할 수 없어요.', 'cc-note'));
          var submit = node('button', '이 이름으로 발급'); submit.type = 'submit'; form.appendChild(submit);
          form.addEventListener('submit', async function (event) {
            event.preventDefault(); if (submit.disabled) return;
            var name;
            try { name = validName(input.value); } catch (e) { status.textContent = e.message; input.focus(); return; }
            if (!root.confirm('“' + name + '” 이름으로 발급할까요? 발급 후 이름은 바꿀 수 없어요.')) return;
            submit.disabled = true;
            try {
              await issue(name);
              await render(); var download = section.querySelector('.cc-download'); if (download) download.focus();
            } catch (e) { status.textContent = e.message; submit.disabled = false; }
          });
          section.appendChild(form);
        } else {
          var fileName = options.game + '-' + r.id + '.png';
          var view = node('img', '', 'cc-preview'); view.width = 1600; view.height = 1000;
          view.alt = r.name + ' 인증서. ' + options.title + ' 게임을 끝까지 마쳤습니다. 완료 일시 ' + dateText(r) + ', 인증서 번호 ' + r.id;
          section.appendChild(view);
          var result = null;
          try { result = await png(); shown = URL.createObjectURL(result.blob); view.src = shown; }
          catch (e) { view.remove(); section.appendChild(node('p', r.name + ' · ' + r.id, 'cc-name')); status.textContent = e.message; }
          if (!section.isConnected) return;
          var row = node('div', '', 'cc-actions');
          var download = node('button', '인증서 PNG 저장', 'cc-download'); download.type = 'button';
          download.addEventListener('click', async function () {
            if (download.disabled) return; download.disabled = true; status.textContent = '이미지를 준비하고 있어요.';
            try {
              result = await png();
              var url = URL.createObjectURL(result.blob), a = document.createElement('a');
              a.href = url; a.download = options.game + '-' + result.record.id + '.png';
              document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
              status.textContent = 'PNG 다운로드를 요청했어요. 저장한 이미지를 선생님이 안내한 Padlet에 올려 주세요.';
            } catch (e) { status.textContent = e.message; }
            download.disabled = false;
          });
          row.appendChild(download);
          // 휴대폰: 내려받기가 막힌 브라우저에서도 공유 창으로 사진에 저장할 수 있다
          var file = null;
          try { if (result && root.File && root.navigator.canShare) { file = new File([result.blob], fileName, { type: 'image/png' }); if (!root.navigator.canShare({ files: [file] })) file = null; } } catch (_) { file = null; }
          if (file) {
            var share = node('button', '공유·사진에 저장', 'cc-share'); share.type = 'button';
            share.addEventListener('click', async function () {
              try { await root.navigator.share({ files: [file], title: options.title + ' 인증서' }); }
              catch (e) { if (e && e.name !== 'AbortError') status.textContent = '공유 창을 열지 못했어요. 위 그림을 길게 눌러 저장해 주세요.'; }
            });
            row.appendChild(share);
          }
          section.appendChild(row);
          section.appendChild(node('p', '저장이 안 되면 위 그림을 길게 눌러 저장하세요. 다시 저장해도 이름과 번호는 같아요. 저장한 그림을 Padlet에 올려 주세요.', 'cc-note'));
        }
        section.appendChild(status);
      }
      render();
      return section;
    }
    return { begin: begin, complete: complete, issue: issue, get: get, current: current, block: block, mount: mount, png: png, draw: draw };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { create: create };
  else {
    root.CompletionCertificate = { create: create };
    var script = document.currentScript;
    if (script && script.dataset.game) root.GameCertificate = create({ game: script.dataset.game, prefix: script.dataset.prefix, title: script.dataset.title, art: script.dataset.art, figure: script.dataset.figure, artFocus: script.dataset.artFocus, paper: script.dataset.paper, ink: script.dataset.ink, accent: script.dataset.accent });
  }
})(typeof window !== 'undefined' ? window : globalThis);
