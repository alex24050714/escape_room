/* Maze generator: seeded perfect maze + trial layout (gates, key chest, scroll, exit). */
(function (root) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  function generate(seed, W, H) {
    W = W || 21; H = H || 15;
    const rnd = mulberry32(seed);
    const grid = [];
    for (let y = 0; y < H; y++) grid.push(Array(W).fill('#'));

    // Iterative DFS over odd cells.
    const stack = [[1, 1]];
    grid[1][1] = '.';
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const opts = [];
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx * 2, ny = cy + dy * 2;
        if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && grid[ny][nx] === '#') opts.push([dx, dy]);
      }
      if (!opts.length) { stack.pop(); continue; }
      const [dx, dy] = opts[Math.floor(rnd() * opts.length)];
      grid[cy + dy][cx + dx] = '.';
      grid[cy + dy * 2][cx + dx * 2] = '.';
      stack.push([cx + dx * 2, cy + dy * 2]);
    }

    const start = { x: 1, y: 1 };
    const key = (x, y) => y * W + x;
    const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y][x] === '.';

    // BFS from start.
    const dist = new Map([[key(1, 1), 0]]);
    const parent = new Map();
    const q = [[1, 1]];
    let far = [1, 1];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      if (dist.get(key(x, y)) > dist.get(key(far[0], far[1]))) far = [x, y];
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (open(nx, ny) && !dist.has(key(nx, ny))) {
          dist.set(key(nx, ny), dist.get(key(x, y)) + 1);
          parent.set(key(nx, ny), key(x, y));
          q.push([nx, ny]);
        }
      }
    }
    const exit = { x: far[0], y: far[1] };

    // Solution path start -> exit.
    const path = [];
    for (let k = key(exit.x, exit.y); k !== undefined; k = parent.get(k)) path.push({ x: k % W, y: Math.floor(k / W) });
    path.reverse();
    const L = path.length;
    const pathIndex = new Map(path.map((p, i) => [key(p.x, p.y), i]));

    const gi = [Math.floor(L * 0.26), Math.floor(L * 0.5), Math.floor(L * 0.8)];
    const gates = gi.map((i, n) => ({ id: n + 1, x: path[i].x, y: path[i].y, open: false, idx: i }));

    // Leaves (dead ends) off the solution path, with the path index where they branch off.
    const leaves = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (!open(x, y) || pathIndex.has(key(x, y))) continue;
      let n = 0;
      for (const [dx, dy] of DIRS) if (open(x + dx, y + dy)) n++;
      if (n !== 1) continue;
      let k = key(x, y), depth = 0;
      while (!pathIndex.has(k)) { k = parent.get(k); depth++; }
      leaves.push({ x, y, anchor: pathIndex.get(k), depth });
    }
    const pick = (lo, hi, fallback) => {
      const c = leaves.filter((l) => l.anchor > lo && l.anchor < hi).sort((a, b) => b.depth - a.depth);
      return c.length ? c[0] : fallback;
    };
    const chestCell = pick(gates[1].idx, gates[2].idx, path[Math.floor((gates[1].idx + gates[2].idx) / 2)]);
    let scrollCell = pick(2, gates[0].idx, null) || pick(2, gates[1].idx, null) || path[3];

    const code = Array.from({ length: 4 }, () => 1 + Math.floor(rnd() * 9)).join('');
    const runes = Array.from({ length: 5 }, () => Math.floor(rnd() * 4));

    // Decorative torches on walls that border a floor tile directly below.
    const torches = [];
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) {
      if (grid[y][x] === '#' && grid[y + 1][x] === '.' && rnd() < 0.18) torches.push({ x, y });
    }

    return {
      W, H, grid, start, exit, path, gates, code, runes, torches,
      chest: { x: chestCell.x, y: chestCell.y, open: false },
      scroll: { x: scrollCell.x, y: scrollCell.y, taken: false },
    };
  }

  const api = { generate, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Maze = api;
})(typeof window !== 'undefined' ? window : globalThis);
