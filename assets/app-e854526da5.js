/* geo + projection */
window.ODY = window.ODY || {};
(function (O) {
  'use strict';
  const D = Math.PI / 180;
  const TAU = Math.PI * 2;

  function buildGeo(data) {
    const CFG = Object.assign(
      { bbox: { lon0: -12, lat0: 28, lon1: 42, lat1: 48 }, startBook: 1, endBook: 24 },
      data.config || {}
    );
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
    for (let la = B.lat0; la <= B.lat1 + 1e-9; la += (B.lat1 - B.lat0) / 40) {
      for (let lo = B.lon0; lo <= B.lon1 + 1e-9; lo += (B.lon1 - B.lon0) / 60) {
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
    const projR = (lat, lon) => {
      const p = projEE(lat, lon);
      return [w2rx(p[0]), w2ry(p[1])];
    };

    const places = (data.places || []).map((p, i) => {
      const pr = projR(p.lat, p.lon);
      return { ...p, _i: i, rx: pr[0], ry: pr[1] };
    });
    const placeIdx = Object.fromEntries(places.map((p) => [p.id, p]));

    const routes = (data.routes || []).map((r) => ({
      ...r,
      _pts: r.path.map((pt) => {
        const pr = projR(pt.lat, pt.lon);
        return { ...pt, rx: pr[0], ry: pr[1] };
      }),
    }));

    return {
      CFG, RW, RH, places, placeIdx, routes,
      books: data.books || [],
      beats: data.beats || [],
      characters: data.characters || [],
      factions: data.factions || [],
      themes: data.themes || [],
      mythology: data.mythology || {},
      film: data.film || {},
      media: data.media || {},
      pointAlong(pts, t) {
        if (!pts?.length) return { x: 0, y: 0, a: 0 };
        const total = pts.length - 1;
        const ft = Math.max(0, Math.min(1, t)) * total;
        const i = Math.floor(ft);
        const f = ft - i;
        const a = pts[Math.min(i, total)];
        const b = pts[Math.min(i + 1, total)];
        return {
          x: a.rx + (b.rx - a.rx) * f,
          y: a.ry + (b.ry - a.ry) * f,
          a: Math.atan2(b.ry - a.ry, b.rx - a.rx),
        };
      },
    };
  }

  O.Geo = { buildGeo, TAU };
})(window.ODY);

;
/* state store */
(function (O) {
  'use strict';
  const listeners = new Set();
  const state = {
    mode: 'journey',
    book: 1,
    theme: 'night',
    filmOpen: false,
    layers: { route: true, places: true, legendary: true, particles: true, waves: true },
    playing: false,
    detailOpen: true,
  };

  function getState() {
    return state;
  }
  function setState(patch) {
    Object.assign(state, patch);
    listeners.forEach((fn) => fn(state));
  }
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  O.Store = { getState, setState, subscribe };
})(window.ODY);

;
/* map renderer */
(function (O) {
  'use strict';
  const { TAU } = O.Geo;

  class MapRenderer {
    constructor(canvas, geo, store) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.geo = geo;
      this.store = store;
      this.cam = { x: 0, y: 0, scale: 1, tx: 0, ty: 0, ts: 1 };
      this.time = 0;
      this.dragging = false;
      this.dragStart = null;
      this.camStart = null;
      this.hovered = null;
      this.routeReveal = 0;
      this.shipDrift = 0;
      this.particles = Array.from({ length: 140 }, () => ({
        x: Math.random() * geo.RW,
        y: Math.random() * geo.RH,
        r: 0.4 + Math.random() * 2.2,
        ph: Math.random() * TAU,
        sp: 0.2 + Math.random() * 1.4,
      }));
      this.wake = Array.from({ length: 32 }, () => ({ x: 0, y: 0, life: 0 }));
      this.bg = new Image();
      this.bg.src = (window.__CDN__ || '') + 'assets/images/mediterranean-cinema-bg.jpg';
      this.bg.onload = () => this.draw();
      this.stage = canvas.parentElement;
      this._bind();
    }

    _bind() {
      this._moved = false;
      this.canvas.addEventListener('mousedown', (e) => {
        this.dragging = true;
        this._moved = false;
        this.dragStart = [e.clientX, e.clientY];
        this.camStart = [this.cam.x, this.cam.y];
        this.canvas.classList.add('dragging');
      });
      window.addEventListener('mousemove', (e) => {
        if (!this.dragging) {
          const r = this.canvas.getBoundingClientRect();
          this.hovered = this._hit(e.clientX - r.left, e.clientY - r.top);
          O.UI?.showTip(this.hovered, e.clientX - r.left, e.clientY - r.top);
          return;
        }
        const dx = e.clientX - this.dragStart[0];
        const dy = e.clientY - this.dragStart[1];
        if (Math.hypot(dx, dy) > 4) this._moved = true;
        this.cam.x = this.camStart[0] + dx;
        this.cam.y = this.camStart[1] + dy;
        this.cam.tx = this.cam.x;
        this.cam.ty = this.cam.y;
      });
      window.addEventListener('mouseup', () => {
        this.dragging = false;
        this.canvas.classList.remove('dragging');
      });
      this.canvas.addEventListener('click', (e) => {
        if (this._moved) return;
        const r = this.canvas.getBoundingClientRect();
        const p = this._hit(e.clientX - r.left, e.clientY - r.top);
        if (p) O.UI?.showPlace(p);
      });
      window.addEventListener('resize', () => this.fit());
    }

    fit() {
      const w = this.stage.clientWidth;
      const h = this.stage.clientHeight;
      const base = Math.min(w / this.geo.RW, h / this.geo.RH) * 0.9;
      this.setCamTarget((w - this.geo.RW * base) / 2, (h - this.geo.RH * base) / 2, base);
    }

    focusPlace(p, zoom = 2.2) {
      const w = this.stage.clientWidth;
      const h = this.stage.clientHeight;
      const ts = Math.min(w / this.geo.RW, h / this.geo.RH) * zoom;
      this.setCamTarget(w / 2 - p.rx * ts, h / 2 - p.ry * ts, ts);
    }

    focusBook(book) {
      const main = this.geo.routes.find((r) => r.id === 'main_journey');
      if (!main) return;
      const prog = (book - this.geo.CFG.startBook) / (this.geo.CFG.endBook - this.geo.CFG.startBook);
      const pt = this.geo.pointAlong(main._pts, prog);
      const w = this.stage.clientWidth;
      const h = this.stage.clientHeight;
      const ts = Math.min(w / this.geo.RW, h / this.geo.RH) * 1.45;
      this.setCamTarget(w / 2 - pt.x * ts, h / 2 - pt.y * ts, ts);
      this.routeReveal = 0;
    }

    setCamTarget(tx, ty, ts) {
      this.cam.tx = tx;
      this.cam.ty = ty;
      this.cam.ts = ts;
    }

    zoom(f) {
      const cx = this.stage.clientWidth / 2;
      const cy = this.stage.clientHeight / 2;
      const wx = (cx - this.cam.x) / this.cam.scale;
      const wy = (cy - this.cam.y) / this.cam.scale;
      this.cam.ts *= f;
      this.cam.tx = cx - wx * this.cam.ts;
      this.cam.ty = cy - wy * this.cam.ts;
    }

    _hit(mx, my) {
      const [wx, wy] = [(mx - this.cam.x) / this.cam.scale, (my - this.cam.y) / this.cam.scale];
      const tol = 16 / this.cam.scale;
      let best = null;
      let d0 = tol;
      this.geo.places.forEach((p) => {
        const d = Math.hypot(p.rx - wx, p.ry - wy);
        if (d < d0) {
          d0 = d;
          best = p;
        }
      });
      return best;
    }

    tick(dt) {
      this.time += dt;
      this.cam.x += (this.cam.tx - this.cam.x) * 0.06;
      this.cam.y += (this.cam.ty - this.cam.y) * 0.06;
      this.cam.scale += (this.cam.ts - this.cam.scale) * 0.06;
      this.routeReveal = this.routeReveal + (1 - this.routeReveal) * 0.05;
      this.shipDrift += 0.0025;
      this.draw();
      O.Timeline?.draw();
    }

    draw() {
      const ctx = this.ctx;
      const w = this.stage.clientWidth;
      const h = this.stage.clientHeight;
      if (this.canvas.width !== w) this.canvas.width = w;
      if (this.canvas.height !== h) this.canvas.height = h;
      const st = this.store.getState();
      const isDay = st.theme === 'day';

      ctx.clearRect(0, 0, w, h);

      if (this.bg.complete && this.bg.naturalWidth && !isDay) {
        const px = (this.cam.x - this.cam.tx) * 0.05;
        const py = (this.cam.y - this.cam.ty) * 0.05;
        ctx.save();
        ctx.filter = 'brightness(0.88) saturate(1.4) contrast(1.1)';
        ctx.drawImage(this.bg, px - 50, py - 50, w + 100, h + 100);
        ctx.restore();
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(0,0,0,0.1)');
        g.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, isDay ? '#8ab8d0' : '#061018');
        g.addColorStop(1, isDay ? '#d0e0ec' : '#020408');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      ctx.save();
      ctx.translate(this.cam.x, this.cam.y);
      ctx.scale(this.cam.scale, this.cam.scale);

      if (st.layers.waves) this._waves(ctx, isDay);
      if (st.layers.particles) this._particles(ctx, isDay);

      const book = st.book;
      const prog = ((book - this.geo.CFG.startBook) / (this.geo.CFG.endBook - this.geo.CFG.startBook)) * this.routeReveal;

      if (st.layers.route) {
        this.geo.routes.forEach((route) => {
          if (route.id === 'telemachus' && st.mode !== 'books') return;
          const isMain = route.id === 'main_journey';
          this._route(ctx, route._pts, isMain ? prog : 1, isMain ? '#5cc4e8' : '#c9a84b', isMain ? 8 : 4);
        });
        const main = this.geo.routes.find((r) => r.id === 'main_journey');
        if (main) {
          const t = st.playing ? (prog + this.time * 0.04) % 1 : (prog * 0.85 + this.shipDrift * 0.15) % 1;
          const sp = this.geo.pointAlong(main._pts, t);
          this._ship(ctx, sp.x, sp.y + Math.sin(this.time * 3) * 5 / this.cam.scale, sp.a);
        }
      }

      if (st.layers.places) {
        const active = new Set(
          this.geo.beats.filter((b) => b.book === book).map((b) => b.placeId)
        );
        this.geo.places.forEach((p) => {
          if (p.confidence === 'legendary' && !st.layers.legendary) return;
          const on = active.has(p.id) || this.hovered === p;
          this._marker(ctx, p, on, isDay);
        });
      }

      ctx.restore();

      const flare = ctx.createRadialGradient(w * 0.75, h * 0.3, 0, w * 0.75, h * 0.3, w * 0.4);
      flare.addColorStop(0, 'rgba(180,220,255,0.07)');
      flare.addColorStop(1, 'transparent');
      ctx.fillStyle = flare;
      ctx.fillRect(0, 0, w, h);
    }

    _waves(ctx, isDay) {
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        const y0 = this.geo.RH * (0.3 + i * 0.11);
        for (let x = 0; x <= this.geo.RW; x += 6) {
          const y = y0 + Math.sin(x * 0.01 + this.time * (1 + i * 0.1) + i) * (10 + i * 3) / this.cam.scale;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = isDay ? `rgba(30,80,120,${0.06 + i * 0.02})` : `rgba(92,196,232,${0.1 + i * 0.03})`;
        ctx.lineWidth = 2 / this.cam.scale;
        ctx.stroke();
      }
    }

    _particles(ctx, isDay) {
      this.particles.forEach((p) => {
        p.x += Math.sin(this.time * p.sp + p.ph) * 0.2;
        p.y += Math.cos(this.time * p.sp + p.ph) * 0.1;
        const a = 0.1 + 0.4 * Math.sin(this.time * p.sp + p.ph);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r / this.cam.scale, 0, TAU);
        ctx.fillStyle = isDay ? `rgba(30,90,140,${a})` : `rgba(140,220,255,${a})`;
        ctx.fill();
      });
    }

    _route(ctx, pts, progress, color, width) {
      if (!pts?.length) return;
      const end = progress * (pts.length - 1);
      const endI = Math.ceil(end);
      ctx.beginPath();
      ctx.moveTo(pts[0].rx, pts[0].ry);
      for (let i = 1; i <= endI && i < pts.length; i++) {
        if (i === endI && i < pts.length) {
          const f = end - Math.floor(end);
          const a = pts[i - 1];
          const b = pts[i];
          ctx.lineTo(a.rx + (b.rx - a.rx) * f, a.ry + (b.ry - a.ry) * f);
        } else ctx.lineTo(pts[i].rx, pts[i].ry);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width / this.cam.scale;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 20 / this.cam.scale;
      ctx.shadowColor = color;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([14 / this.cam.scale, 10 / this.cam.scale]);
      ctx.lineDashOffset = -this.time * 30;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = (width * 0.35) / this.cam.scale;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    _ship(ctx, x, y, angle) {
      const s = 20 / this.cam.scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.arc(0, 0, s * 1.5, 0, TAU);
      ctx.fillStyle = 'rgba(255,220,120,0.12)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 1.5, 0);
      ctx.lineTo(-s, -s * 0.7);
      ctx.lineTo(-s * 0.55, 0);
      ctx.lineTo(-s, s * 0.7);
      ctx.closePath();
      ctx.fillStyle = '#ffe08a';
      ctx.shadowBlur = 30 / this.cam.scale;
      ctx.shadowColor = 'rgba(255,220,120,0.9)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 / this.cam.scale;
      ctx.stroke();
      ctx.restore();
      this.wake.forEach((w, i) => {
        w.life -= 0.025;
        if (w.life <= 0) {
          w.x = x - Math.cos(angle) * (14 + i) / this.cam.scale;
          w.y = y - Math.sin(angle) * (14 + i) / this.cam.scale;
          w.life = 1;
        }
        ctx.beginPath();
        ctx.arc(w.x, w.y, ((4 + i * 0.2) * w.life) / this.cam.scale, 0, TAU);
        ctx.fillStyle = `rgba(92,196,232,${0.4 * w.life})`;
        ctx.fill();
      });
    }

    _marker(ctx, p, active, isDay) {
      const pulse = 1 + (active ? 0.45 * Math.sin(this.time * 4) : 0.08 * Math.sin(this.time * 2 + p._i));
      const r = ((active ? 10 : 6) * pulse) / this.cam.scale;
      if (p.confidence === 'legendary') {
        ctx.setLineDash([5 / this.cam.scale, 4 / this.cam.scale]);
        ctx.strokeStyle = `rgba(232,197,106,${0.5 + 0.3 * Math.sin(this.time * 2)})`;
        ctx.lineWidth = 2 / this.cam.scale;
        ctx.beginPath();
        ctx.arc(p.rx, p.ry, r, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        if (active) {
          ctx.beginPath();
          ctx.arc(p.rx, p.ry, r * 2, 0, TAU);
          ctx.fillStyle = 'rgba(92,196,232,0.15)';
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(p.rx, p.ry, r, 0, TAU);
        ctx.fillStyle = active ? '#ffe08a' : '#5cc4e8';
        ctx.fill();
        ctx.strokeStyle = isDay ? '#fff' : 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2 / this.cam.scale;
        ctx.stroke();
      }
      if (active || this.cam.scale > 1.3 || this.hovered === p) {
        ctx.font = `${12 / this.cam.scale}px DM Sans,sans-serif`;
        ctx.fillStyle = isDay ? '#0a1420' : '#fff';
        ctx.fillText(p.name, p.rx + 12 / this.cam.scale, p.ry - 6 / this.cam.scale);
      }
    }
  }

  O.MapRenderer = MapRenderer;
})(window.ODY);

;
/* timeline scrubber */
(function (O) {
  'use strict';
  let canvas, ctx, geo, store, time = 0;

  function init(cvs, g, s) {
    canvas = cvs;
    ctx = canvas.getContext('2d');
    geo = g;
    store = s;
  }

  function draw() {
    if (!ctx || !geo) return;
    const wrap = canvas.parentElement;
    const w = wrap.clientWidth;
    const h = 56;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const st = store.getState();
    const isDay = st.theme === 'day';
    const total = geo.CFG.endBook - geo.CFG.startBook;
    const pad = 32;
    const x = pad + ((st.book - geo.CFG.startBook) / total) * (w - 2 * pad);
    const pulse = 1 + 0.12 * Math.sin(time * 4);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = isDay ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, w, h);

    const lg = ctx.createLinearGradient(pad, 0, w - pad, 0);
    lg.addColorStop(0, '#1e3a52');
    lg.addColorStop((st.book - geo.CFG.startBook) / total, '#5cc4e8');
    lg.addColorStop(1, '#1e3a52');
    ctx.strokeStyle = lg;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pad, h / 2);
    ctx.lineTo(w - pad, h / 2);
    ctx.stroke();

    for (let i = geo.CFG.startBook; i <= geo.CFG.endBook; i++) {
      const bx = pad + ((i - geo.CFG.startBook) / total) * (w - 2 * pad);
      ctx.beginPath();
      ctx.arc(bx, h / 2, i === st.book ? 5 * pulse : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = i === st.book ? '#ffe08a' : isDay ? '#5cc4e8' : '#3a6a88';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, h / 2, 8 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe08a';
    ctx.shadowBlur = 14;
    ctx.shadowColor = 'rgba(255,224,138,0.7)';
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function tick(dt) {
    time += dt;
  }

  function bindClick(handler) {
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const pad = 32;
      const book = Math.round(((e.clientX - r.left - pad) / (r.width - 2 * pad)) * (geo.CFG.endBook - geo.CFG.startBook)) + geo.CFG.startBook;
      handler(book);
    });
  }

  O.Timeline = { init, draw, tick, bindClick };
})(window.ODY);

;
/* UI panels — multimedia rich */
(function (O) {
  'use strict';
  const $ = (s) => document.querySelector(s);

  function confLabel(c) {
    if (c === 'disputed') return '学界争议';
    if (c === 'legendary') return '传说层';
    return '学界主流';
  }
  function badge(c) {
    const cls = c === 'legendary' ? 'badge-legend' : c === 'disputed' ? 'badge-disputed' : 'badge-consensus';
    return `<span class="badge ${cls}">${confLabel(c)}</span>`;
  }
  function asset(path) {
    if (!path) return '';
    if (/^https?:\/\//.test(path)) return path;
    return (window.__CDN__ || '') + path;
  }
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  const UI = {
    geo: null,
    store: null,
    map: null,

    init(geo, store, map) {
      this.geo = geo;
      this.store = store;
      this.map = map;
      store.subscribe((st) => this.render(st));
      this._bindModes();
      this._bindLayers();
      this._bindHeader();
      this._bindLightbox();
      this.render(store.getState());
    },

    media() {
      return this.geo.media || {};
    },

    placeMedia(id) {
      return (this.media().places || {})[id] || null;
    },

    bookHero(book) {
      const m = (this.media().books || {})[String(book)];
      if (m?.hero) return m;
      const beat = this.geo.beats.find((b) => b.book === book && b.placeId);
      if (beat) {
        const pm = this.placeMedia(beat.placeId);
        if (pm?.hero) return { hero: pm.hero, motif: beat.title };
      }
      return { hero: 'assets/images/mediterranean-cinema-bg.jpg', motif: '' };
    },

    charPortrait(id) {
      return (this.media().characters || {})[id]?.portrait || null;
    },

    _bindModes() {
      document.querySelectorAll('.mode-pills button').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.store.setState({ mode: btn.dataset.mode, filmOpen: false, detailOpen: true });
          document.querySelectorAll('.mode-pills button').forEach((b) => b.classList.toggle('active', b === btn));
          this._openDetail();
        });
      });
    },

    _bindLayers() {
      document.querySelectorAll('.layer-toggle input').forEach((inp) => {
        inp.addEventListener('change', () => {
          const layers = { ...this.store.getState().layers };
          layers[inp.dataset.layer] = inp.checked;
          this.store.setState({ layers });
        });
      });
    },

    _bindHeader() {
      $('#filmBtn')?.addEventListener('click', () => this.store.setState({ filmOpen: true, detailOpen: true }));
      $('#searchBtn')?.addEventListener('click', () => $('#searchModal')?.classList.add('open'));
      $('#searchModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'searchModal') e.currentTarget.classList.remove('open');
      });
      $('#searchInput')?.addEventListener('input', (e) => this._search(e.target.value));
      $('#tourBtn')?.addEventListener('click', () => this._tour(0));
      $('#themeBtn')?.addEventListener('click', () => {
        const st = this.store.getState();
        const theme = st.theme === 'night' ? 'day' : 'night';
        document.documentElement.setAttribute('data-theme', theme === 'night' ? 'night' : 'day');
        $('#themeBtn').textContent = theme === 'night' ? '白昼' : '夜观';
        this.store.setState({ theme });
      });
      $('#toggleLeft')?.addEventListener('click', () => $('.hud-left')?.classList.toggle('open'));
      $('#toggleRight')?.addEventListener('click', () => $('.hud-right')?.classList.toggle('open'));
      $('#closeDetail')?.addEventListener('click', () => {
        $('.hud-right')?.classList.add('collapsed');
        this.store.setState({ detailOpen: false });
      });
      $('#zin')?.addEventListener('click', () => this.map.zoom(1.25));
      $('#zout')?.addEventListener('click', () => this.map.zoom(1 / 1.25));
      $('#zfit')?.addEventListener('click', () => this.map.fit());
      $('#pPrev')?.addEventListener('click', () => this.setBook(this.store.getState().book - 1));
      $('#pNext')?.addEventListener('click', () => this.setBook(this.store.getState().book + 1));
      $('#pPlay')?.addEventListener('click', () => this._togglePlay());
    },

    _bindLightbox() {
      // Document-level delegation — survives innerHTML rewrites
      document.addEventListener('click', (e) => {
        const hit = e.target.closest('[data-lb]');
        if (!hit) return;
        // Don't hijack nav place/book clicks that also carry thumbs without expand intent
        if (hit.classList.contains('nav-item') && !hit.hasAttribute('data-expand')) return;
        e.preventDefault();
        e.stopPropagation();
        this.openLightbox(hit.getAttribute('data-lb'), hit.getAttribute('data-cap') || '');
      });
      const lb = $('#lightbox');
      $('#lbClose')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeLightbox();
      });
      lb?.addEventListener('click', (e) => {
        if (e.target === lb || e.target.id === 'lbClose') this.closeLightbox();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeLightbox();
      });
    },

    openLightbox(src, cap) {
      const lb = $('#lightbox');
      const img = $('#lbImg');
      if (!lb || !img || !src) return;
      img.src = asset(src);
      img.alt = cap || '';
      $('#lbCap').textContent = cap || '';
      lb.classList.add('open');
      lb.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    },

    closeLightbox() {
      const lb = $('#lightbox');
      if (!lb) return;
      lb.classList.remove('open');
      lb.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    },

    setBook(n) {
      const book = Math.max(this.geo.CFG.startBook, Math.min(this.geo.CFG.endBook, n));
      this.store.setState({ book, filmOpen: false, detailOpen: true, mode: this.store.getState().mode === 'gallery' ? 'books' : this.store.getState().mode });
      this._openDetail();
      this.map.focusBook(book);
    },

    _togglePlay() {
      const st = this.store.getState();
      const playing = !st.playing;
      const btn = $('#pPlay');
      btn?.classList.toggle('playing', playing);
      btn.textContent = playing ? '■' : '▶';
      this.store.setState({ playing });
      if (playing) {
        this._playTimer = setInterval(() => {
          const b = this.store.getState().book;
          if (b >= this.geo.CFG.endBook) {
            clearInterval(this._playTimer);
            this.store.setState({ playing: false });
            btn?.classList.remove('playing');
            btn.textContent = '▶';
            return;
          }
          this.setBook(b + 1);
        }, 2600);
      } else clearInterval(this._playTimer);
    },

    showTip(p, mx, my) {
      const tip = $('#tip');
      if (!p) {
        tip?.classList.remove('show');
        return;
      }
      const hero = this.placeMedia(p.id)?.hero;
      tip.innerHTML = `${hero ? `<img src="${esc(asset(hero))}" alt="">` : ''}
        <b>${esc(p.name)}</b><br><small>${esc(p.greek || '')} · ${confLabel(p.confidence)}</small>`;
      tip.classList.add('show');
      const stage = tip.parentElement;
      const tw = tip.offsetWidth || 160;
      const th = tip.offsetHeight || 80;
      const maxX = (stage?.clientWidth || window.innerWidth) - tw - 12;
      const maxY = (stage?.clientHeight || window.innerHeight) - th - 12;
      tip.style.left = Math.max(8, Math.min(mx + 16, maxX)) + 'px';
      tip.style.top = Math.max(8, Math.min(my + 16, maxY)) + 'px';
    },

    _heroHtml(src, cap) {
      if (!src) return '';
      const url = esc(asset(src));
      return `<div class="media-hero" data-lb="${url}" data-cap="${esc(cap || '')}" role="button" tabindex="0" title="点击放大">
        <img src="${url}" alt="${esc(cap || '')}" loading="lazy">
        <span class="zoom-hint">点击放大</span>
        ${cap ? `<div class="cap">${esc(cap)}</div>` : ''}
      </div>`;
    },

    _galleryStrip(items) {
      if (!items?.length) return '';
      return `<div class="media-strip">${items
        .map((g) => {
          const url = esc(asset(g.src));
          const title = esc(g.caption || g.title || '');
          return `<div class="media-card" data-lb="${url}" data-cap="${title}" role="button" tabindex="0">
          <img src="${url}" alt="" loading="lazy">
          <div class="meta"><b>${title}</b><small>${esc(g.credit || '')}</small></div>
        </div>`;
        })
        .join('')}</div>`;
    },

    _openDetail() {
      const dock = $('.hud-right');
      dock?.classList.remove('collapsed');
      dock?.classList.add('open');
    },

    showPlace(p) {
      this.store.setState({ detailOpen: true, filmOpen: false });
      this._openDetail();
      const beats = this.geo.beats.filter((b) => b.placeId === p.id);
      const html = beats.map((b) => `<li><b>${String(b.book).padStart(2, '0')}</b> ${esc(b.title)}</li>`).join('');
      const pm = this.placeMedia(p.id);
      const hero = pm?.hero || 'assets/images/mediterranean-cinema-bg.jpg';
      $('#detailPanel').innerHTML = `
        <div class="detail-title">${esc(p.name)}</div>
        <div class="detail-sub">${esc(p.greek || '')}</div>
        ${badge(p.confidence)}
        <p>${esc(p.note || '')}</p>
        ${this._heroHtml(hero, p.name)}
        ${pm?.gallery?.length ? `<p class="section-label">史料影像</p>${this._galleryStrip(pm.gallery)}` : ''}
        ${html ? `<p class="section-label">情节</p><ul class="place-beats">${html}</ul>` : ''}
        <p class="credit-line">${esc(this.media().creditNote || '')}</p>`;
    },

    render(st) {
      const b = this.geo.books.find((x) => x.book === st.book);
      $('#bookNum').textContent = String(st.book).padStart(2, '0');
      $('#bookMeta').textContent = b ? `${b.subtitle || ''}` : '';
      if (b?.approxYear) {
        $('#bookMeta').textContent = `${b.subtitle || ''} · ≈ ${Math.abs(b.approxYear)} BCE`;
      }

      this._renderNav(st);
      if (st.filmOpen) this._renderFilm();
      else if (st.mode === 'gallery') this._renderGallery();
      else if (st.mode === 'mythos') this._renderMythos();
      else this._renderBook(b, st.book);
    },

    _thumbForPlace(p) {
      const hero = this.placeMedia(p.id)?.hero;
      return hero ? `<img class="nav-thumb" src="${asset(hero)}" alt="" loading="lazy">` : `<span class="nav-dot"></span>`;
    },

    _renderNav(st) {
      const el = $('#navList');
      if (!el) return;
      if (st.mode === 'books') {
        el.innerHTML = this.geo.books
          .map((b) => {
            const hero = this.bookHero(b.book).hero;
            return `<div class="nav-item ${b.book === st.book ? 'active' : ''}" data-book="${b.book}">
            <img class="nav-thumb" src="${asset(hero)}" alt="" loading="lazy">
            <div><b>${String(b.book).padStart(2, '0')}</b>
            <i>${b.title.replace(/^第.+卷：/, '')}</i></div></div>`;
          })
          .join('');
        el.querySelectorAll('.nav-item').forEach((n) => n.addEventListener('click', () => this.setBook(+n.dataset.book)));
        return;
      }
      if (st.mode === 'mythos') {
        el.innerHTML = this.geo.factions
          .map((f) => `<div class="nav-item"><span class="nav-dot" style="background:${f.color}"></span><div><b>${f.name}</b><i>${f.desc.slice(0, 20)}…</i></div></div>`)
          .join('');
        return;
      }
      if (st.mode === 'gallery') {
        const videos = this.media().videos || [];
        const gallery = this.media().gallery || [];
        el.innerHTML = [
          ...videos.map((v) => `<div class="nav-item" data-jump="video"><span class="nav-dot" style="background:var(--gold)"></span><div><b>影片</b><i>${esc(v.title)}</i></div></div>`),
          ...gallery.slice(0, 8).map((g) => `<div class="nav-item" data-expand data-lb="${esc(asset(g.src))}" data-cap="${esc(g.title)}"><img class="nav-thumb" src="${esc(asset(g.src))}" alt=""><div><b>${esc(g.title)}</b><i>${esc(g.credit || '')}</i></div></div>`),
        ].join('');
        return;
      }
      const activeIds = new Set(this.geo.beats.filter((bt) => bt.book === st.book).map((bt) => bt.placeId));
      el.innerHTML = this.geo.places
        .map((p) => {
          const leg = p.confidence === 'legendary' ? 'legendary' : '';
          const act = activeIds.has(p.id) ? 'active' : '';
          return `<div class="nav-item ${leg} ${act}" data-place="${p.id}">
            ${this._thumbForPlace(p)}
            <div><b>${p.name}</b><i>${p.greek || ''}</i></div></div>`;
        })
        .join('');
      el.querySelectorAll('.nav-item').forEach((n) => {
        n.addEventListener('click', () => {
          const p = this.geo.placeIdx[n.dataset.place];
          if (p) {
            this.showPlace(p);
            this.map.focusPlace(p);
          }
        });
      });
    },

    _renderBook(b, book) {
      if (!b) return;
      const beats = this.geo.beats.filter((x) => x.book === book);
      const beatHtml = beats
        .map((bt) => {
          const thumb = bt.placeId ? this.placeMedia(bt.placeId)?.hero : null;
          const thumbUrl = thumb ? esc(asset(thumb)) : '';
          return `<div class="beat ${thumb ? '' : 'no-thumb'}" data-place="${esc(bt.placeId || '')}">
            ${thumb ? `<img class="beat-thumb" src="${thumbUrl}" alt="" loading="lazy" data-lb="${thumbUrl}" data-cap="${esc(bt.title)}">` : ''}
            <div class="beat-body"><h4>${esc(bt.title)}</h4>${badge(bt.confidence)}<p>${esc(bt.text)}</p></div></div>`;
        })
        .join('');
      const chars = this.geo.characters.filter((c) => c.books?.includes(book));
      const portraits = chars
        .map((c) => {
          const port = this.charPortrait(c.id);
          if (!port) return `<span class="chip">${esc(c.name)}</span>`;
          const url = esc(asset(port));
          return `<div class="portrait-card" data-lb="${url}" data-cap="${esc(c.name)}"><img src="${url}" alt="${esc(c.name)}" loading="lazy"><span>${esc(c.name)}</span></div>`;
        })
        .join('');
      const hasPortraits = chars.some((c) => this.charPortrait(c.id));
      const bh = this.bookHero(book);
      $('#detailPanel').innerHTML = `
        <div class="detail-title">${esc(b.title)}</div>
        <div class="detail-sub">${esc(b.subtitle || '')}</div>
        ${badge(b.confidence)}
        <p><b>局势</b> ${esc(b.situation || '')}</p>
        <p>${esc(b.narrative || '')}</p>
        ${this._heroHtml(bh.hero, bh.motif || b.title)}
        ${b.filmNote ? `<p class="film-inline">FILM · ${esc(b.filmNote)}</p>` : ''}
        <p class="section-label">本卷节点</p>${beatHtml}
        ${chars.length ? `<p class="section-label">人物</p>${hasPortraits ? `<div class="portrait-row">${portraits}</div>` : `<div class="chip-row">${portraits}</div>`}` : ''}
        <p class="credit-line">${esc(this.media().creditNote || '')}</p>`;
      $('#detailPanel').querySelectorAll('.beat').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-lb]')) return; // let lightbox handle
          const p = this.geo.placeIdx[el.dataset.place];
          if (p) {
            this.showPlace(p);
            this.map.focusPlace(p);
          }
        });
      });
    },

    _renderMythos() {
      const m = this.geo.mythology;
      const sections = (m.sections || [])
        .map((s) => `<div class="beat no-thumb"><div class="beat-body"><h4>${esc(s.title)}</h4>${badge(s.confidence)}<p>${esc(s.text)}</p></div></div>`)
        .join('');
      const pantheon = (m.pantheon || [])
        .map((g) => `<div class="beat no-thumb"><div class="beat-body"><h4>${esc(g.name)} · ${esc(g.greek)}</h4><p class="dim">${esc(g.domain)}</p><p>${esc(g.odysseyRole)}</p></div></div>`)
        .join('');
      const keyChars = ['athena', 'odysseus', 'penelope']
        .map((id) => {
          const c = this.geo.characters.find((x) => x.id === id);
          const port = this.charPortrait(id);
          if (!c || !port) return '';
          const url = esc(asset(port));
          return `<div class="portrait-card" data-lb="${url}" data-cap="${esc(c.name)}"><img src="${url}" alt="${esc(c.name)}" loading="lazy"><span>${esc(c.name)}</span></div>`;
        })
        .join('');
      $('#detailPanel').innerHTML = `
        <div class="detail-title">${esc(m.title || '神话谱系')}</div>
        <div class="detail-sub">THEOGONY → ILIAD → ODYSSEY</div>
        <p>从神谱到特洛伊，再到奥德修斯归乡——阅读优先，图像作辅证。</p>
        ${this._heroHtml('assets/images/places/place-olympus.jpg', '奥林匹斯')}
        ${keyChars ? `<div class="portrait-row">${keyChars}</div>` : ''}
        ${sections}<p class="section-label">奥林匹斯</p>${pantheon}
        <p class="credit-line">${esc(this.media().creditNote || '')}</p>`;
    },

    _renderGallery() {
      const videos = this.media().videos || [];
      const audio = this.media().audio || [];
      const gallery = this.media().gallery || [];
      this._openDetail();
      const videoHtml = videos
        .map(
          (v) => `<div>
          <p class="section-label">${esc(v.title)}</p>
          <p class="video-meta">${esc(v.desc)} · ${esc(v.duration || '')} · <a href="${esc(v.sourceUrl)}" target="_blank" rel="noopener">${esc(v.license)}</a></p>
          <div class="video-frame">
            <video controls playsinline preload="metadata" poster="${esc(asset(v.poster))}">
              <source src="${esc(v.src)}" type="video/webm">
            </video>
          </div>
        </div>`
        )
        .join('');
      const audioHtml = audio
        .map(
          (a) => `<div>
          <p class="section-label">${esc(a.title)}</p>
          <p class="video-meta">${esc(a.desc)} · <a href="${esc(a.sourceUrl)}" target="_blank" rel="noopener">${esc(a.license)}</a></p>
          <div class="video-frame" style="aspect-ratio:16/9">
            <iframe src="${esc(a.embed)}" title="${esc(a.title)}" allow="encrypted-media" loading="lazy"></iframe>
          </div>
        </div>`
        )
        .join('');
      $('#detailPanel').innerHTML = `
        <div class="detail-title">映像馆</div>
        <div class="detail-sub">PUBLIC DOMAIN · COMMONS · ARCHIVE</div>
        <p>公版早期电影、有声书与古典绘画，与 Codex 场景插图并置。点图可放大。</p>
        ${videoHtml}
        ${audioHtml}
        <p class="section-label">古典绘画与遗址</p>
        ${this._galleryStrip(gallery)}
        <p class="credit-line">${esc(this.media().creditNote || '')}</p>`;
    },

    _renderFilm() {
      const f = this.geo.film;
      const hero = 'assets/images/ship-hero-cinema.jpg';
      const cast = (f.cast || []).map((c) => `<li><b>${esc(c.actor)}</b> — ${esc(c.role)}</li>`).join('');
      const map = (f.epicMapping || [])
        .map((m) => `<tr><td>${String(m.book).padStart(2, '0')}</td><td>${esc(m.epic)}</td><td class="film-note">${esc(m.filmNote)}</td></tr>`)
        .join('');
      const related = this._galleryStrip([
        { src: 'assets/images/art/olympias-trireme.jpg', title: '三列桨战舰复原', credit: '历史影像参照' },
        { src: 'assets/images/places/place-troy.jpg', title: '特洛伊视觉', credit: 'Codex 场景' },
        { src: 'assets/images/art/flaxman-dog.jpg', title: '归乡主题', credit: 'Flaxman · PD' },
      ]);
      this._openDetail();
      $('#detailPanel').innerHTML = `
        <div class="detail-title">${esc(f.title || 'The Odyssey')}</div>
        <div class="detail-sub">${esc(f.releaseDate || '')}</div>
        <p>${esc(f.officialLogline || '')}</p>
        ${this._heroHtml(hero, 'NOLAN · IMAX 70MM')}
        <p class="section-label">视觉参照</p>${related}
        <p class="section-label">阵容</p><ul class="cast-list">${cast}</ul>
        <p class="section-label">史诗对照</p>
        <table class="film-table"><tbody>${map}</tbody></table>
        <p class="disclaimer">${esc(f.disclaimer || '')}</p>`;
    },

    _search(q) {
      const ql = q.toLowerCase();
      const items = [];
      this.geo.books.forEach((b) => items.push({ type: '卷', label: `${b.book} ${b.title}`, go: () => this.setBook(b.book) }));
      this.geo.places.forEach((p) => items.push({ type: '地点', label: p.name, go: () => { this.showPlace(p); this.map.focusPlace(p); } }));
      this.geo.characters.forEach((c) => items.push({ type: '人物', label: c.name, go: () => { if (c.books?.[0]) this.setBook(c.books[0]); } }));
      const hits = items.filter((i) => i.label.toLowerCase().includes(ql)).slice(0, 20);
      $('#searchResults').innerHTML = hits
        .map((h, i) => `<div class="search-hit" data-i="${i}"><span>${h.type}</span>${h.label}</div>`)
        .join('');
      $('#searchResults').querySelectorAll('.search-hit').forEach((el) => {
        el.addEventListener('click', () => {
          hits[+el.dataset.i]?.go();
          $('#searchModal')?.classList.remove('open');
        });
      });
    },

    _tour(step) {
      const steps = this.geo.CFG.tour || [];
      const card = $('#tourCard');
      if (!card || !steps.length) return;
      step = Math.max(0, Math.min(steps.length - 1, step));
      const s = steps[step];
      card.innerHTML = `<h3>${s.title}</h3><p>${s.text}</p>
        <div class="tour-actions">
          <button id="tourPrev">${step > 0 ? '上一步' : ''}</button>
          <button id="tourNext">${step < steps.length - 1 ? '下一步' : '完成'}</button>
          <button id="tourClose">关闭</button></div>`;
      card.classList.add('open');
      $('#tourPrev')?.addEventListener('click', () => this._tour(step - 1));
      $('#tourNext')?.addEventListener('click', () => (step < steps.length - 1 ? this._tour(step + 1) : card.classList.remove('open')));
      $('#tourClose')?.addEventListener('click', () => card.classList.remove('open'));
    },
  };

  O.UI = UI;
})(window.ODY);

;
/* bootstrap */
(function (O) {
  'use strict';

  function boot() {
    const geo = O.Geo.buildGeo(window.DATA);
    const store = O.Store;
    const map = new O.MapRenderer(document.getElementById('map'), geo, store);
    O.Timeline.init(document.getElementById('tlcanvas'), geo, store);
    O.Timeline.bindClick((book) => O.UI.setBook(book));
    O.UI.init(geo, store, map);

    map.fit();
    map.focusBook(1);

    document.addEventListener('keydown', (e) => {
      const st = store.getState();
      if (e.key === 'ArrowRight') O.UI.setBook(st.book + 1);
      if (e.key === 'ArrowLeft') O.UI.setBook(st.book - 1);
      if (e.key === ' ') {
        e.preventDefault();
        document.getElementById('pPlay')?.click();
      }
    });

    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      O.Timeline.tick(dt);
      map.tick(dt);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    document.getElementById('loader')?.classList.add('hide');
    setTimeout(() => document.getElementById('intro')?.classList.add('hide'), 2200);
  }

  if (window.DATA) boot();
  else window.addEventListener('ody:data', boot);
})(window.ODY);
