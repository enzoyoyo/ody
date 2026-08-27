/* UI panels */
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
      this.render(store.getState());
    },

    _bindModes() {
      document.querySelectorAll('.mode-pills button').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.store.setState({ mode: btn.dataset.mode, filmOpen: false });
          document.querySelectorAll('.mode-pills button').forEach((b) => b.classList.toggle('active', b === btn));
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

    setBook(n) {
      const book = Math.max(this.geo.CFG.startBook, Math.min(this.geo.CFG.endBook, n));
      this.store.setState({ book, filmOpen: false, detailOpen: true });
      $('.hud-right')?.classList.remove('collapsed');
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
      tip.innerHTML = `<b>${p.name}</b><br><small>${p.greek || ''} · ${confLabel(p.confidence)}</small>`;
      tip.style.left = mx + 16 + 'px';
      tip.style.top = my + 16 + 'px';
      tip.classList.add('show');
    },

    showPlace(p) {
      this.store.setState({ detailOpen: true, filmOpen: false });
      $('.hud-right')?.classList.remove('collapsed');
      const beats = this.geo.beats.filter((b) => b.placeId === p.id);
      const html = beats.map((b) => `<li><b>${String(b.book).padStart(2, '0')}</b> ${b.title}</li>`).join('');
      $('#detailPanel').innerHTML = `
        <div class="detail-title">${p.name}</div>
        <div class="detail-sub">${p.greek || ''}</div>
        ${badge(p.confidence)}
        <p>${p.note || ''}</p>
        ${html ? `<p class="section-label">情节</p><ul class="place-beats">${html}</ul>` : ''}`;
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
      else if (st.mode === 'mythos') this._renderMythos();
      else this._renderBook(b, st.book);
    },

    _renderNav(st) {
      const el = $('#navList');
      if (!el) return;
      if (st.mode === 'books') {
        el.innerHTML = this.geo.books
          .map((b) => `<div class="nav-item ${b.book === st.book ? 'active' : ''}" data-book="${b.book}">
            <span class="nav-dot"></span><b>${String(b.book).padStart(2, '0')}</b>
            <i>${b.title.replace(/^第.+卷：/, '')}</i></div>`)
          .join('');
        el.querySelectorAll('.nav-item').forEach((n) => n.addEventListener('click', () => this.setBook(+n.dataset.book)));
        return;
      }
      if (st.mode === 'mythos') {
        el.innerHTML = this.geo.factions
          .map((f) => `<div class="nav-item"><span class="nav-dot" style="background:${f.color}"></span><b>${f.name}</b><i>${f.desc.slice(0, 20)}…</i></div>`)
          .join('');
        return;
      }
      const activeIds = new Set(this.geo.beats.filter((bt) => bt.book === st.book).map((bt) => bt.placeId));
      el.innerHTML = this.geo.places
        .map((p) => {
          const leg = p.confidence === 'legendary' ? 'legendary' : '';
          const act = activeIds.has(p.id) ? 'active' : '';
          return `<div class="nav-item ${leg} ${act}" data-place="${p.id}">
            <span class="nav-dot"></span><b>${p.name}</b><i>${p.greek || ''}</i></div>`;
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
        .map((bt) => `<div class="beat" data-place="${bt.placeId || ''}"><h4>${bt.title}</h4>${badge(bt.confidence)}<p>${bt.text}</p></div>`)
        .join('');
      const chars = this.geo.characters
        .filter((c) => c.books?.includes(book))
        .map((c) => `<span class="chip">${c.name}</span>`).join('');
      $('#detailPanel').innerHTML = `
        <div class="detail-title">${b.title}</div>
        <div class="detail-sub">${b.subtitle || ''}</div>
        ${badge(b.confidence)}
        <p><b>局势</b> ${b.situation || ''}</p>
        <p>${b.narrative || ''}</p>
        ${b.filmNote ? `<p class="film-inline">FILM · ${b.filmNote}</p>` : ''}
        <p class="section-label">本卷节点</p>${beatHtml}
        ${chars ? `<p class="section-label">人物</p><div class="chip-row">${chars}</div>` : ''}`;
      $('#detailPanel').querySelectorAll('.beat').forEach((el) => {
        el.addEventListener('click', () => {
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
        .map((s) => `<div class="beat"><h4>${s.title}</h4>${badge(s.confidence)}<p>${s.text}</p></div>`)
        .join('');
      const pantheon = (m.pantheon || [])
        .map((g) => `<div class="beat"><h4>${g.name} · ${g.greek}</h4><p class="dim">${g.domain}</p><p>${g.odysseyRole}</p></div>`)
        .join('');
      $('#detailPanel').innerHTML = `
        <div class="detail-title">${m.title || '神话谱系'}</div>
        <div class="detail-sub">THEOGONY → ILIAD → ODYSSEY</div>
        ${sections}<p class="section-label">奥林匹斯</p>${pantheon}`;
    },

    _renderFilm() {
      const f = this.geo.film;
      const hero = (window.__CDN__ || '') + 'assets/images/ship-hero-cinema.jpg';
      const cast = (f.cast || []).map((c) => `<li><b>${c.actor}</b> — ${c.role}</li>`).join('');
      const map = (f.epicMapping || [])
        .map((m) => `<tr><td>${String(m.book).padStart(2, '0')}</td><td>${m.epic}</td><td class="film-note">${m.filmNote}</td></tr>`)
        .join('');
      $('#detailPanel').innerHTML = `
        <div class="film-hero" style="background-image:url('${hero}')"><span>NOLAN · IMAX 70MM</span></div>
        <div class="detail-title">${f.title || 'The Odyssey'}</div>
        <div class="detail-sub">${f.releaseDate || ''}</div>
        <p>${f.officialLogline || ''}</p>
        <p class="section-label">阵容</p><ul class="cast-list">${cast}</ul>
        <p class="section-label">史诗对照</p>
        <table class="film-table"><tbody>${map}</tbody></table>
        <p class="disclaimer">${f.disclaimer || ''}</p>`;
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
