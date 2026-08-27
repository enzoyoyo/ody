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
      this.canvas.addEventListener('mousedown', (e) => {
        this.dragging = true;
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
        this.cam.x = this.camStart[0] + (e.clientX - this.dragStart[0]);
        this.cam.y = this.camStart[1] + (e.clientY - this.dragStart[1]);
        this.cam.tx = this.cam.x;
        this.cam.ty = this.cam.y;
      });
      window.addEventListener('mouseup', () => {
        this.dragging = false;
        this.canvas.classList.remove('dragging');
      });
      this.canvas.addEventListener('click', (e) => {
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
