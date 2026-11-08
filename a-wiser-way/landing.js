// Choreography for the landing page. Everything here is decoration over a page that
// reads fine without it; reduced motion gets the still version of each piece.
(() => {
  document.documentElement.classList.add('js');
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = matchMedia('(max-width: 760px)');
  const clamp = (value, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value));
  const seen = (elements, fn, options = { threshold: .25 }) => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { fn(entry.target); observer.unobserve(entry.target); }
    }), options);
    elements.forEach(element => observer.observe(element));
  };
  const chapters = fetch('data.json').then(response => response.json()).then(data => data.chapters).catch(() => []);

  // The introduction: one audio element, three ways to control it.
  const audio = $('#intro-audio');
  const buttons = $$('.intro-play');
  const scrub = $('.scrub'), range = $('.scrub-range'), status = $('.audio-status');
  const dock = $('#dock'), miniPlay = $('.mini-play');
  const fmt = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  let pastHero = false, seeking = false;
  // The dock (introduction and store buttons) stays on screen from the moment the hero's own button scrolls away.
  const updateDock = () => {
    dock.classList.toggle('is-on', pastHero);
    dock.toggleAttribute('inert', !pastHero);
    dock.setAttribute('aria-hidden', String(!pastHero));
  };
  const updateAudio = () => {
    const playing = !audio.paused && !audio.ended;
    const known = Number.isFinite(audio.duration) && audio.duration > 0;
    const progress = known ? audio.currentTime / audio.duration : 0;
    document.body.classList.toggle('is-playing', playing);
    buttons.forEach(button => {
      button.setAttribute('aria-pressed', String(playing));
      button.querySelector('.intro-label').textContent = playing ? 'Pause the introduction' : audio.ended ? 'Listen again' : audio.currentTime > 0 ? 'Resume the introduction' : 'Listen to the introduction';
      button.querySelector('.intro-time').textContent = audio.currentTime > 0 && known ? `${fmt(audio.currentTime)} / ${fmt(audio.duration)}` : '3 min';
    });
    if (!seeking) range.value = String(Math.round(progress * 1000));
    range.style.setProperty('--p', `${progress * 100}%`);
    $('.scrub-now').textContent = fmt(audio.currentTime);
    $('.scrub-left').textContent = `−${fmt(known ? audio.duration - audio.currentTime : 180)}`;
    $$('.mini-fill').forEach(fill => { fill.style.width = `${progress * 100}%`; });
    $('.mini-time').textContent = audio.currentTime > 0 ? fmt(audio.currentTime) : '3 min';
    miniPlay.setAttribute('aria-label', playing ? 'Pause the introduction' : 'Play the introduction');
  };
  const toggleAudio = async () => {
    scrub.hidden = false; status.textContent = '';
    if (!audio.paused) { audio.pause(); return; }
    try { await audio.play(); }
    catch { status.textContent = 'The introduction could not play. Try again, or use the direct audio link at the end of the page.'; updateAudio(); }
  };
  buttons.forEach(button => button.addEventListener('click', toggleAudio));
  miniPlay.addEventListener('click', toggleAudio);
  range.addEventListener('input', () => {
    seeking = true;
    if (Number.isFinite(audio.duration)) audio.currentTime = range.value / 1000 * audio.duration;
    range.style.setProperty('--p', `${range.value / 10}%`);
  });
  range.addEventListener('change', () => { seeking = false; });
  ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata'].forEach(event => audio.addEventListener(event, updateAudio));
  audio.addEventListener('error', () => { status.textContent = 'The introduction could not load. Try again, or use the direct audio link at the end of the page.'; updateAudio(); });
  // Measured on scroll: an observer misses a jump past the button when it started below the fold.
  const listen = $('#listen');
  let dockFrame = 0;
  const checkDock = () => { dockFrame = 0; const past = listen.getBoundingClientRect().bottom < 0; if (past !== pastHero) { pastHero = past; updateDock(); } };
  addEventListener('scroll', () => { if (!dockFrame) dockFrame = requestAnimationFrame(checkDock); }, { passive: true });
  updateDock(); checkDock();
  // Store buttons are placeholders until the listings exist: give them a real href and drop aria-disabled.
  $$('.store').forEach(link => link.addEventListener('click', event => { if (link.getAttribute('aria-disabled') === 'true') event.preventDefault(); }));

  // The hero world: the app's own map, walking from the city gate to the summit.
  const world = $('#world'), frame = $('#world-frame'), motion = $('.motion-toggle'), hero = $('.hero');
  const plaque = $('#plaque');
  let ready = false, visible = true, userPaused = false, timer = null, onArrive = null, plaqueChapter = -1;
  const send = command => { if (ready) frame.contentWindow.postMessage({ awwCommand: command }, location.origin); };
  const later = (ms, fn) => { clearTimeout(timer); timer = setTimeout(fn, ms); };
  // Every stop shows its number, as if the whole road were open; 'current' is the numbered marker.
  const open = Array(100).fill('current');
  const showStop = async session => {
    const list = await chapters;
    const index = Math.min(9, Math.max(0, Math.floor((session - 1) / 10)));
    $('#plaque-session').textContent = session >= 1 ? String(session) : '0';
    const chapter = list[index];
    if (!chapter || index === plaqueChapter) return;
    plaqueChapter = index;
    plaque.querySelector('.plaque-numeral').textContent = chapter.roman;
    plaque.querySelector('.plaque-name').textContent = chapter.name;
    plaque.querySelector('.plaque-question').textContent = chapter.question;
    plaque.style.setProperty('--chapter', chapter.accent);
    plaque.classList.remove('swap'); void plaque.offsetWidth; plaque.classList.add('swap');
  };
  const reset = () => { send({ type: 'markers', states: open }); send({ type: 'traveller', session: 0 }); send({ type: 'focus', focusSession: 0 }); showStop(0); };
  const paused = () => reduced.matches || userPaused || !visible || document.hidden;
  const updateMotion = () => {
    const stopped = reduced.matches || userPaused;
    motion.setAttribute('aria-pressed', String(stopped));
    motion.setAttribute('aria-label', reduced.matches ? 'Still view' : stopped ? 'Play animation' : 'Pause animation');
    motion.disabled = reduced.matches;
    send({ type: 'pause', paused: paused() });
  };
  function walk() {
    if (paused()) return later(1000, walk);
    onArrive = () => { if (!paused()) send({ type: 'celebrate' }); later(5000, () => start(false)); };
    send({ type: 'walkTo', session: 100 });
    later(240000, () => start(false));
  }
  function start(first) {
    onArrive = null;
    if (reduced.matches) { reset(); updateMotion(); return; }
    if (paused()) return later(1000, () => start(first));
    if (first) { reset(); updateMotion(); return later(1800, walk); }
    world.classList.add('resetting');
    later(900, () => { reset(); later(2400, () => { world.classList.remove('resetting'); later(1400, walk); }); });
  }
  // The still image is fetched only when the world can't run, so a working world fades in from paper with no flicker.
  const fail = () => { world.classList.add('failed'); motion.hidden = true; clearTimeout(timer); };
  if (world.classList.contains('failed')) fail();  // the inline check found no WebGL
  const giveUp = setTimeout(() => { if (!world.classList.contains('live')) fail(); }, 15000);
  addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data?.awwWorld) return;
    const message = event.data.awwWorld;
    if (message.type === 'ready' && !ready) {
      ready = true; send({ type: 'reducedMotion', reducedMotion: reduced.matches }); start(true); updateMotion();
    } else if (message.type === 'firstFrame') {
      // The first frames are the camera settling on the gate; fade in once it has, so nothing jumps.
      clearTimeout(giveUp); world.classList.remove('failed'); motion.hidden = false;
      setTimeout(() => world.classList.add('live'), 900);
    } else if (message.type === 'error') { clearTimeout(giveUp); fail(); }
    else if (message.type === 'arrive' && onArrive) { const next = onArrive; onArrive = null; next(); }
    else if (message.type === 'focus' && onArrive && message.focusSession >= 1) {
      showStop(message.focusSession);
    }
  });
  const hello = () => frame.contentWindow?.postMessage({ awwHello: true }, location.origin);
  hello(); frame.addEventListener('load', hello);
  motion.addEventListener('click', () => { userPaused = !userPaused; updateMotion(); });
  reduced.addEventListener('change', () => {
    clearTimeout(timer); world.classList.remove('resetting');
    send({ type: 'reducedMotion', reducedMotion: reduced.matches });
    if (reduced.matches) { onArrive = null; reset(); } else start(true);
    updateMotion();
  });
  document.addEventListener('visibilitychange', updateMotion);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; updateMotion(); }).observe(hero);
  updateMotion();

  // Reveals, the dealt deck, and the hundred.
  seen($$('.reveal'), element => element.classList.add('is-in'), { threshold: .2 });
  seen([$('.deck')], deck => deck.classList.add('is-in'));
  const hundred = $('#hundred');
  chapters.then(list => {
    hundred.innerHTML = Array.from({ length: 100 }, (_, n) => `<i class="${n < 5 ? 'is-free' : ''}" style="--n:${n};--row:${list[Math.floor(n / 10)]?.accent ?? 'var(--dot)'}"></i>`).join('') +
      '<span class="hundred-legend"><span><b>1–5</b> free</span><span>6–100 · one payment</span></span>';
    seen([hundred], element => { element.classList.add('is-in'); setTimeout(() => element.classList.add('is-lit'), 1300); });
  });

  // Inside a session: steps drive the phone's screen; scroll and the pointer tilt it.
  const device = $('#device'), stage = $('.stage'), how = $('#how');
  const body = device.querySelector('.device-body');
  for (let i = 12; i >= 1; i--) {
    const edge = document.createElement('span');
    edge.className = 'device-edge';
    edge.style.transform = `translateZ(${-i}px)`;
    if (i === 12) edge.style.background = '#0D0A07';
    device.insertBefore(edge, body);
  }
  const steps = $$('.step'), shots = $$('.shot');
  const tabs = $$('.step-tabs button');
  let current = 0;
  const setStep = index => {
    current = index;
    steps.forEach((step, i) => step.classList.toggle('is-on', i === index));
    shots.forEach((shot, i) => shot.classList.toggle('is-on', i === index));
    tabs.forEach((tab, i) => tab.setAttribute('aria-pressed', String(i === index)));
    $('#track').style.setProperty('--t', String(index / (steps.length - 1)));
  };
  if (narrow.matches) {
    // On a phone a sticky device would cover the text, so the steps are a small carousel:
    // tabs, a swipe on the phone, and a slow advance while it's on screen until the reader takes over.
    let auto = !reduced.matches, onScreen = false;
    const go = index => setStep((index + steps.length) % steps.length);
    const stop = () => { auto = false; };
    tabs.forEach((tab, i) => tab.addEventListener('click', () => { stop(); go(i); }));
    let startX = null;
    stage.addEventListener('touchstart', event => { startX = event.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', event => {
      const dx = event.changedTouches[0].clientX - (startX ?? event.changedTouches[0].clientX);
      if (Math.abs(dx) > 40) { stop(); go(current + (dx < 0 ? 1 : -1)); }
      startX = null;
    }, { passive: true });
    new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; }, { threshold: .3 }).observe(stage);
    setInterval(() => { if (auto && onScreen && !document.hidden) go(current + 1); }, 4500);
  } else {
    const stepWatcher = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) setStep(steps.indexOf(entry.target)); }),
      { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(step => stepWatcher.observe(step));
  }

  const tilt = { rx: 6, ry: -18, rz: -1 }, pointer = { x: -1, y: -1, active: false };
  let howVisible = false, frameId = 0;
  addEventListener('pointermove', event => { pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = event.pointerType === 'mouse'; }, { passive: true });
  const tick = () => {
    frameId = 0;
    if (!howVisible || reduced.matches) return;
    const r = how.getBoundingClientRect();
    const q = clamp((innerHeight - r.top) / (r.height + innerHeight));
    const target = { rx: 9 - q * 12, ry: -24 + q * 40, rz: -2 + q * 3 };
    if (pointer.active) {
      const s = stage.getBoundingClientRect();
      const cx = s.left + s.width / 2, cy = s.top + s.height / 2;
      const near = clamp(1 - Math.hypot(pointer.x - cx, pointer.y - cy) / 720);
      target.ry += clamp((pointer.x - cx) / 360, -1, 1) * 22 * near;
      target.rx -= clamp((pointer.y - cy) / 360, -1, 1) * 14 * near;
    }
    let moving = false;
    for (const key of ['rx', 'ry', 'rz']) {
      const delta = target[key] - tilt[key];
      tilt[key] += delta * .08;
      if (Math.abs(delta) > .01) moving = true;
    }
    device.style.setProperty('--rx', `${tilt.rx.toFixed(2)}deg`);
    device.style.setProperty('--ry', `${tilt.ry.toFixed(2)}deg`);
    device.style.setProperty('--rz', `${tilt.rz.toFixed(2)}deg`);
    device.style.setProperty('--gx', `${(tilt.ry * 1.6).toFixed(1)}%`);
    stage.style.setProperty('--sx', `${(-tilt.ry * 1.4).toFixed(1)}px`);
    if (moving || pointer.active) frameId = requestAnimationFrame(tick);
  };
  const kick = () => { if (!frameId && howVisible) frameId = requestAnimationFrame(tick); };
  new IntersectionObserver(([entry]) => { howVisible = entry.isIntersecting; kick(); }).observe(how);
  addEventListener('scroll', kick, { passive: true });
  addEventListener('pointermove', kick, { passive: true });

  // The road: drawn through the ten chapter marks as you scroll.
  const map = $('.road-map'), bed = $('.road-bed'), ink = $('.road-ink'), walker = $('.road-walker');
  const stops = $$('.stop');
  let roadLength = 0, stopLengths = [];
  const buildRoad = () => {
    const base = map.getBoundingClientRect();
    const points = stops.map(stop => {
      const m = stop.querySelector('.stop-mark').getBoundingClientRect();
      return { x: m.left + m.width / 2 - base.left, y: m.top + m.height / 2 - base.top };
    });
    const parts = [`M${points[0].x} ${points[0].y}`];
    stopLengths = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], mid = (a.y + b.y) / 2;
      parts.push(`C${a.x} ${mid} ${b.x} ${mid} ${b.x} ${b.y}`);
      ink.setAttribute('d', parts.join(''));
      stopLengths.push(ink.getTotalLength());
    }
    const d = parts.join('');
    bed.setAttribute('d', d); ink.setAttribute('d', d);
    roadLength = ink.getTotalLength();
    ink.style.strokeDasharray = `${roadLength} ${roadLength}`;
    drawRoad();
  };
  const drawRoad = () => {
    if (!roadLength) return;
    const r = map.getBoundingClientRect();
    const q = reduced.matches ? 1 : clamp((innerHeight * .62 - r.top) / r.height);
    const length = q * roadLength;
    ink.style.strokeDashoffset = String(roadLength - length);
    const at = ink.getPointAtLength(length);
    walker.style.transform = `translate(${at.x}px, ${at.y}px)`;
    walker.hidden = reduced.matches;
    stops.forEach((stop, i) => stop.classList.toggle('is-lit', stopLengths[i] <= length + 2));
  };
  let roadFrame = 0;
  addEventListener('scroll', () => { if (!roadFrame) roadFrame = requestAnimationFrame(() => { roadFrame = 0; drawRoad(); }); }, { passive: true });
  addEventListener('resize', buildRoad);
  document.fonts?.ready.then(buildRoad);
  buildRoad();

  // The journal entry writes itself once.
  const entry = $('.page-entry');
  seen([entry], element => {
    if (reduced.matches) return;
    const text = element.dataset.text;
    element.setAttribute('aria-label', text);
    element.innerHTML = '<span class="ghost" aria-hidden="true"></span><span class="typed" aria-hidden="true"></span>';
    element.querySelector('.ghost').textContent = text;
    const typed = element.querySelector('.typed');
    element.classList.add('typing');
    let i = 0;
    const next = () => {
      typed.textContent = text.slice(0, ++i);
      if (i >= text.length) { setTimeout(() => element.classList.remove('typing'), 2400); return; }
      const ch = text[i - 1];
      setTimeout(next, ch === '.' ? 420 : ch === ',' ? 220 : 26 + Math.random() * 34);
    };
    setTimeout(next, 500);
  }, { threshold: .6 });

  // The hero world drifts a little as it scrolls away.
  let heroFrame = 0;
  addEventListener('scroll', () => {
    if (heroFrame || reduced.matches || narrow.matches) return;  // on a phone the band would slide under the headline
    heroFrame = requestAnimationFrame(() => {
      heroFrame = 0;
      const p = clamp(scrollY / hero.offsetHeight);
      if (p < 1) world.style.transform = `translate3d(0, ${(scrollY * .3).toFixed(1)}px, 0) scale(${(1 + p * .06).toFixed(4)})`;
    });
  }, { passive: true });
})();
