/* Odyssey Myth Atlas — Canvas engine */
(function () {
  'use strict';

  const CFG = Object.assign(
    {
      bbox: { lon0: -12, lat0: 28, lon1: 42, lat1: 48 },
      startBook: 1,
      endBook: 24,
    },
    DATA.config || {}
  );

  const D = Math.PI / 180;
  const PJ = Object.assign({ lon0: 20, lat0: 38 }, CFG.projection || {});
  const EE = {
    A1: 1.340264,
    A2: -0.081106,
    A3: 0.000893,
    A4: 0.003796,
    M: Math.sqrt(3) / 2,
  };

  function projEE(lat, lon) {
    let dl = lon - PJ.lon0;
    while (dl > 180) dl -= 360;
    while (dl < -180) dl += 360;
    const th = Math.asin(EE.M * Math.sin(lat * D));
    const lam = dl * D;
    const t2 = th * th;
    const t6 = t2 * t2 * t2;
    const den = EE.A1 + 3 * EE.A2 * t2 + t6 * (7 * EE.A3 + 9 * EE.A4 * t2);
    return [
      (lam * Math.cos(th)) / (EE.M * den),
      -th * (EE.A1 + EE.A2 * t2 + t6 * (EE.A3 + EE.A4 * t2)),
    ];
  }

  const B = CFG.bbox;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const dla = (B.lat1 - B.lat0) / 40;
  const dlo = (B.lon1 - B.lon0) / 60;
  for (let la = B.lat0; la <= B.lat1 + 1e-9; la += dla) {
    for (let lo = B.lon0; lo <= B.lon1 + 1e-9; lo += dlo) {
      const p = projEE(la, lo);
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
    }
  }
  const WB = { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  const RW = 1000;
  const RH = Math.round(RW * (WB.h / WB.w));
  const w2rx = (x) => ((x - WB.x0) / WB.w) * RW;
  const w2ry = (y) => ((y - WB.y0) / WB.h) * RH;

  function projR(lat, lon) {
    const p = projEE(lat, lon);
    return [w2rx(p[0]), w2ry(p[1])];
  }

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  const PLACES = DATA.places || [];
  const PLACE_IDX = {};
  PLACES.forEach((p, i) => {
    p._i = i;
    PLACE_IDX[p.id] = p;
    const pr = projR(p.lat, p.lon);
    p.rx = pr[0];
    p.ry = pr[1];
  });

  const ROUTES = (DATA.routes || []).map((r) => {
    r._pts = r.path.map((pt) => {
      const pr = projR(pt.lat, pt.lon);
      return { ...pt, rx: pr[0], ry: pr[1] };
    });
    return r;
  });

  const BOOKS = DATA.books || [];
  const BEATS = DATA.beats || [];
  const CHARACTERS = DATA.characters || [];
  const FACTIONS = DATA.factions || [];
  const THEMES = DATA.themes || [];
  const MYTHOLOGY = DATA.mythology || {};
  const FILM = DATA.film || {};

  let mode = 'journey';
  let curBook = 1;
  let layers = { route: 1, places: 1, legendary: 1, grid: 0 };
  let theme = 'day';
  let filmOpen = false;
  let tourStep = 0;
  let searchOpen = false;

  const mapEl = $('#map');
  const tlEl = $('#tlcanvas');
  const stage = $('#stage');
  const tip = $('#tip');
  const loading = $('#loading');

  let mapCtx, tlCtx;
  let view = { x: 0, y: 0, scale: 1 };
  let dragging = false;
  let dragStart = null;
  let viewStart = null;
  let hoveredPlace = null;
  let playing = false;
  let playTimer = null;

  function hideLoading() {
    if (loading) loading.style.display = 'none';
  }

  function confLabel(c) {
    if (c === 'disputed') return '学界争议';
    if (c === 'legendary') return '传说层';
    return '学界主流';
  }

  function confBadge(c) {
    const cls =
      c === 'legendary' ? 'badge-legend' : c === 'disputed' ? 'badge-disputed' : 'badge-consensus';
    return `<span class="badge ${cls}">${confLabel(c)}</span>`;
  }

  function bookBeats(book) {
    return BEATS.filter((b) => b.book === book);
  }

  function bookAt(n) {
    return BOOKS.find((b) => b.book === n);
  }

  function renderRight() {
    const body = $('#rbody');
    if (!body) return;

    if (filmOpen) {
      let castHtml = (FILM.cast || [])
        .map((c) => `<li><b>${c.actor}</b> — ${c.role}</li>`)
        .join('');
      let mapHtml = (FILM.epicMapping || [])
        .map(
          (m) =>
            `<tr><td>卷 ${m.book}</td><td>${m.epic}</td><td class="film-note">${m.filmNote}</td></tr>`
        )
        .join('');
      body.innerHTML = `
        <div class="ttl">${FILM.title || '电影导读'}</div>
        <div class="sub">${FILM.releaseDate || ''} · ${FILM.studio || ''}</div>
        <p>${FILM.officialLogline || ''}</p>
        <div class="kv"><span>导演</span><b>${FILM.director || ''}</b></div>
        <div class="kv"><span>格式</span><b>${FILM.format || ''}</b></div>
        <div class="kv"><span>片长</span><b>${FILM.runtime || ''}</b></div>
        <p class="section-h">阵容（公开报道）</p>
        <ul class="cast-list">${castHtml}</ul>
        <p class="section-h">史诗章节对照</p>
        <table class="film-table"><thead><tr><th>卷</th><th>史诗</th><th>电影注</th></tr></thead><tbody>${mapHtml}</tbody></table>
        <p class="disclaimer">${FILM.disclaimer || ''}</p>
      `;
      return;
    }

    const b = bookAt(curBook);
    if (!b) return;

    if (mode === 'mythos') {
      const pantheon = (MYTHOLOGY.pantheon || [])
        .map(
          (g) =>
            `<div class="myth-card"><b>${g.name}</b> <i>${g.greek}</i><br><span class="dim">${g.domain}</span><br>${g.odysseyRole}</div>`
        )
        .join('');
      const sections = (MYTHOLOGY.sections || [])
        .map(
          (s) =>
            `<div class="myth-section"><h4>${s.title} ${confBadge(s.confidence)}</h4><p>${s.text}</p></div>`
        )
        .join('');
      body.innerHTML = `
        <div class="ttl">${MYTHOLOGY.title || '神话谱系'}</div>
        <div class="sub">赫西俄德神谱 · 史诗语境</div>
        ${sections}
        <p class="section-h">奥林匹斯与奥德赛</p>
        <div class="myth-grid">${pantheon}</div>
      `;
      return;
    }

    const beats = bookBeats(curBook);
    const beatHtml = beats
      .map(
        (beat) =>
          `<div class="beat-card" data-place="${beat.placeId || ''}"><b>${beat.title}</b> ${confBadge(beat.confidence)}<p>${beat.text}</p></div>`
      )
      .join('');

    const chars = CHARACTERS.filter((c) => c.books && c.books.includes(curBook))
      .map((c) => `<span class="char-tag">${c.name}</span>`)
      .join('');

    body.innerHTML = `
      <div class="ttl">${b.title}</div>
      <div class="sub">${b.subtitle || ''} · 卷 ${b.book}</div>
      ${confBadge(b.confidence)}
      <p><b>局势</b> ${b.situation || ''}</p>
      <p>${b.narrative || ''}</p>
      ${b.filmNote ? `<p class="film-inline"><b>电影注</b> ${b.filmNote}</p>` : ''}
      <p class="section-h">本卷情节节点</p>
      ${beatHtml}
      ${chars ? `<p class="section-h">本卷人物</p><div class="char-tags">${chars}</div>` : ''}
    `;

    $$('.beat-card').forEach((el) => {
      el.addEventListener('click', () => {
        const pid = el.dataset.place;
        if (pid && PLACE_IDX[pid]) focusPlace(PLACE_IDX[pid]);
      });
    });
  }

  function renderLeft() {
    const legend = $('#legend');
    if (!legend) return;

    if (mode === 'books') {
      legend.innerHTML = BOOKS.map(
        (b) =>
          `<div class="lg ${b.book === curBook ? 'active' : ''}" data-book="${b.book}"><span class="sw" style="background:var(--aegean)"></span><b>卷 ${b.book}</b><i>${b.title.replace(/^第.+卷：/, '')}</i></div>`
      ).join('');
      $$('#legend .lg').forEach((el) => {
        el.addEventListener('click', () => setBook(+el.dataset.book));
      });
      return;
    }

    if (mode === 'mythos') {
      legend.innerHTML = FACTIONS.map(
        (f) =>
          `<div class="lg"><span class="sw" style="background:${f.color}"></span><b>${f.name}</b><i>${f.desc.slice(0, 28)}…</i></div>`
      ).join('');
      return;
    }

    legend.innerHTML = PLACES.map((p) => {
      const active = bookBeats(curBook).some((bt) => bt.placeId === p.id);
      const dash = p.confidence === 'legendary' ? 'legendary' : '';
      return `<div class="lg ${active ? 'active' : ''} ${dash}" data-place="${p.id}"><span class="sw ${dash}" style="background:${p.kind === 'legendary' ? 'transparent' : 'var(--aegean)'}"></span><b>${p.name}</b><i>${p.greek || ''}</i></div>`;
    }).join('');

    $$('#legend .lg').forEach((el) => {
      el.addEventListener('click', () => {
        const p = PLACE_IDX[el.dataset.place];
        if (p) focusPlace(p);
      });
    });
  }

  function setBook(n) {
    curBook = clamp(n, CFG.startBook, CFG.endBook);
    $('#yBig').textContent = `卷 ${curBook}`;
    const b = bookAt(curBook);
    if (b && $('#yEra1')) $('#yEra1').textContent = b.approxYear
      ? `约公元前 ${Math.abs(b.approxYear)} 年（史诗时间层）`
      : '';
    renderRight();
    renderLeft();
    drawMap();
    drawTimeline();
  }

  function setMode(m) {
    mode = m;
    $$('#modes button').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.mode === m ? 'true' : 'false');
    });
    filmOpen = false;
    renderRight();
    renderLeft();
    drawMap();
  }

  function focusPlace(p) {
    const cx = stage.clientWidth / 2;
    const cy = stage.clientHeight / 2;
    const sx = stage.clientWidth / RW;
    const sy = stage.clientHeight / RH;
    const base = Math.min(sx, sy) * 0.92;
    view.scale = base * 2.2;
    view.x = cx - p.rx * view.scale;
    view.y = cy - p.ry * view.scale;
    showPlaceDetail(p);
    drawMap();
  }

  function showPlaceDetail(p) {
    const body = $('#rbody');
    if (!body || filmOpen) return;
    const beats = BEATS.filter((bt) => bt.placeId === p.id);
    const beatHtml = beats
      .map((bt) => `<li><b>卷 ${bt.book}</b> ${bt.title} — ${bt.text}</li>`)
      .join('');
    body.innerHTML = `
      <div class="ttl">${p.name}</div>
      <div class="sub">${p.greek || ''}</div>
      ${confBadge(p.confidence)}
      <p>${p.note || ''}</p>
      ${beatHtml ? `<p class="section-h">相关情节</p><ul class="place-beats">${beatHtml}</ul>` : ''}
    `;
  }

  function drawBackground(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (theme === 'night') {
      g.addColorStop(0, '#0a1628');
      g.addColorStop(0.5, '#122a3d');
      g.addColorStop(1, '#0f1419');
    } else {
      g.addColorStop(0, '#d4e8f0');
      g.addColorStop(0.45, '#a8d4e6');
      g.addColorStop(1, '#e8dcc8');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawMap() {
    if (!mapCtx) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    mapEl.width = w;
    mapEl.height = h;
    mapCtx.clearRect(0, 0, w, h);
    drawBackground(mapCtx, w, h);

    mapCtx.save();
    mapCtx.translate(view.x, view.y);
    mapCtx.scale(view.scale, view.scale);

    if (layers.grid) {
      mapCtx.strokeStyle = theme === 'night' ? 'rgba(200,220,240,.12)' : 'rgba(30,77,107,.15)';
      mapCtx.lineWidth = 1 / view.scale;
      for (let x = 0; x <= RW; x += 50) {
        mapCtx.beginPath();
        mapCtx.moveTo(x, 0);
        mapCtx.lineTo(x, RH);
        mapCtx.stroke();
      }
      for (let y = 0; y <= RH; y += 50) {
        mapCtx.beginPath();
        mapCtx.moveTo(0, y);
        mapCtx.lineTo(RW, y);
        mapCtx.stroke();
      }
    }

    if (layers.route) {
      ROUTES.forEach((route) => {
        if (route.id === 'telemachus' && mode !== 'books') return;
        const pts = route._pts;
        if (!pts.length) return;
        mapCtx.beginPath();
        mapCtx.moveTo(pts[0].rx, pts[0].ry);
        for (let i = 1; i < pts.length; i++) {
          mapCtx.lineTo(pts[i].rx, pts[i].ry);
        }
        const isMain = route.id === 'main_journey';
        mapCtx.strokeStyle = route.color || '#1e4d6b';
        mapCtx.lineWidth = (isMain ? 3 : 2) / view.scale;
        if (!isMain) mapCtx.setLineDash([8 / view.scale, 6 / view.scale]);
        mapCtx.stroke();
        mapCtx.setLineDash([]);
      });

      const main = ROUTES.find((r) => r.id === 'main_journey');
      if (main && playing) {
        const prog = (curBook - 1) / (CFG.endBook - CFG.startBook);
        const idx = Math.floor(prog * (main._pts.length - 1));
        const t = prog * (main._pts.length - 1) - idx;
        const a = main._pts[idx];
        const b = main._pts[Math.min(idx + 1, main._pts.length - 1)];
        const px = lerp(a.rx, b.rx, t);
        const py = lerp(a.ry, b.ry, t);
        mapCtx.beginPath();
        mapCtx.arc(px, py, 6 / view.scale, 0, Math.PI * 2);
        mapCtx.fillStyle = '#a0522d';
        mapCtx.fill();
      }
    }

    if (layers.places) {
      const activePlaces = new Set(bookBeats(curBook).map((b) => b.placeId));
      PLACES.forEach((p) => {
        if (p.confidence === 'legendary' && !layers.legendary) return;
        const active = activePlaces.has(p.id);
        const r = (active ? 7 : 5) / view.scale;
        mapCtx.beginPath();
        if (p.confidence === 'legendary') {
          mapCtx.setLineDash([4 / view.scale, 3 / view.scale]);
          mapCtx.strokeStyle = '#8b7355';
          mapCtx.lineWidth = 2 / view.scale;
          mapCtx.arc(p.rx, p.ry, r, 0, Math.PI * 2);
          mapCtx.stroke();
          mapCtx.setLineDash([]);
        } else {
          mapCtx.arc(p.rx, p.ry, r, 0, Math.PI * 2);
          mapCtx.fillStyle = active ? '#a0522d' : '#1e4d6b';
          mapCtx.fill();
          mapCtx.strokeStyle = theme === 'night' ? '#e8dcc8' : '#f4f0e8';
          mapCtx.lineWidth = 1.5 / view.scale;
          mapCtx.stroke();
        }
        if (view.scale > 1.5 || active) {
          mapCtx.font = `${11 / view.scale}px EB Garamond, serif`;
          mapCtx.fillStyle = theme === 'night' ? '#e8dcc8' : '#1a2332';
          mapCtx.fillText(p.name, p.rx + 8 / view.scale, p.ry - 4 / view.scale);
        }
      });
    }

    mapCtx.restore();
  }

  function drawTimeline() {
    if (!tlCtx) return;
    const wrap = $('#tlwrap');
    const w = wrap ? wrap.clientWidth : 800;
    const h = 48;
    tlEl.width = w;
    tlEl.height = h;
    tlCtx.clearRect(0, 0, w, h);
    tlCtx.fillStyle = theme === 'night' ? '#1a2332' : '#e8dcc8';
    tlCtx.fillRect(0, 0, w, h);

    const pad = 24;
    const total = CFG.endBook - CFG.startBook;
    const x = pad + ((curBook - CFG.startBook) / total) * (w - 2 * pad);

    tlCtx.strokeStyle = theme === 'night' ? '#4a6a8a' : '#1e4d6b';
    tlCtx.lineWidth = 2;
    tlCtx.beginPath();
    tlCtx.moveTo(pad, h / 2);
    tlCtx.lineTo(w - pad, h / 2);
    tlCtx.stroke();

    for (let i = CFG.startBook; i <= CFG.endBook; i++) {
      const bx = pad + ((i - CFG.startBook) / total) * (w - 2 * pad);
      tlCtx.beginPath();
      tlCtx.arc(bx, h / 2, i === curBook ? 6 : 3, 0, Math.PI * 2);
      tlCtx.fillStyle = i === curBook ? '#a0522d' : '#1e4d6b';
      tlCtx.fill();
    }

    tlCtx.beginPath();
    tlCtx.arc(x, h / 2, 8, 0, Math.PI * 2);
    tlCtx.fillStyle = '#a0522d';
    tlCtx.fill();
  }

  function mapToWorld(mx, my) {
    return [(mx - view.x) / view.scale, (my - view.y) / view.scale];
  }

  function hitPlace(mx, my) {
    const [wx, wy] = mapToWorld(mx, my);
    const tol = 12 / view.scale;
    let best = null;
    let bestD = tol;
    PLACES.forEach((p) => {
      const d = Math.hypot(p.rx - wx, p.ry - wy);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    });
    return best;
  }

  function showTip(p, mx, my) {
    if (!p) {
      tip.classList.remove('on');
      return;
    }
    tip.innerHTML = `<b>${p.name}</b><div class="k">${p.greek || ''} · ${confLabel(p.confidence)}</div>`;
    tip.style.left = mx + 12 + 'px';
    tip.style.top = my + 12 + 'px';
    tip.classList.add('on');
  }

  function fitView() {
    const sx = stage.clientWidth / RW;
    const sy = stage.clientHeight / RH;
    const base = Math.min(sx, sy) * 0.92;
    view.scale = base;
    view.x = (stage.clientWidth - RW * view.scale) / 2;
    view.y = (stage.clientHeight - RH * view.scale) / 2;
    drawMap();
  }

  function buildSearchIndex() {
    const items = [];
    BOOKS.forEach((b) =>
      items.push({ type: '卷', label: `卷 ${b.book} ${b.title}`, action: () => setBook(b.book) })
    );
    PLACES.forEach((p) =>
      items.push({ type: '地点', label: p.name, action: () => focusPlace(p) })
    );
    CHARACTERS.forEach((c) =>
      items.push({
        type: '人物',
        label: c.name,
        action: () => {
          if (c.books && c.books[0]) setBook(c.books[0]);
        },
      })
    );
    THEMES.forEach((t) =>
      items.push({ type: '母题', label: t.name, action: () => {} })
    );
    return items;
  }

  let searchIndex = [];

  function openSearch() {
    searchOpen = true;
    const ov = $('#srchOv');
    if (ov) {
      ov.classList.add('on');
      const inp = $('#srchIn');
      if (inp) {
        inp.value = '';
        inp.focus();
        renderSearch('');
      }
    }
  }

  function renderSearch(q) {
    const list = $('#srchList');
    if (!list) return;
    const ql = q.toLowerCase();
    const hits = searchIndex.filter((it) => it.label.toLowerCase().includes(ql)).slice(0, 20);
    list.innerHTML = hits
      .map(
        (it, i) =>
          `<div class="srch-item" data-i="${i}"><span class="srch-type">${it.type}</span>${it.label}</div>`
      )
      .join('');
    $$('.srch-item').forEach((el) => {
      el.addEventListener('click', () => {
        const it = hits[+el.dataset.i];
        if (it) {
          it.action();
          searchOpen = false;
          $('#srchOv').classList.remove('on');
        }
      });
    });
  }

  function showTour() {
    const steps = CFG.tour || [];
    const card = $('#tourCard');
    if (!card || !steps.length) return;
    tourStep = clamp(tourStep, 0, steps.length - 1);
    const s = steps[tourStep];
    card.innerHTML = `
      <div class="tour-inner">
        <h3>${s.title}</h3>
        <p>${s.text}</p>
        <div class="tour-btns">
          <button id="tourPrev">${tourStep > 0 ? '上一步' : ''}</button>
          <button id="tourNext">${tourStep < steps.length - 1 ? '下一步' : '完成'}</button>
          <button id="tourClose">关闭</button>
        </div>
      </div>
    `;
    card.classList.add('on');
    $('#tourPrev')?.addEventListener('click', () => {
      tourStep--;
      showTour();
    });
    $('#tourNext')?.addEventListener('click', () => {
      if (tourStep < steps.length - 1) {
        tourStep++;
        showTour();
      } else card.classList.remove('on');
    });
    $('#tourClose')?.addEventListener('click', () => card.classList.remove('on'));
  }

  function initEvents() {
    $$('#modes button').forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    $('#filmBtn')?.addEventListener('click', () => {
      filmOpen = true;
      renderRight();
    });

    $('#themeBtn')?.addEventListener('click', () => {
      theme = theme === 'day' ? 'night' : 'day';
      document.documentElement.setAttribute('data-theme', theme === 'night' ? 'night' : '');
      drawMap();
      drawTimeline();
    });

    $('#srchBtn')?.addEventListener('click', openSearch);
    $('#srchOv')?.addEventListener('click', (e) => {
      if (e.target.id === 'srchOv') {
        searchOpen = false;
        e.currentTarget.classList.remove('on');
      }
    });
    $('#srchIn')?.addEventListener('input', (e) => renderSearch(e.target.value));

    $('#tourBtn')?.addEventListener('click', () => {
      tourStep = 0;
      showTour();
    });

    $('#zin')?.addEventListener('click', () => {
      view.scale *= 1.25;
      drawMap();
    });
    $('#zout')?.addEventListener('click', () => {
      view.scale /= 1.25;
      drawMap();
    });
    $('#zfit')?.addEventListener('click', fitView);

    $('#pPrev')?.addEventListener('click', () => setBook(curBook - 1));
    $('#pNext')?.addEventListener('click', () => setBook(curBook + 1));
    $('#pPlay')?.addEventListener('click', () => {
      playing = !playing;
      $('#pPlay').textContent = playing ? '■' : '▶';
      if (playing) {
        playTimer = setInterval(() => {
          if (curBook >= CFG.endBook) {
            playing = false;
            clearInterval(playTimer);
            $('#pPlay').textContent = '▶';
            return;
          }
          setBook(curBook + 1);
        }, 1800);
      } else clearInterval(playTimer);
    });

    $$('.lay input').forEach((inp) => {
      inp.addEventListener('change', () => {
        layers[inp.dataset.layer] = inp.checked ? 1 : 0;
        drawMap();
      });
    });

    mapEl.addEventListener('mousedown', (e) => {
      dragging = true;
      dragStart = [e.clientX, e.clientY];
      viewStart = [view.x, view.y];
      mapEl.classList.add('drag');
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) {
        const rect = mapEl.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        hoveredPlace = hitPlace(mx, my);
        showTip(hoveredPlace, e.clientX - rect.left, e.clientY - rect.top);
        return;
      }
      view.x = viewStart[0] + (e.clientX - dragStart[0]);
      view.y = viewStart[1] + (e.clientY - dragStart[1]);
      drawMap();
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      mapEl.classList.remove('drag');
    });
    mapEl.addEventListener('click', (e) => {
      const rect = mapEl.getBoundingClientRect();
      const p = hitPlace(e.clientX - rect.left, e.clientY - rect.top);
      if (p) showPlaceDetail(p);
    });

    tlEl.addEventListener('click', (e) => {
      const rect = tlEl.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const pad = 24;
      const w = rect.width;
      const total = CFG.endBook - CFG.startBook;
      const book = Math.round(((mx - pad) / (w - 2 * pad)) * total) + CFG.startBook;
      setBook(book);
    });

    $('#leftTgl')?.addEventListener('click', () => $('#left').classList.toggle('open'));
    $('#rightTgl')?.addEventListener('click', () => $('#right').classList.toggle('open'));

    window.addEventListener('resize', () => {
      fitView();
      drawTimeline();
    });
  }

  function init() {
    mapCtx = mapEl.getContext('2d');
    tlCtx = tlEl.getContext('2d');
    searchIndex = buildSearchIndex();
    initEvents();
    setBook(1);
    fitView();
    drawTimeline();
    hideLoading();
  }

  init();
})();
