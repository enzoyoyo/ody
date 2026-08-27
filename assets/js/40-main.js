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
