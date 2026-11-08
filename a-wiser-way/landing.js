// The hero plays the app's own 3D road (world.html) as a short tour: the traveller
// walks from the city gate through each chapter to the summit, then starts again.
(() => {
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const world = document.getElementById('world');
  const frame = document.getElementById('world-frame');
  const tour = document.getElementById('tour');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let ready = false, chapters = null, step = -1, timer = null, onArrive = null, visible = true;

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
      start();
    } else if (m.type === 'firstFrame') { clearTimeout(giveUp); world.classList.add('live'); }
    else if (m.type === 'error') { clearTimeout(giveUp); fail(); }
    else if (m.type === 'arrive' && onArrive) { const f = onArrive; onArrive = null; f(); }
  });
  const hello = () => frame.contentWindow && frame.contentWindow.postMessage({ awwHello: true }, location.origin);
  hello(); frame.addEventListener('load', hello);
  reduced.addEventListener('change', () => send({ type: 'reducedMotion', reducedMotion: reduced.matches }));
  fetch('data.json').then(r => r.json()).then(d => { chapters = d.chapters; }).catch(() => {});

  // The tour: a moment at the gate, then one chapter at a time.
  function start() {
    step = -1; caption(null);
    send({ type: 'markers', states: states(0) });
    send({ type: 'welcome', enabled: true });
    later(3500, () => { send({ type: 'welcome', enabled: false }); next(); });
  }
  function next() {
    step += 1;
    if (step > 9) { send({ type: 'celebrate' }); return later(4500, start); }
    const session = step * 10 + 1;
    send({ type: 'markers', states: states(session) });
    caption(step);
    const dwell = () => later(2600, next);
    if (step === 0 || reduced.matches) { send({ type: 'traveller', session }); send({ type: 'focus', focusSession: session }); later(3200, next); }
    else { onArrive = dwell; send({ type: 'walkTo', session }); later(20000, () => { onArrive = null; next(); }); }
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

  // Only run the world while the hero is on screen.
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting === visible) return;
    visible = entry.isIntersecting; send({ type: 'pause', paused: !visible });
  }).observe(document.querySelector('.hero'));
})();
