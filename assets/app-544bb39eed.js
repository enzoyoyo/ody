/* Odyssey Myth Atlas — Nolan cinematic engine */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const CFG = Object.assign(
    { bbox: { lon0: -12, lat0: 28, lon1: 42, lat1: 48 }, startBook: 1, endBook: 24 },
    DATA.config || {}
  );

  const D = Math.PI / 180;
  const PJ = Object.assign({ lon0: 20, lat0: 38 }, CFG.projection || {});
  const EE = { A1: 1.340264, A2: -0.081106, A3: 0.000893, A4: 0.003796, M: Math.sqrt(3) / 2 };

  function projEE(lat, lon) {
    let dl = lon - PJ.lon0;
    while (dl > 180) dl -= 360;
    while (dl < -180) dl += 360;
    const th = Math.asin(EE.M * Math.sin(lat * D));
    const lam = dl * D;
    const t2 = th * th;
    const t6 = t2 * t2 * t2;
    const den = EE.A1 + 3 * EE.A2 * t2 + t6 * (7 * EE.A3 + 9 * EE.A4 * t2);
    return [(lam * Math.cos(th)) / (EE.M * den), -th * (EE.A1 + EE.A2 * t2 + t6 * (EE.A3 + EE.A4 * t2))];
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
  const easeOut = (t) => 1 - (1 - t) ** 3;

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

  const IMG_BASE = (window.__CDN__ || '') + 'assets/images/';
  const bgImg = new Image();
  bgImg.src = IMG_BASE + 'map-ocean-night.jpg';
  const filmHero = IMG_BASE + 'film-odyssey-hero.jpg';

  let mode = 'journey';
  let curBook = 1;
  let layers = { route: 1, places: 1, legendary: 1, particles: 1 };
  let theme = 'night';
  let filmOpen = false;
  let tourStep = 0;
  let animTime = 0;
  let playing = false;
  let playTimer = null;
  let routeReveal = 0;
  let bookAnim = 1;

  const mapEl = $('#map');
  const tlEl = $('#tlcanvas');
  const stage = $('#stage');
  const tip = $('#tip');
  let mapCtx, tlCtx;
  let dragging = false;
  let dragStart = null;
  let viewStart = null;
  let hoveredPlace = null;

  const cam = { x: 0, y: 0, scale: 1, tx: 0, ty: 0, ts: 1 };
  const particles = Array.from({ length: 120 }, () => ({
    x: Math.random() * RW,
    y: Math.random() * RH,
    r: 0.5 + Math.random() * 2.5,
    ph: Math.random() * TAU,
    sp: 0.3 + Math.random() * 1.2,
    drift: 0.2 + Math.random() * 0.6,
  }));
  const wake = Array.from({ length: 24 }, () => ({ x: 0, y: 0, life: 0 }));
  let shipPulse = 0;

  function confLabel(c) {
    if (c === 'disputed') return '学界争议';
    if (c === 'legendary') return '传说层';
    return '学界主流';
  }
  function confBadge(c) {
    const cls = c === 'legendary' ? 'badge-legend' : c === 'disputed' ? 'badge-disputed' : 'badge-consensus';
    return `<span class="badge ${cls}">${confLabel(c)}</span>`;
  }
  function bookBeats(book) {
    return BEATS.filter((b) => b.book === book);
  }
  function bookAt(n) {
    return BOOKS.find((b) => b.book === n);
  }

  function pointAlong(pts, t) {
    if (!pts.length) return { x: 0, y: 0, a: 0 };
    const total = pts.length - 1;
    const ft = clamp(t, 0, 1) * total;
    const i = Math.floor(ft);
    const f = ft - i;
    const a = pts[Math.min(i, total)];
    const b = pts[Math.min(i + 1, total)];
    return {
      x: lerp(a.rx, b.rx, f),
      y: lerp(a.ry, b.ry, f),
      a: Math.atan2(b.ry - a.ry, b.rx - a.rx),
    };
  }

  function bookProgress() {
    return (curBook - CFG.startBook) / (CFG.endBook - CFG.startBook);
  }

  function renderRight() {
    const body = $('#rbody');
    if (!body) return;
    const wrap = (html) => `<div class="body-inner">${html}</div>`;

    if (filmOpen) {
      const castHtml = (FILM.cast || []).map((c) => `<li><b>${c.actor}</b> — ${c.role}</li>`).join('');
      const mapHtml = (FILM.epicMapping || [])
        .map((m) => `<tr><td>${String(m.book).padStart(2, '0')}</td><td>${m.epic}</td><td class="film-note">${m.filmNote}</td></tr>`)
        .join('');
      body.innerHTML = wrap(`
        <div class="film-hero" style="background-image:url('${filmHero}')">
          <span class="film-hero-label">NOLAN · IMAX 70MM · 2026</span>
        </div>
        <div class="ttl">${FILM.title || 'The Odyssey'}</div>
        <div class="sub">${FILM.releaseDate || ''} · ${FILM.studio || ''}</div>
        <p>${FILM.officialLogline || ''}</p>
        <div class="kv"><span>导演</span><b>${FILM.director || ''}</b></div>
        <div class="kv"><span>摄影</span><b>${FILM.format || ''}</b></div>
        <div class="kv"><span>片长</span><b>${FILM.runtime || ''}</b></div>
        <p class="section-h">Cast · 公开阵容</p>
        <ul class="cast-list">${castHtml}</ul>
        <p class="section-h">Epic Mapping</p>
        <table class="film-table"><thead><tr><th>卷</th><th>史诗</th><th>注</th></tr></thead><tbody>${mapHtml}</tbody></table>
        <p class="disclaimer">${FILM.disclaimer || ''}</p>
      `);
      return;
    }

    const b = bookAt(curBook);
    if (!b) return;

    if (mode === 'mythos') {
      const pantheon = (MYTHOLOGY.pantheon || [])
        .map((g) => `<div class="myth-card"><b>${g.name}</b> <i>${g.greek}</i><br><span class="dim">${g.domain}</span><br>${g.odysseyRole}</div>`)
        .join('');
      const sections = (MYTHOLOGY.sections || [])
        .map((s) => `<div class="myth-section"><h4>${s.title} ${confBadge(s.confidence)}</h4><p>${s.text}</p></div>`)
        .join('');
      body.innerHTML = wrap(`
        <div class="ttl">${MYTHOLOGY.title || '神话谱系'}</div>
        <div class="sub">THEOGONY · ILIAD · ODYSSEY</div>
        ${sections}
        <p class="section-h">Pantheon</p>
        <div class="myth-grid">${pantheon}</div>
      `);
      return;
    }

    const beats = bookBeats(curBook);
    const beatHtml = beats
      .map((beat) => `<div class="beat-card" data-place="${beat.placeId || ''}"><b>${beat.title}</b> ${confBadge(beat.confidence)}<p>${beat.text}</p></div>`)
      .join('');
    const chars = CHARACTERS.filter((c) => c.books?.includes(curBook))
      .map((c) => `<span class="char-tag">${c.name}</span>`).join('');

    body.innerHTML = wrap(`
      <div class="ttl">${b.title}</div>
      <div class="sub">${b.subtitle || ''}</div>
      ${confBadge(b.confidence)}
      <p><b>局势</b> ${b.situation || ''}</p>
      <p>${b.narrative || ''}</p>
      ${b.filmNote ? `<p class="film-inline">FILM · ${b.filmNote}</p>` : ''}
      <p class="section-h">本卷节点</p>
      ${beatHtml}
      ${chars ? `<p class="section-h">人物</p><div class="char-tags">${chars}</div>` : ''}
    `);

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
      legend.innerHTML = BOOKS.map((b) => {
        const n = String(b.book).padStart(2, '0');
        return `<div class="lg ${b.book === curBook ? 'active' : ''}" data-book="${b.book}">
          <span class="sw"></span><b>${n}</b><i>${b.title.replace(/^第.+卷：/, '')}</i></div>`;
      }).join('');
      $$('#legend .lg').forEach((el) => el.addEventListener('click', () => setBook(+el.dataset.book)));
      return;
    }

    if (mode === 'mythos') {
      legend.innerHTML = FACTIONS.map((f) =>
        `<div class="lg"><span class="sw" style="background:${f.color}"></span><b>${f.name}</b><i>${f.desc.slice(0, 24)}…</i></div>`
      ).join('');
      return;
    }

    legend.innerHTML = PLACES.map((p) => {
      const active = bookBeats(curBook).some((bt) => bt.placeId === p.id);
      const dash = p.confidence === 'legendary' ? 'legendary' : '';
      return `<div class="lg ${active ? 'active' : ''} ${dash}" data-place="${p.id}">
        <span class="sw ${dash}"></span><b>${p.name}</b><i>${p.greek || ''}</i></div>`;
    }).join('');
    $$('#legend .lg').forEach((el) => {
      el.addEventListener('click', () => {
        const p = PLACE_IDX[el.dataset.place];
        if (p) focusPlace(p);
      });
    });
  }

  function setCamTarget(tx, ty, ts) {
    cam.tx = tx;
    cam.ty = ty;
    cam.ts = ts;
  }

  function fitCam() {
    const sx = stage.clientWidth / RW;
    const sy = stage.clientHeight / RH;
    const base = Math.min(sx, sy) * 0.88;
    setCamTarget((stage.clientWidth - RW * base) / 2, (stage.clientHeight - RH * base) / 2, base);
  }

  function focusPlace(p) {
    const cx = stage.clientWidth / 2;
    const cy = stage.clientHeight / 2;
    const ts = Math.min(stage.clientWidth / RW, stage.clientHeight / RH) * 2.1;
    setCamTarget(cx - p.rx * ts, cy - p.ry * ts, ts);
    showPlaceDetail(p);
  }

  function setBook(n) {
    const next = clamp(n, CFG.startBook, CFG.endBook);
    bookAnim = curBook;
    curBook = next;
    routeReveal = 0;
    $('#yBig').textContent = String(curBook).padStart(2, '0');
    const b = bookAt(curBook);
    if (b && $('#yEra1')) {
      $('#yEra1').textContent = b.approxYear
        ? `≈ ${Math.abs(b.approxYear)} BCE · ${b.subtitle || ''}`
        : b.subtitle || '';
    }
    renderRight();
    renderLeft();
    const main = ROUTES.find((r) => r.id === 'main_journey');
    if (main) {
      const pt = pointAlong(main._pts, bookProgress());
      const ts = Math.min(stage.clientWidth / RW, stage.clientHeight / RH) * 1.35;
      setCamTarget(stage.clientWidth / 2 - pt.x * ts, stage.clientHeight / 2 - pt.y * ts, ts);
    }
  }

  function setMode(m) {
    mode = m;
    $$('#modes button').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.mode === m ? 'true' : 'false');
    });
    filmOpen = false;
    renderRight();
    renderLeft();
  }

  function showPlaceDetail(p) {
    const body = $('#rbody');
    if (!body || filmOpen) return;
    const beats = BEATS.filter((bt) => bt.placeId === p.id);
    const beatHtml = beats.map((bt) => `<li><b>${String(bt.book).padStart(2, '0')}</b> ${bt.title} — ${bt.text}</li>`).join('');
    body.innerHTML = `<div class="body-inner">
      <div class="ttl">${p.name}</div>
      <div class="sub">${p.greek || ''}</div>
      ${confBadge(p.confidence)}
      <p>${p.note || ''}</p>
      ${beatHtml ? `<p class="section-h">相关情节</p><ul class="place-beats">${beatHtml}</ul>` : ''}
    </div>`;
  }

  function drawRouteGlow(ctx, pts, color, progress, width) {
    if (pts.length < 2) return;
    const totalLen = pts.length - 1;
    const drawEnd = progress * totalLen;
    const endI = Math.ceil(drawEnd);
    ctx.beginPath();
    ctx.moveTo(pts[0].rx, pts[0].ry);
    for (let i = 1; i <= endI && i < pts.length; i++) {
      if (i === endI && i < pts.length) {
        const f = drawEnd - Math.floor(drawEnd);
        const a = pts[i - 1];
        const b = pts[i];
        ctx.lineTo(lerp(a.rx, b.rx, f), lerp(a.ry, b.ry, f));
      } else ctx.lineTo(pts[i].rx, pts[i].ry);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 14 / cam.scale;
    ctx.shadowColor = color;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([12 / cam.scale, 8 / cam.scale]);
    ctx.lineDashOffset = -animTime * 24;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = width * 0.4;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawWaves(ctx, t) {
    const isDay = theme === 'day';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      const amp = (8 + i * 4) / cam.scale;
      const freq = 0.008 + i * 0.002;
      const y0 = RH * (0.35 + i * 0.12) + Math.sin(t * 0.8 + i) * 6;
      ctx.moveTo(0, y0);
      for (let x = 0; x <= RW; x += 8) {
        ctx.lineTo(x, y0 + Math.sin(x * freq + t * (1.2 + i * 0.15)) * amp);
      }
      ctx.strokeStyle = isDay ? `rgba(30,90,140,${0.08 + i * 0.02})` : `rgba(94,184,217,${0.12 + i * 0.04})`;
      ctx.lineWidth = 2 / cam.scale;
      ctx.stroke();
    }
  }

  function drawShip(ctx, x, y, angle, scale) {
    const s = 18 / scale;
    const glow = 1 + 0.25 * Math.sin(animTime * 4);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.4 * glow, 0, TAU);
    ctx.fillStyle = 'rgba(240,200,100,0.15)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 1.4, 0);
    ctx.lineTo(-s * 0.9, -s * 0.65);
    ctx.lineTo(-s * 0.55, 0);
    ctx.lineTo(-s * 0.9, s * 0.65);
    ctx.closePath();
    ctx.fillStyle = '#ffd875';
    ctx.shadowBlur = 28 / scale;
    ctx.shadowColor = 'rgba(255,220,120,0.95)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2 / scale;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
    wake.forEach((w, i) => {
      w.life -= 0.02;
      if (w.life <= 0) {
        w.x = x - Math.cos(angle) * (12 + i * 2) / scale;
        w.y = y - Math.sin(angle) * (12 + i * 2) / scale;
        w.life = 1;
      }
      ctx.beginPath();
      ctx.arc(w.x, w.y, (3 + i * 0.3) * w.life / scale, 0, TAU);
      ctx.fillStyle = `rgba(94,184,217,${0.35 * w.life})`;
      ctx.fill();
    });
  }

  function drawMap() {
    if (!mapCtx) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (mapEl.width !== w) mapEl.width = w;
    if (mapEl.height !== h) mapEl.height = h;
    mapCtx.clearRect(0, 0, w, h);

    const isDay = theme === 'day';
    if (bgImg.complete && bgImg.naturalWidth && !isDay) {
      const parX = (cam.x - cam.tx) * 0.04;
      const parY = (cam.y - cam.ty) * 0.04;
      mapCtx.save();
      mapCtx.filter = 'brightness(0.82) saturate(1.35) contrast(1.15)';
      mapCtx.drawImage(bgImg, parX - 40, parY - 40, w + 80, h + 80);
      mapCtx.restore();
      const veil = mapCtx.createLinearGradient(0, 0, 0, h);
      veil.addColorStop(0, 'rgba(0,0,0,0.15)');
      veil.addColorStop(0.5, 'rgba(0,0,0,0.08)');
      veil.addColorStop(1, 'rgba(0,0,0,0.35)');
      mapCtx.fillStyle = veil;
      mapCtx.fillRect(0, 0, w, h);
    } else {
      const g = mapCtx.createLinearGradient(0, 0, 0, h);
      if (isDay) {
        g.addColorStop(0, '#a8cce0');
        g.addColorStop(0.5, '#6a9ab8');
        g.addColorStop(1, '#d8e4ec');
      } else {
        g.addColorStop(0, '#061018');
        g.addColorStop(0.45, '#0c1a28');
        g.addColorStop(1, '#040608');
      }
      mapCtx.fillStyle = g;
      mapCtx.fillRect(0, 0, w, h);
    }

    cam.x += (cam.tx - cam.x) * 0.055;
    cam.y += (cam.ty - cam.y) * 0.055;
    cam.scale += (cam.ts - cam.scale) * 0.055;
    routeReveal = lerp(routeReveal, 1, 0.04);

    mapCtx.save();
    mapCtx.translate(cam.x, cam.y);
    mapCtx.scale(cam.scale, cam.scale);

    drawWaves(mapCtx, animTime);

    if (layers.particles) {
      particles.forEach((p) => {
        p.x += Math.sin(animTime * p.drift + p.ph) * 0.15;
        p.y += Math.cos(animTime * p.sp + p.ph) * 0.08;
        if (p.x < 0) p.x = RW;
        if (p.x > RW) p.x = 0;
        if (p.y < 0) p.y = RH;
        if (p.y > RH) p.y = 0;
        const a = 0.08 + 0.35 * Math.sin(animTime * p.sp + p.ph);
        mapCtx.beginPath();
        mapCtx.arc(p.x, p.y, p.r / cam.scale, 0, TAU);
        mapCtx.fillStyle = isDay ? `rgba(30,90,140,${a})` : `rgba(120,200,255,${a})`;
        mapCtx.fill();
      });
    }

    const prog = bookProgress() * routeReveal;

    if (layers.route) {
      ROUTES.forEach((route) => {
        if (route.id === 'telemachus' && mode !== 'books') return;
        const pts = route._pts;
        if (!pts.length) return;
        const isMain = route.id === 'main_journey';
        const col = isMain ? 'rgba(80,200,255,0.95)' : 'rgba(212,168,75,0.55)';
        const p = isMain ? prog : 1;
        drawRouteGlow(mapCtx, pts, col, p, (isMain ? 7 : 3) / cam.scale);
      });

      const main = ROUTES.find((r) => r.id === 'main_journey');
      if (main && layers.route) {
        shipPulse = (shipPulse + 0.004) % 1;
        const shipT = playing ? (prog + animTime * 0.035) % 1 : lerp(prog, shipPulse, 0.15);
        const sp = pointAlong(main._pts, shipT);
        const bob = Math.sin(animTime * 3) * 4 / cam.scale;
        drawShip(mapCtx, sp.x, sp.y + bob, sp.a, cam.scale);
      }
    }

    if (layers.places) {
      const activePlaces = new Set(bookBeats(curBook).map((b) => b.placeId));
      PLACES.forEach((p) => {
        if (p.confidence === 'legendary' && !layers.legendary) return;
        const active = activePlaces.has(p.id);
        const pulse = 1 + (active ? 0.4 * Math.sin(animTime * 3.5) : 0.1 * Math.sin(animTime * 2 + p._i));
        const r = ((active ? 8 : 5) * pulse) / cam.scale;

        if (p.confidence === 'legendary') {
          mapCtx.beginPath();
          mapCtx.setLineDash([5 / cam.scale, 4 / cam.scale]);
          mapCtx.strokeStyle = `rgba(212,168,75,${0.4 + 0.3 * Math.sin(animTime * 2)})`;
          mapCtx.lineWidth = 1.5 / cam.scale;
          mapCtx.arc(p.rx, p.ry, r, 0, TAU);
          mapCtx.stroke();
          mapCtx.setLineDash([]);
        } else {
          if (active) {
            mapCtx.beginPath();
            mapCtx.arc(p.rx, p.ry, r * 1.8, 0, TAU);
            mapCtx.fillStyle = 'rgba(94,184,217,0.12)';
            mapCtx.fill();
          }
          mapCtx.beginPath();
          mapCtx.arc(p.rx, p.ry, r, 0, TAU);
          mapCtx.fillStyle = active ? '#f0c96a' : '#5eb8d9';
          mapCtx.fill();
          mapCtx.strokeStyle = isDay ? '#fff' : 'rgba(255,255,255,0.85)';
          mapCtx.lineWidth = 1.5 / cam.scale;
          mapCtx.stroke();
        }

        if (cam.scale > 1.2 || active || hoveredPlace === p) {
          mapCtx.font = `${11 / cam.scale}px DM Sans, sans-serif`;
          mapCtx.fillStyle = isDay ? '#0c1420' : 'rgba(255,255,255,0.9)';
          mapCtx.fillText(p.name, p.rx + 10 / cam.scale, p.ry - 5 / cam.scale);
        }
      });
    }

    mapCtx.restore();

    const flareX = w * 0.72 + Math.sin(animTime * 0.3) * 30;
    const flareG = mapCtx.createRadialGradient(flareX, h * 0.35, 0, flareX, h * 0.35, w * 0.35);
    flareG.addColorStop(0, 'rgba(200,220,255,0.06)');
    flareG.addColorStop(1, 'transparent');
    mapCtx.fillStyle = flareG;
    mapCtx.fillRect(0, 0, w, h);
  }

  function drawTimeline() {
    if (!tlCtx) return;
    const wrap = $('#tlwrap');
    const w = wrap ? wrap.clientWidth : 800;
    const h = 48;
    if (tlEl.width !== w) tlEl.width = w;
    if (tlEl.height !== h) tlEl.height = h;
    tlCtx.clearRect(0, 0, w, h);

    const isDay = theme === 'day';
    tlCtx.fillStyle = isDay ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.35)';
    tlCtx.fillRect(0, 0, w, h);

    const pad = 28;
    const total = CFG.endBook - CFG.startBook;
    const x = pad + ((curBook - CFG.startBook) / total) * (w - 2 * pad);
    const pulse = 1 + 0.15 * Math.sin(animTime * 4);

    const lg = tlCtx.createLinearGradient(pad, 0, w - pad, 0);
    lg.addColorStop(0, isDay ? '#2a6a88' : '#1e3a52');
    lg.addColorStop(bookProgress(), isDay ? '#5eb8d9' : '#5eb8d9');
    lg.addColorStop(1, isDay ? '#2a6a88' : '#1e3a52');
    tlCtx.strokeStyle = lg;
    tlCtx.lineWidth = 3;
    tlCtx.beginPath();
    tlCtx.moveTo(pad, h / 2);
    tlCtx.lineTo(w - pad, h / 2);
    tlCtx.stroke();

    for (let i = CFG.startBook; i <= CFG.endBook; i++) {
      const bx = pad + ((i - CFG.startBook) / total) * (w - 2 * pad);
      const active = i === curBook;
      tlCtx.beginPath();
      tlCtx.arc(bx, h / 2, active ? 5 * pulse : 2.5, 0, TAU);
      tlCtx.fillStyle = active ? '#f0c96a' : isDay ? '#5eb8d9' : '#3a6a88';
      tlCtx.fill();
    }

    tlCtx.beginPath();
    tlCtx.arc(x, h / 2, 7 * pulse, 0, TAU);
    tlCtx.fillStyle = '#f0c96a';
    tlCtx.shadowBlur = 12;
    tlCtx.shadowColor = 'rgba(240,200,100,0.6)';
    tlCtx.fill();
    tlCtx.shadowBlur = 0;
  }

  function mapToWorld(mx, my) {
    return [(mx - cam.x) / cam.scale, (my - cam.y) / cam.scale];
  }

  function hitPlace(mx, my) {
    const [wx, wy] = mapToWorld(mx, my);
    const tol = 14 / cam.scale;
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
    tip.style.left = mx + 14 + 'px';
    tip.style.top = my + 14 + 'px';
    tip.classList.add('on');
  }

  function buildSearchIndex() {
    const items = [];
    BOOKS.forEach((b) => items.push({ type: '卷', label: `${String(b.book).padStart(2, '0')} ${b.title}`, action: () => setBook(b.book) }));
    PLACES.forEach((p) => items.push({ type: '地点', label: p.name, action: () => focusPlace(p) }));
    CHARACTERS.forEach((c) => items.push({ type: '人物', label: c.name, action: () => { if (c.books?.[0]) setBook(c.books[0]); } }));
    THEMES.forEach((t) => items.push({ type: '母题', label: t.name, action: () => {} }));
    return items;
  }

  let searchIndex = [];

  function openSearch() {
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
    list.innerHTML = hits.map((it, i) => `<div class="srch-item" data-i="${i}"><span class="srch-type">${it.type}</span>${it.label}</div>`).join('');
    $$('.srch-item').forEach((el) => {
      el.addEventListener('click', () => {
        const it = hits[+el.dataset.i];
        if (it) {
          it.action();
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
      </div>`;
    card.classList.add('on');
    $('#tourPrev')?.addEventListener('click', () => { tourStep--; showTour(); });
    $('#tourNext')?.addEventListener('click', () => {
      if (tourStep < steps.length - 1) { tourStep++; showTour(); } else card.classList.remove('on');
    });
    $('#tourClose')?.addEventListener('click', () => card.classList.remove('on'));
  }

  function initEvents() {
    $$('#modes button').forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
    $('#filmBtn')?.addEventListener('click', () => { filmOpen = true; renderRight(); });
    $('#themeBtn')?.addEventListener('click', () => {
      theme = theme === 'night' ? 'day' : 'night';
      document.documentElement.setAttribute('data-theme', theme === 'night' ? 'night' : 'day');
      $('#themeBtn').textContent = theme === 'night' ? '白昼' : '夜观';
    });
    $('#srchBtn')?.addEventListener('click', openSearch);
    $('#srchOv')?.addEventListener('click', (e) => { if (e.target.id === 'srchOv') e.currentTarget.classList.remove('on'); });
    $('#srchIn')?.addEventListener('input', (e) => renderSearch(e.target.value));
    $('#tourBtn')?.addEventListener('click', () => { tourStep = 0; showTour(); });
    $('#zin')?.addEventListener('click', () => { cam.ts *= 1.2; cam.tx = stage.clientWidth / 2 - (stage.clientWidth / 2 - cam.tx) * 1.2; cam.ty = stage.clientHeight / 2 - (stage.clientHeight / 2 - cam.ty) * 1.2; });
    $('#zout')?.addEventListener('click', () => { cam.ts /= 1.2; });
    $('#zfit')?.addEventListener('click', fitCam);
    $('#pPrev')?.addEventListener('click', () => setBook(curBook - 1));
    $('#pNext')?.addEventListener('click', () => setBook(curBook + 1));
    $('#pPlay')?.addEventListener('click', () => {
      playing = !playing;
      const btn = $('#pPlay');
      if (btn) {
        btn.textContent = playing ? '■' : '▶';
        btn.classList.toggle('playing', playing);
      }
      if (playing) {
        playTimer = setInterval(() => {
          if (curBook >= CFG.endBook) {
            playing = false;
            clearInterval(playTimer);
            if (btn) { btn.textContent = '▶'; btn.classList.remove('playing'); }
            return;
          }
          setBook(curBook + 1);
        }, 2200);
      } else clearInterval(playTimer);
    });
    $$('.lay input').forEach((inp) => {
      inp.addEventListener('change', () => { layers[inp.dataset.layer] = inp.checked ? 1 : 0; });
    });
    mapEl.addEventListener('mousedown', (e) => {
      dragging = true;
      dragStart = [e.clientX, e.clientY];
      viewStart = [cam.x, cam.y];
      mapEl.classList.add('drag');
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) {
        const rect = mapEl.getBoundingClientRect();
        hoveredPlace = hitPlace(e.clientX - rect.left, e.clientY - rect.top);
        showTip(hoveredPlace, e.clientX - rect.left, e.clientY - rect.top);
        return;
      }
      cam.x = viewStart[0] + (e.clientX - dragStart[0]);
      cam.y = viewStart[1] + (e.clientY - dragStart[1]);
      cam.tx = cam.x;
      cam.ty = cam.y;
    });
    window.addEventListener('mouseup', () => { dragging = false; mapEl.classList.remove('drag'); });
    mapEl.addEventListener('click', (e) => {
      const rect = mapEl.getBoundingClientRect();
      const p = hitPlace(e.clientX - rect.left, e.clientY - rect.top);
      if (p) showPlaceDetail(p);
    });
    tlEl.addEventListener('click', (e) => {
      const rect = tlEl.getBoundingClientRect();
      const pad = 28;
      const book = Math.round(((e.clientX - rect.left - pad) / (rect.width - 2 * pad)) * (CFG.endBook - CFG.startBook)) + CFG.startBook;
      setBook(book);
    });
    $('#leftTgl')?.addEventListener('click', () => $('#left').classList.toggle('open'));
    $('#rightTgl')?.addEventListener('click', () => $('#right').classList.toggle('open'));
    window.addEventListener('resize', fitCam);
  }

  function loop() {
    animTime += 0.016;
    drawMap();
    drawTimeline();
    requestAnimationFrame(loop);
  }

  function init() {
    mapCtx = mapEl.getContext('2d');
    tlCtx = tlEl.getContext('2d');
    bgImg.onload = () => drawMap();
    searchIndex = buildSearchIndex();
    initEvents();
    setBook(1);
    fitCam();
    renderRight();
    playing = true;
    const btn = $('#pPlay');
    if (btn) { btn.textContent = '■'; btn.classList.add('playing'); }
    playTimer = setInterval(() => {
      if (curBook >= CFG.endBook) {
        playing = false;
        clearInterval(playTimer);
        if (btn) { btn.textContent = '▶'; btn.classList.remove('playing'); }
        return;
      }
      setBook(curBook + 1);
    }, 2800);
    requestAnimationFrame(loop);
  }

  init();
})();
