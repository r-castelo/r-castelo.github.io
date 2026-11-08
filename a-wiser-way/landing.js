// Drives the app's own 3D road (world.html) from the page: scroll walks the traveller
// from the city gate to the summit, chapter by chapter.
(() => {
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const world = document.getElementById('world');
  const frame = document.getElementById('world-frame');
  const hero = document.querySelector('.hero');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let ready = false, data = null, queue = [];
  const view = { mode: null, session: -1, paused: null };

  const send = command => {
    if (!ready) { queue.push(command); return; }
    frame.contentWindow.postMessage({ awwCommand: command }, location.origin);
  };
  const states = (current, selected) => Array.from({ length: 100 }, (_, i) =>
    i + 1 < current ? 'done' : i + 1 === current ? 'current' : 'ahead');

  // Without WebGL, or if the world never answers, a still of the map stands in.
  const fail = () => world.classList.add('failed');
  const giveUp = setTimeout(() => { if (!world.classList.contains('live')) fail(); }, 12000);
  addEventListener('message', event => {
    if (event.origin !== location.origin || !event.data || !event.data.awwWorld) return;
    const message = event.data.awwWorld;
    if (message.type === 'ready') {
      if (ready) return;
      ready = true;
      send({ type: 'reducedMotion', reducedMotion: reduced.matches });
      send({ type: 'markers', states: states(0) });
      queue.splice(0).forEach(send);
      sync();
    } else if (message.type === 'firstFrame') {
      clearTimeout(giveUp); world.classList.add('live');
    } else if (message.type === 'error') {
      clearTimeout(giveUp); fail();
    } else if (message.type === 'select' && document.body.classList.contains('exploring')) {
      showStop(message.session);
    }
  });
  // Ask for anything the world said before this script was listening.
  const hello = () => frame.contentWindow && frame.contentWindow.postMessage({ awwHello: true }, location.origin);
  hello(); frame.addEventListener('load', hello);
  reduced.addEventListener('change', () => send({ type: 'reducedMotion', reducedMotion: reduced.matches }));

  // Chapter panels, from the app's own content data.
  const chaptersEl = document.getElementById('chapters');
  fetch('data.json').then(r => r.json()).then(json => {
    data = json;
    chaptersEl.innerHTML = data.chapters.map((c, i) => {
      const sessions = data.sessions.filter(s => s.chapter === i + 1);
      const picks = [sessions[0], sessions[Math.floor(sessions.length / 2) - 1], sessions[sessions.length - 2]].filter(Boolean);
      return `<section class="chapter" data-chapter="${i}" aria-labelledby="ch-${i}">
        <div class="panel">
          <div class="chapter-head"><span class="numeral" style="background:${c.accent}">${ROMAN[i]}</span>
            <div><h3 id="ch-${i}">${c.name}</h3><p class="guides">${c.guides}</p></div></div>
          <p class="question">${c.question}</p>
          <ol class="sessions">${picks.map(s => `<li><span class="n">${s.number}</span><span>${s.title}</span></li>`).join('')}</ol>
        </div></section>`;
    }).join('');
    sync();
  }).catch(() => {});

  // Scroll choreography.
  let ticking = false;
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; sync(); }); } }, { passive: true });
  addEventListener('resize', () => sync());

  function sync() {
    if (document.body.classList.contains('exploring')) return;
    const h = innerHeight, mid = h * 0.55;
    const paper = document.querySelector('.paper').getBoundingClientRect();
    setPaused(paper.top <= 0);
    document.body.classList.toggle('on-road', scrollY > h * 0.5);
    // The welcome words step back as the road begins, so they never sit over the map.
    hero.style.opacity = String(Math.max(0, 1 - scrollY / (h * 0.45)));
    if (scrollY < h * 0.45) return setView('welcome', 0);
    let chapter = -1;
    document.querySelectorAll('.chapter').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < mid) chapter = Number(el.dataset.chapter);
    });
    const explore = document.getElementById('explore').getBoundingClientRect();
    if (explore.top < mid) return setView('road', 100);
    setView('road', chapter < 0 ? 1 : chapter * 10 + 1);
  }

  function setView(mode, session) {
    if (mode === view.mode && session === view.session) return;
    const forward = mode === 'road' && view.mode === 'road' && session > view.session;
    const previous = view.session;
    if (mode === 'welcome') {
      send({ type: 'markers', states: states(0) });
      send({ type: 'welcome', enabled: true });
    } else {
      if (view.mode !== 'road') send({ type: 'welcome', enabled: false });
      send({ type: 'markers', states: states(session) });
      if (forward && session - previous <= 10 && !reduced.matches) {
        // One chapter on: the traveller walks it, and the camera follows.
        send({ type: 'walkTo', session });
      } else {
        send({ type: 'traveller', session });
        send({ type: 'focus', focusSession: session });
      }
    }
    view.mode = mode; view.session = session;
  }

  function setPaused(paused) {
    if (paused === view.paused) return;
    view.paused = paused; send({ type: 'pause', paused });
  }

  // Explore mode: hand the world the pointer.
  const ui = document.getElementById('explore-ui');
  const card = document.getElementById('stop-card');
  const hint = document.getElementById('explore-hint');
  const opener = document.getElementById('explore-open');
  const closer = document.getElementById('explore-close');
  function openExplore() {
    document.body.classList.add('exploring'); ui.hidden = false; card.hidden = true; hint.hidden = false;
    setPaused(false);
    send({ type: 'welcome', enabled: false });
    send({ type: 'markers', states: states(1) });
    send({ type: 'traveller', session: 1 });
    send({ type: 'focus', focusSession: 1 });
    view.mode = 'explore';
    closer.focus();
  }
  function closeExplore() {
    document.body.classList.remove('exploring'); ui.hidden = true;
    view.mode = null; view.session = -1; sync(); opener.focus();
  }
  function showStop(n) {
    if (!data) return;
    const s = data.sessions.find(x => x.number === n);
    if (!s) return;
    const c = data.chapters[s.chapter - 1];
    hint.hidden = true;
    card.innerHTML = `<p class="eyebrow">Session ${s.number} · ${s.place}</p><h3>${s.title}</h3><p>${c.name} · <em>${c.guides}</em></p>`;
    card.hidden = false;
    send({ type: 'markers', states: states(1), selectedSession: n });
    send({ type: 'focus', focusSession: n });
  }
  opener.addEventListener('click', openExplore);
  closer.addEventListener('click', closeExplore);
  addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('exploring')) closeExplore(); });
})();
