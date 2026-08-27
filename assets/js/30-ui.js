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
          $('.hud-right')?.classList.remove('collapsed');
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
      const lb = $('#lightbox');
      $('#lbClose')?.addEventListener('click', () => this.closeLightbox());
      lb?.addEventListener('click', (e) => {
        if (e.target === lb) this.closeLightbox();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeLightbox();
      });
    },

    openLightbox(src, cap) {
      const lb = $('#lightbox');
      if (!lb) return;
      $('#lbImg').src = asset(src);
      $('#lbCap').textContent = cap || '';
      lb.classList.add('open');
      lb.setAttribute('aria-hidden', 'false');
    },

    closeLightbox() {
      const lb = $('#lightbox');
      lb?.classList.remove('open');
      lb?.setAttribute('aria-hidden', 'true');
    },

    setBook(n) {
      const book = Math.max(this.geo.CFG.startBook, Math.min(this.geo.CFG.endBook, n));
      this.store.setState({ book, filmOpen: false, detailOpen: true, mode: this.store.getState().mode === 'gallery' ? 'books' : this.store.getState().mode });
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
      const hero = this.placeMedia(p.id)?.hero;
      tip.innerHTML = `${hero ? `<img src="${asset(hero)}" alt="" style="width:120px;height:68px;object-fit:cover;border-radius:8px;display:block;margin-bottom:8px">` : ''}
        <b>${p.name}</b><br><small>${p.greek || ''} · ${confLabel(p.confidence)}</small>`;
      tip.style.left = mx + 16 + 'px';
      tip.style.top = my + 16 + 'px';
      tip.classList.add('show');
    },

    _heroHtml(src, cap) {
      if (!src) return '';
      return `<div class="media-hero" data-lb="${asset(src)}" data-cap="${cap || ''}">
        <img src="${asset(src)}" alt="${cap || ''}" loading="lazy">
        ${cap ? `<div class="cap">${cap}</div>` : ''}
      </div>`;
    },

    _galleryStrip(items) {
      if (!items?.length) return '';
      return `<div class="media-strip">${items
        .map(
          (g) => `<div class="media-card" data-lb="${asset(g.src)}" data-cap="${g.caption || g.title || ''}">
          <img src="${asset(g.src)}" alt="" loading="lazy">
          <div class="meta"><b>${g.caption || g.title || ''}</b><small>${g.credit || ''}</small></div>
        </div>`
        )
        .join('')}</div>`;
    },

    _bindMediaClicks(root) {
      root.querySelectorAll('[data-lb]').forEach((el) => {
        el.addEventListener('click', () => this.openLightbox(el.dataset.lb, el.dataset.cap));
      });
    },

    showPlace(p) {
      this.store.setState({ detailOpen: true, filmOpen: false });
      $('.hud-right')?.classList.remove('collapsed');
      const beats = this.geo.beats.filter((b) => b.placeId === p.id);
      const html = beats.map((b) => `<li><b>${String(b.book).padStart(2, '0')}</b> ${b.title}</li>`).join('');
      const pm = this.placeMedia(p.id);
      const hero = pm?.hero || 'assets/images/mediterranean-cinema-bg.jpg';
      $('#detailPanel').innerHTML = `
        ${this._heroHtml(hero, p.name)}
        <div class="detail-title">${p.name}</div>
        <div class="detail-sub">${p.greek || ''}</div>
        ${badge(p.confidence)}
        <p>${p.note || ''}</p>
        ${pm?.gallery?.length ? `<p class="section-label">史料影像</p>${this._galleryStrip(pm.gallery)}` : ''}
        ${html ? `<p class="section-label">情节</p><ul class="place-beats">${html}</ul>` : ''}
        <p class="credit-line">${this.media().creditNote || ''}</p>`;
      this._bindMediaClicks($('#detailPanel'));
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
          ...videos.map((v) => `<div class="nav-item" data-jump="video"><span class="nav-dot" style="background:var(--gold)"></span><div><b>影片</b><i>${v.title}</i></div></div>`),
          ...gallery.slice(0, 8).map((g) => `<div class="nav-item" data-lb="${asset(g.src)}" data-cap="${g.title}"><img class="nav-thumb" src="${asset(g.src)}" alt=""><div><b>${g.title}</b><i>${g.credit || ''}</i></div></div>`),
        ].join('');
        this._bindMediaClicks(el);
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
          return `<div class="beat" data-place="${bt.placeId || ''}">
            ${thumb ? `<img src="${asset(thumb)}" alt="" style="width:100%;height:88px;object-fit:cover;border-radius:8px;margin-bottom:8px" loading="lazy">` : ''}
            <h4>${bt.title}</h4>${badge(bt.confidence)}<p>${bt.text}</p></div>`;
        })
        .join('');
      const chars = this.geo.characters.filter((c) => c.books?.includes(book));
      const portraits = chars
        .map((c) => {
          const port = this.charPortrait(c.id);
          if (!port) return `<span class="chip">${c.name}</span>`;
          return `<div class="portrait-card" data-lb="${asset(port)}" data-cap="${c.name}"><img src="${asset(port)}" alt="${c.name}" loading="lazy"><span>${c.name}</span></div>`;
        })
        .join('');
      const hasPortraits = chars.some((c) => this.charPortrait(c.id));
      const bh = this.bookHero(book);
      $('#detailPanel').innerHTML = `
        ${this._heroHtml(bh.hero, bh.motif || b.title)}
        <div class="detail-title">${b.title}</div>
        <div class="detail-sub">${b.subtitle || ''}</div>
        ${badge(b.confidence)}
        <p><b>局势</b> ${b.situation || ''}</p>
        <p>${b.narrative || ''}</p>
        ${b.filmNote ? `<p class="film-inline">FILM · ${b.filmNote}</p>` : ''}
        <p class="section-label">本卷节点</p>${beatHtml}
        ${chars.length ? `<p class="section-label">人物</p>${hasPortraits ? `<div class="portrait-row">${portraits}</div>` : `<div class="chip-row">${portraits}</div>`}` : ''}
        <p class="credit-line">${this.media().creditNote || ''}</p>`;
      $('#detailPanel').querySelectorAll('.beat').forEach((el) => {
        el.addEventListener('click', () => {
          const p = this.geo.placeIdx[el.dataset.place];
          if (p) {
            this.showPlace(p);
            this.map.focusPlace(p);
          }
        });
      });
      this._bindMediaClicks($('#detailPanel'));
    },

    _renderMythos() {
      const m = this.geo.mythology;
      const sections = (m.sections || [])
        .map((s) => `<div class="beat"><h4>${s.title}</h4>${badge(s.confidence)}<p>${s.text}</p></div>`)
        .join('');
      const pantheon = (m.pantheon || [])
        .map((g) => `<div class="beat"><h4>${g.name} · ${g.greek}</h4><p class="dim">${g.domain}</p><p>${g.odysseyRole}</p></div>`)
        .join('');
      const keyChars = ['athena', 'odysseus', 'penelope']
        .map((id) => {
          const c = this.geo.characters.find((x) => x.id === id);
          const port = this.charPortrait(id);
          if (!c || !port) return '';
          return `<div class="portrait-card" data-lb="${asset(port)}" data-cap="${c.name}"><img src="${asset(port)}" alt="${c.name}" loading="lazy"><span>${c.name}</span></div>`;
        })
        .join('');
      $('#detailPanel').innerHTML = `
        ${this._heroHtml('assets/images/places/place-olympus.jpg', '奥林匹斯')}
        <div class="detail-title">${m.title || '神话谱系'}</div>
        <div class="detail-sub">THEOGONY → ILIAD → ODYSSEY</div>
        ${keyChars ? `<div class="portrait-row">${keyChars}</div>` : ''}
        ${sections}<p class="section-label">奥林匹斯</p>${pantheon}
        <p class="credit-line">${this.media().creditNote || ''}</p>`;
      this._bindMediaClicks($('#detailPanel'));
    },

    _renderGallery() {
      const videos = this.media().videos || [];
      const audio = this.media().audio || [];
      const gallery = this.media().gallery || [];
      const videoHtml = videos
        .map(
          (v) => `<div>
          <p class="section-label">${v.title}</p>
          <p class="video-meta">${v.desc} · ${v.duration || ''} · <a href="${v.sourceUrl}" target="_blank" rel="noopener">${v.license}</a></p>
          <div class="video-frame">
            <video controls preload="metadata" poster="${asset(v.poster)}" crossorigin="anonymous">
              <source src="${v.src}" type="video/webm">
            </video>
          </div>
        </div>`
        )
        .join('');
      const audioHtml = audio
        .map(
          (a) => `<div>
          <p class="section-label">${a.title}</p>
          <p class="video-meta">${a.desc} · <a href="${a.sourceUrl}" target="_blank" rel="noopener">${a.license}</a></p>
          <div class="video-frame" style="aspect-ratio:16/9">
            <iframe src="${a.embed}" title="${a.title}" allow="encrypted-media" loading="lazy"></iframe>
          </div>
        </div>`
        )
        .join('');
      $('#detailPanel').innerHTML = `
        ${this._heroHtml('assets/images/art/olympias-trireme.jpg', '映像馆 · ARCHIVE')}
        <div class="detail-title">映像馆</div>
        <div class="detail-sub">PUBLIC DOMAIN · COMMONS · ARCHIVE</div>
        <p>公版早期电影、有声书与古典绘画，与 Codex 场景插图并置，让史诗可读可看可听。</p>
        ${videoHtml}
        ${audioHtml}
        <p class="section-label">古典绘画与遗址</p>
        ${this._galleryStrip(gallery)}
        <p class="credit-line">${this.media().creditNote || ''}</p>`;
      this._bindMediaClicks($('#detailPanel'));
    },

    _renderFilm() {
      const f = this.geo.film;
      const hero = 'assets/images/ship-hero-cinema.jpg';
      const cast = (f.cast || []).map((c) => `<li><b>${c.actor}</b> — ${c.role}</li>`).join('');
      const map = (f.epicMapping || [])
        .map((m) => `<tr><td>${String(m.book).padStart(2, '0')}</td><td>${m.epic}</td><td class="film-note">${m.filmNote}</td></tr>`)
        .join('');
      const related = this._galleryStrip([
        { src: 'assets/images/art/olympias-trireme.jpg', title: '三列桨战舰复原', credit: '历史影像参照' },
        { src: 'assets/images/places/place-troy.jpg', title: '特洛伊视觉', credit: 'Codex 场景' },
        { src: 'assets/images/art/flaxman-dog.jpg', title: '归乡主题', credit: 'Flaxman · PD' },
      ]);
      $('#detailPanel').innerHTML = `
        ${this._heroHtml(hero, 'NOLAN · IMAX 70MM')}
        <div class="detail-title">${f.title || 'The Odyssey'}</div>
        <div class="detail-sub">${f.releaseDate || ''}</div>
        <p>${f.officialLogline || ''}</p>
        <p class="section-label">视觉参照</p>${related}
        <p class="section-label">阵容</p><ul class="cast-list">${cast}</ul>
        <p class="section-label">史诗对照</p>
        <table class="film-table"><tbody>${map}</tbody></table>
        <p class="disclaimer">${f.disclaimer || ''}</p>`;
      this._bindMediaClicks($('#detailPanel'));
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
