// The existing introduction is shared by both listening buttons. Audio is fetched
// only after the visitor asks to listen; native controls provide seeking/volume.
(() => {
  const audio = document.getElementById('intro-audio');
  const buttons = [...document.querySelectorAll('.intro-play')];
  const controls = document.querySelector('.audio-controls');
  const status = document.querySelector('.audio-status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fmt = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const updateAudio = () => {
    const playing = !audio.paused && !audio.ended;
    buttons.forEach(button => {
      button.setAttribute('aria-pressed', String(playing));
      button.querySelector('.intro-icon').textContent = playing ? 'Ⅱ' : '▶';
      button.querySelector('.intro-label').textContent = playing ? 'Pause the introduction' : audio.ended ? 'Listen again' : audio.currentTime > 0 ? 'Resume the introduction' : 'Listen to the introduction';
      button.querySelector('.intro-time').textContent = audio.currentTime > 0 && Number.isFinite(audio.duration) ? `${fmt(audio.currentTime)} / ${fmt(audio.duration)}` : '3 min';
    });
  };
  buttons.forEach(button => button.addEventListener('click', async () => {
    controls.hidden = false;
    status.textContent = '';
    if (!document.querySelector('.hero').contains(button)) {
      document.getElementById('listen').scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'center' });
      buttons[0].focus({ preventScroll: true });
    }
    if (!audio.paused) { audio.pause(); return; }
    try { await audio.play(); }
    catch { status.textContent = 'The introduction could not play. Try again, or use the direct audio link below.'; updateAudio(); }
  }));
  ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata'].forEach(event => audio.addEventListener(event, updateAudio));
  audio.addEventListener('error', () => { status.textContent = 'The introduction could not load. Try again, or use the direct audio link below.'; updateAudio(); });

  // Keep the map in its own visual area. Respect reduced motion, the visitor's
  // pause control, page visibility, and whether the map is on screen.
  const world = document.getElementById('world');
  const frame = document.getElementById('world-frame');
  const motion = document.querySelector('.motion-toggle');
  let ready = false, visible = true, userPaused = false, timer = null, onArrive = null;
  const send = command => { if (ready) frame.contentWindow.postMessage({ awwCommand: command }, location.origin); };
  const later = (ms, fn) => { clearTimeout(timer); timer = setTimeout(fn, ms); };
  const states = current => Array.from({ length: 100 }, (_, i) => i + 1 < current ? 'done' : i + 1 === current ? 'current' : 'ahead');
  const reset = () => { send({ type: 'markers', states: states(0) }); send({ type: 'traveller', session: 0 }); send({ type: 'focus', focusSession: 0 }); };
  const paused = () => reduced.matches || userPaused || !visible || document.hidden;
  const updateMotion = () => {
    const stopped = reduced.matches || userPaused;
    motion.textContent = stopped ? 'Play animation' : 'Pause animation';
    motion.setAttribute('aria-pressed', String(stopped));
    motion.disabled = reduced.matches;
    if (reduced.matches) motion.textContent = 'Still view';
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
    if (first) { reset(); updateMotion(); return later(2200, walk); }
    world.classList.add('resetting');
    later(900, () => { reset(); later(2400, () => { world.classList.remove('resetting'); later(1400, walk); }); });
  }
  const fail = () => { world.classList.add('failed'); motion.hidden = true; clearTimeout(timer); };
  const giveUp = setTimeout(() => { if (!world.classList.contains('live')) fail(); }, 12000);
  addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || !event.data?.awwWorld) return;
    const message = event.data.awwWorld;
    if (message.type === 'ready' && !ready) {
      ready = true; send({ type: 'reducedMotion', reducedMotion: reduced.matches }); start(true); updateMotion();
    } else if (message.type === 'firstFrame') {
      clearTimeout(giveUp); world.classList.remove('failed'); world.classList.add('live'); motion.hidden = false;
    } else if (message.type === 'error') { clearTimeout(giveUp); fail(); }
    else if (message.type === 'arrive' && onArrive) { const next = onArrive; onArrive = null; next(); }
    else if (message.type === 'focus' && onArrive && message.focusSession >= 1) {
      const chapter = Math.min(9, Math.floor((message.focusSession - 1) / 10));
      send({ type: 'markers', states: states(chapter * 10 + 1) });
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
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; updateMotion(); }).observe(document.querySelector('.hero-art'));
  updateMotion();
})();
