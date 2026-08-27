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
