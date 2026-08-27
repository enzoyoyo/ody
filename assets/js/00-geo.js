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
