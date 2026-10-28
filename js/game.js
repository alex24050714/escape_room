/* La Llave del Caballero - retro escape room. */
(function () {
  'use strict';

  const T = 32;                 // tile size in canvas pixels
  const W = 21, H = 15;         // maze size in tiles
  const MOVE_MS = 130;          // time to walk one tile
  const SEED = parseInt(new URLSearchParams(location.search).get('seed'), 10) || 42;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const $ = (id) => document.getElementById(id);
  const el = {
    title: $('title'), modal: $('modal'), modalBox: $('modal-box'), win: $('win'), winStats: $('win-stats'),
    dialogText: $('dialog-text'), steps: $('steps'), time: $('time'),
    slotKey: $('slot-key'), slotScroll: $('slot-scroll'), mute: $('btn-mute'),
    trials: [$('t1'), $('t2'), $('t3')],
  };
  const Audio = window.GameAudio;

  // ---------------------------------------------------------------- assets
  const ASSETS = ['knight_a', 'knight_b', 'wall', 'floor', 'torch_a', 'torch_b', 'gate', 'exit_closed', 'exit_open',
    'chest_closed', 'chest_open', 'scroll', 'key'];
  const IMG = {};
  function loadAssets() {
    return Promise.all(ASSETS.map((n) => new Promise((res) => {
      const i = new Image();
      i.onload = () => res();
      i.onerror = () => res();
      i.src = 'assets/' + n + '.svg';
      IMG[n] = i;
    })));
  }

  // ---------------------------------------------------------------- state
  let S = null;
  const held = [];              // stack of held directions (last = most recent)
  let lastBump = 0;
  let timerId = null;

  const DIRV = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

  function newGame() {
    const m = Maze.generate(SEED, W, H);
    const seen = m.grid.map((r) => r.map(() => false));
    S = {
      m, mode: 'title',
      x: m.start.x, y: m.start.y, rx: m.start.x, ry: m.start.y,
      fx: 0, fy: 0, moveT: 0, moving: false, step: 0, face: 1, walkFrame: 0,
      steps: 0, t0: 0, elapsed: 0,
      hasKey: false, hasScroll: false, solved: [false, false, false],
      exitOpening: false, seen,
    };
    reveal();
    updateHud();
  }

  function reveal() {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = S.x + dx, y = S.y + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (Math.hypot(dx, dy) <= 3.3) S.seen[y][x] = true;
    }
  }

  // ---------------------------------------------------------------- HUD / text
  let typeTimer = null;
  function say(text) {
    clearInterval(typeTimer);
    el.dialogText.textContent = '';
    let i = 0;
    typeTimer = setInterval(() => {
      i++;
      el.dialogText.textContent = text.slice(0, i);
      if (i % 3 === 0 && text[i - 1] !== ' ') Audio.sfx('blip');
      if (i >= text.length) clearInterval(typeTimer);
    }, 24);
  }

  function updateHud() {
    el.steps.textContent = S.steps;
    const s = Math.floor(S.elapsed / 1000);
    el.time.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    el.slotKey.classList.toggle('has', S.hasKey);
    el.slotScroll.classList.toggle('has', S.hasScroll);
    el.trials.forEach((li, i) => li.classList.toggle('done', S.solved[i]));
  }

  function startClock() {
    if (S.t0) return;
    S.t0 = performance.now();
    clearInterval(timerId);
    timerId = setInterval(() => {
      if (S.mode === 'play' || S.mode === 'modal') { S.elapsed = performance.now() - S.t0; updateHud(); }
    }, 500);
  }

  // ---------------------------------------------------------------- movement
  function gateAt(x, y) { return S.m.gates.find((g) => g.x === x && g.y === y && !g.open); }

  function tryMove(dir) {
    if (S.mode !== 'play' || S.moving) return;
    const [dx, dy] = DIRV[dir];
    if (dx) S.face = dx;
    const nx = S.x + dx, ny = S.y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || S.m.grid[ny][nx] === '#') return bump();

    const g = gateAt(nx, ny);
    if (g) { bump(true); return openTrial(g.id); }

    if (nx === S.m.exit.x && ny === S.m.exit.y) {
      if (!S.hasKey) { bump(true); return say('La puerta final está cerrada con llave roja. Necesito encontrar la llave...'); }
      return useExit();
    }

    startClock();
    S.moving = true; S.moveT = 0; S.fx = S.x; S.fy = S.y; S.x = nx; S.y = ny;
    S.walkFrame ^= 1;
  }

  function bump(quiet) {
    const now = performance.now();
    if (now - lastBump < 220) return;
    lastBump = now;
    Audio.sfx(quiet ? 'click' : 'bump');
  }

  function arrive() {
    S.moving = false; S.rx = S.x; S.ry = S.y; S.steps++;
    Audio.sfx('step');
    reveal();
    const { chest, scroll } = S.m;
    if (!chest.open && S.x === chest.x && S.y === chest.y) {
      chest.open = true; S.hasKey = true;
      Audio.sfx('pickup');
      say('¡Un cofre! Dentro brilla una LLAVE dorada. Ahora busca la puerta final.');
    } else if (!scroll.taken && S.x === scroll.x && S.y === scroll.y) {
      scroll.taken = true; S.hasScroll = true;
      Audio.sfx('pickup');
      showScroll();
    }
    updateHud();
  }

  function useExit() {
    S.mode = 'busy';
    S.m.exitOpen = true;
    Audio.sfx('unlock');
    say('La llave gira... ¡la puerta se abre y entra la luz!');
    setTimeout(() => {
      S.elapsed = performance.now() - S.t0;
      updateHud();
      clearInterval(timerId);
      Audio.sfx('win');
      S.mode = 'win';
      el.winStats.textContent = 'PASOS: ' + S.steps + '  TIEMPO: ' + el.time.textContent;
      el.win.classList.remove('hidden');
      $('btn-again').focus();
    }, 1300);
  }

  // ---------------------------------------------------------------- modal helpers
  let modalTimers = [];
  let modalKeyHandler = null;

  function later(fn, ms) { const id = setTimeout(fn, ms); modalTimers.push(id); return id; }

  function openModal(build) {
    S.mode = 'modal';
    el.modalBox.innerHTML = '';
    modalKeyHandler = null;
    build(el.modalBox);
    el.modal.classList.remove('hidden');
  }

  function closeModal() {
    modalTimers.forEach(clearTimeout); modalTimers = [];
    modalKeyHandler = null;
    el.modal.classList.add('hidden');
    el.modalBox.innerHTML = '';
    if (S.mode === 'modal') S.mode = 'play';
  }

  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const k in (attrs || {})) {
      if (k === 'class') n.className = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    kids.forEach((c) => n.append(c));
    return n;
  }

  function shake(node) {
    node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake');
  }

  function solveGate(id, msg) {
    const g = S.m.gates.find((x) => x.id === id);
    g.open = true; S.solved[id - 1] = true;
    Audio.sfx('unlock');
    closeModal();
    updateHud();
    say(msg);
  }

  // ---------------------------------------------------------------- trials
  function openTrial(id) {
    if (id === 1) trialRiddle();
    else if (id === 2) trialRunes();
    else trialCode();
  }

  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim()
    .replace(/^(un|una|el|la)\s+/, '');

  function trialRiddle() {
    let fails = 0;
    openModal((box) => {
      const msg = h('p', { class: 'msg-bad' }, '');
      const input = h('input', { class: 'riddle-input', type: 'text', maxlength: '20', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Respuesta' });
      const submit = () => {
        if (norm(input.value) === 'mapa') {
          return solveGate(1, 'La puerta de madera cruje y se abre. ¡Primera prueba superada!');
        }
        fails++;
        Audio.sfx('error');
        shake(box);
        msg.textContent = fails >= 2 ? 'Incorrecto. Pista: te ayuda a no perderte en un laberinto...' : 'Incorrecto. Prueba otra vez.';
        input.select();
      };
      box.append(
        h('h2', {}, 'PUERTA 1 - ACERTIJO'),
        h('p', { class: 'riddle' }, '"Tengo ciudades, pero no tengo casas. Tengo montañas, pero no tengo árboles. Tengo ríos, pero no tengo agua. ¿Qué soy?"'),
        input, msg,
        h('div', { class: 'row' },
          h('button', { class: 'btn green', onclick: submit }, 'RESPONDER'),
          h('button', { class: 'btn red', onclick: closeModal }, 'SALIR')),
      );
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      setTimeout(() => input.focus(), 30);
    });
  }

  function trialRunes() {
    const seq = S.m.runes;
    let pos = 0, accepting = false;
    openModal((box) => {
      const info = h('p', {}, '');
      const dots = h('div', { class: 'seq' }, ...seq.map(() => h('i', {})));
      const btns = [0, 1, 2, 3].map((i) => h('button', { class: 'rune-btn', 'aria-label': 'Runa ' + (i + 1), onclick: () => press(i) },
        h('img', { src: 'assets/rune' + (i + 1) + '.svg', alt: '', class: 'pix' })));
      const grid = h('div', { class: 'runes' }, ...btns);
      const again = h('button', { class: 'btn', onclick: () => show() }, 'VER DE NUEVO');

      const light = (i, ms) => {
        btns[i].classList.add('lit'); Audio.sfx('rune', i);
        later(() => btns[i].classList.remove('lit'), ms);
      };
      const paint = () => [...dots.children].forEach((d, k) => d.classList.toggle('on', k < pos));
      const setEnabled = (on) => { accepting = on; btns.forEach((b) => { b.disabled = !on; }); again.disabled = !on; };

      function show() {
        pos = 0; paint(); setEnabled(false);
        info.textContent = 'Memoriza la secuencia...';
        seq.forEach((r, k) => later(() => light(r, 420), 700 + k * 650));
        later(() => { setEnabled(true); info.textContent = 'Ahora repítela con las runas.'; }, 700 + seq.length * 650);
      }

      function press(i) {
        if (!accepting) return;
        light(i, 180);
        if (i === seq[pos]) {
          pos++; paint();
          if (pos === seq.length) {
            setEnabled(false);
            later(() => solveGate(2, 'Las runas brillan y el portón de piedra se desliza. ¡Segunda prueba superada!'), 500);
          }
        } else {
          setEnabled(false); shake(box); Audio.sfx('error');
          info.textContent = 'Las runas se apagan... Secuencia incorrecta.';
          later(show, 1300);
        }
      }

      box.append(
        h('h2', {}, 'PUERTA 2 - RUNAS'), info, grid, dots,
        h('div', { class: 'row' }, again, h('button', { class: 'btn red', onclick: closeModal }, 'SALIR')),
      );
      show();
    });
  }

  function trialCode() {
    const code = S.m.code;
    let entry = '';
    openModal((box) => {
      const cells = [0, 1, 2, 3].map(() => h('span', {}, '_'));
      const display = h('div', { class: 'lock-display' }, ...cells);
      const msg = h('p', {}, S.hasScroll ? 'Usa el código del pergamino.' : 'Un candado de 4 cifras. Quizá hay una pista en el laberinto...');
      const paint = () => cells.forEach((c, i) => { c.textContent = entry[i] || '_'; });

      function push(d) {
        if (entry.length >= 4) return;
        entry += d; Audio.sfx('click'); paint();
        if (entry.length === 4) later(check, 200);
      }
      function check() {
        if (entry === code) return solveGate(3, 'Clic. El candado cae al suelo. ¡Tercera prueba superada! La llave abre la puerta final.');
        Audio.sfx('error'); shake(box);
        msg.className = 'msg-bad'; msg.textContent = 'Código incorrecto.';
        entry = ''; paint();
      }
      function back() { entry = entry.slice(0, -1); paint(); }

      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => h('button', { class: 'btn', onclick: () => push(d) }, d));
      keys.push(h('button', { class: 'btn red', onclick: back, 'aria-label': 'Borrar' }, '<'));
      keys.push(h('button', { class: 'btn', onclick: () => push('0') }, '0'));
      keys.push(h('button', { class: 'btn red', onclick: closeModal }, 'X'));

      box.append(h('h2', {}, 'PUERTA 3 - CANDADO'), display, msg, h('div', { class: 'keypad' }, ...keys));
      modalKeyHandler = (e) => {
        if (/^[0-9]$/.test(e.key)) { push(e.key); return true; }
        if (e.key === 'Backspace') { back(); return true; }
        return false;
      };
    });
  }

  function showScroll() {
    say('Has encontrado un pergamino antiguo...');
    openModal((box) => {
      box.append(
        h('h2', {}, 'PERGAMINO'),
        h('img', { src: 'assets/scroll.svg', alt: '', class: 'pix big-icon' }),
        h('p', {}, 'Los antiguos sellaron la última puerta con este número:'),
        h('div', { class: 'scroll-code' }, S.m.code.split('').join(' ')),
        h('button', { class: 'btn green', onclick: () => { closeModal(); say('Mejor lo memorizo: ' + S.m.code.split('').join('-') + '.'); } }, 'ENTENDIDO'),
      );
      setTimeout(() => box.querySelector('.btn').focus(), 30);
    });
  }

  // ---------------------------------------------------------------- render
  function drawTile(img, x, y) { if (img && img.complete) ctx.drawImage(img, x * T, y * T, T, T); }

  function render(ts) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const m = S.m;

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!S.seen[y][x]) continue;
      if (m.grid[y][x] === '#') drawTile(IMG.wall, x, y);
      else drawTile(IMG.floor, x, y);
    }
    for (const t of m.torches) {
      if (!S.seen[t.y][t.x]) continue;
      drawTile(IMG[((ts / 170 + t.x * 3 + t.y) | 0) % 2 ? 'torch_a' : 'torch_b'], t.x, t.y);
    }

    // objects
    if (S.seen[m.scroll.y][m.scroll.x] && !m.scroll.taken) {
      const bob = Math.sin(ts / 300) * 1.5;
      ctx.drawImage(IMG.scroll, m.scroll.x * T, m.scroll.y * T + bob, T, T);
    }
    if (S.seen[m.chest.y][m.chest.x]) drawTile(m.chest.open ? IMG.chest_open : IMG.chest_closed, m.chest.x, m.chest.y);
    for (const g of m.gates) if (!g.open && S.seen[g.y][g.x]) drawTile(IMG.gate, g.x, g.y);
    if (S.seen[m.exit.y][m.exit.x]) drawTile(m.exitOpen ? IMG.exit_open : IMG.exit_closed, m.exit.x, m.exit.y);

    // player
    let px = S.x, py = S.y, bob = Math.sin(ts / 420) * 0.8;
    if (S.moving) {
      const k = Math.min(1, S.moveT / MOVE_MS);
      px = S.fx + (S.x - S.fx) * k; py = S.fy + (S.y - S.fy) * k;
      bob = -Math.abs(Math.sin(k * Math.PI)) * 3;
    }
    S.rx = px; S.ry = py;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(px * T + T / 2, py * T + T - 3, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    const spr = S.moving && S.walkFrame ? IMG.knight_b : (S.moving ? IMG.knight_a : IMG.knight_a);
    ctx.save();
    ctx.translate(px * T + T / 2, py * T + bob);
    if (S.face < 0) ctx.scale(-1, 1);
    ctx.drawImage(spr, -T / 2, 0, T, T);
    ctx.restore();

    // darkness / torchlight
    const flick = Math.sin(ts / 130) * 0.03 + Math.sin(ts / 57) * 0.02;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!S.seen[y][x]) continue;
      const d = Math.hypot(x - px, y - py);
      let a = d < 2.1 ? 0 : d < 3.1 ? 0.28 : d < 4.1 ? 0.5 : 0.74;
      if (a > 0 && a < 0.74) a += flick;
      if (a > 0) { ctx.fillStyle = 'rgba(6,4,18,' + a.toFixed(3) + ')'; ctx.fillRect(x * T, y * T, T, T); }
    }
    const grd = ctx.createRadialGradient(px * T + T / 2, py * T + T / 2, 8, px * T + T / 2, py * T + T / 2, 120);
    grd.addColorStop(0, 'rgba(255,190,110,' + (0.16 + flick) + ')');
    grd.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ---------------------------------------------------------------- loop
  let last = 0;
  function loop(ts) {
    const dt = Math.min(64, ts - last); last = ts;
    if (S.moving) {
      S.moveT += dt;
      if (S.moveT >= MOVE_MS) arrive();
    }
    if (S.mode === 'play' && !S.moving && held.length) tryMove(held[held.length - 1]);
    render(ts);
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- input
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  };

  function press(dir) { const i = held.indexOf(dir); if (i >= 0) held.splice(i, 1); held.push(dir); }
  function release(dir) { const i = held.indexOf(dir); if (i >= 0) held.splice(i, 1); }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'm' || e.key === 'M') { if (S.mode !== 'modal' || !(e.target && e.target.tagName === 'INPUT')) { toggleMute(); return; } }

    if (S.mode === 'title') {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); }
      return;
    }
    if (S.mode === 'modal') {
      if (e.key === 'Escape') { closeModal(); return; }
      if (modalKeyHandler && modalKeyHandler(e)) e.preventDefault();
      return;
    }
    const dir = KEYMAP[e.key];
    if (dir && S.mode === 'play') { e.preventDefault(); press(dir); }
  });
  document.addEventListener('keyup', (e) => { const dir = KEYMAP[e.key]; if (dir) release(dir); });
  window.addEventListener('blur', () => { held.length = 0; });

  document.querySelectorAll('.dpad button').forEach((b) => {
    const dir = b.dataset.dir;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); press(dir); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => release(dir)));
  });

  function toggleMute() {
    const muted = Audio.toggleMute();
    el.mute.textContent = 'MUSICA: ' + (muted ? 'OFF' : 'ON');
    el.mute.setAttribute('aria-pressed', String(muted));
  }
  el.mute.addEventListener('click', toggleMute);

  function start() {
    Audio.init();
    Audio.startMusic();
    el.title.classList.add('hidden');
    S.mode = 'play';
    say('Despierto en una mazmorra oscura... Debo encontrar una llave y salir de aquí. ¡Hay puertas con pruebas!');
  }

  $('btn-start').addEventListener('click', start);
  $('btn-again').addEventListener('click', () => {
    el.win.classList.add('hidden');
    held.length = 0;
    newGame();
    S.mode = 'play';
    say('Otra vez en la mazmorra... esta vez saldré más rápido.');
  });

  // ---------------------------------------------------------------- boot
  el.mute.textContent = 'MUSICA: ' + (Audio.muted ? 'OFF' : 'ON');
  el.mute.setAttribute('aria-pressed', String(Audio.muted));
  newGame();
  say('Pulsa para empezar la aventura.');
  loadAssets().then(() => requestAnimationFrame(loop));

  // Handy for debugging from the console: window.__escape.state()
  window.__escape = { state: () => S };
})();
