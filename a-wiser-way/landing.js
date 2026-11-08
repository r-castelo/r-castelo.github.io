// The hero plays the app's own 3D road (world.html) as a short tour: the traveller
// walks from the city gate through each chapter to the summit, then starts again.
(() => {
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const world = document.getElementById('world');
  const frame = document.getElementById('world-frame');
  const tour = document.getElementById('tour');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let ready = false, chapters = null, timer = null, onArrive = null, visible = true;

  const send = command => { if (ready) frame.contentWindow.postMessage({ awwCommand: command }, location.origin); };
  const states = current => Array.from({ length: 100 }, (_, i) => i + 1 < current ? 'done' : i + 1 === current ? 'current' : 'ahead');
  const later = (ms, fn) => { clearTimeout(timer); timer = setTimeout(fn, ms); };

  // Without WebGL, or if the world never answers, a still of the map stands in.
  const fail = () => world.classList.add('failed');
  const giveUp = setTimeout(() => { if (!world.classList.contains('live')) fail(); }, 12000);
  addEventListener('message', event => {
    if (event.origin !== location.origin || !event.data || !event.data.awwWorld) return;
    const m = event.data.awwWorld;
    if (m.type === 'ready' && !ready) {
      ready = true;
      send({ type: 'reducedMotion', reducedMotion: reduced.matches });
      start(true);
    } else if (m.type === 'firstFrame') { clearTimeout(giveUp); world.classList.add('live'); }
    else if (m.type === 'error') { clearTimeout(giveUp); fail(); }
    else if (m.type === 'arrive' && onArrive) { const f = onArrive; onArrive = null; f(); }
    else if (m.type === 'focus') follow(m.focusSession);
  });
  const hello = () => frame.contentWindow && frame.contentWindow.postMessage({ awwHello: true }, location.origin);
  hello(); frame.addEventListener('load', hello);
  reduced.addEventListener('change', () => send({ type: 'reducedMotion', reducedMotion: reduced.matches }));
  fetch('data.json').then(r => r.json()).then(d => { chapters = d.chapters; }).catch(() => {});

  // The tour: a moment at the gate, then one unbroken walk to the summit. The caption and
  // the stones behind him follow the camera, which follows him.
  let shown = null;
  // No welcome pose: it frames the traveller at another zoom, and leaving it jumps the
  // camera. The map opens at its normal view and he simply sets off; between loops the
  // world fades out, returns to the gate unseen, and fades back in.
  function reset() { send({ type: 'markers', states: states(0) }); send({ type: 'traveller', session: 0 }); send({ type: 'focus', focusSession: 0 }); }
  function walk() {
    onArrive = () => { send({ type: 'celebrate' }); later(5000, () => start(false)); };
    send({ type: 'walkTo', session: 100 });
    later(240000, () => start(false)); // never stall if an arrival is missed
  }
  function start(first) {
    shown = null; caption(null); onArrive = null;
    if (first) { reset(); return later(2200, walk); }
    world.classList.add('resetting');
    later(900, () => { reset(); later(2400, () => { world.classList.remove('resetting'); later(1400, walk); }); });
  }
  function follow(session) {
    if (!onArrive || session < 1) return;
    const chapter = Math.min(9, Math.floor((session - 1) / 10));
    if (chapter === shown) return;
    shown = chapter; caption(chapter);
    send({ type: 'markers', states: states(chapter * 10 + 1) });
  }
  function caption(i) {
    if (i === null || !chapters) { tour.classList.remove('on'); return; }
    const c = chapters[i];
    tour.classList.remove('on');
    setTimeout(() => {
      tour.innerHTML = `<span class="numeral" style="background:${c.accent}">${ROMAN[i]}</span><span><strong>${c.name}</strong><em>${c.guides}</em></span>`;
      tour.classList.add('on');
    }, 250);
  }

  // The intro narration from the app, loaded only when asked for.
  const play = document.getElementById('intro-play');
  const clock = document.getElementById('intro-time');
  let intro = null;
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  play.addEventListener('click', () => {
    if (!intro) {
      intro = new Audio('audio/intro.mp3');
      intro.addEventListener('timeupdate', () => { clock.textContent = `${fmt(intro.currentTime)} / ${fmt(intro.duration || 187)}`; });
      intro.addEventListener('ended', () => { play.setAttribute('aria-pressed', 'false'); play.querySelector('.intro-label').textContent = 'Play again'; });
    }
    if (intro.paused) { intro.play(); play.setAttribute('aria-pressed', 'true'); play.querySelector('.intro-label').textContent = 'Pause the intro'; }
    else { intro.pause(); play.setAttribute('aria-pressed', 'false'); play.querySelector('.intro-label').textContent = 'Resume the intro'; }
  });

  // Only run the world while the hero is on screen.
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting === visible) return;
    visible = entry.isIntersecting; send({ type: 'pause', paused: !visible });
  }).observe(document.querySelector('.hero'));
})();
