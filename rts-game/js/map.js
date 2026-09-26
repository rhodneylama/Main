// =============================================================================
// map.js — BUILDS THE BATTLEFIELD AND FINDS ROUTES ACROSS IT
//
// The map is a grid of squares ("tiles"). Each tile is grass, dirt, rock or
// water. Rock and water block vehicles. The map is mirrored so both sides get
// a fair start: whatever is near your base is also near the enemy's.
// =============================================================================

const TILE_GRASS = 0, TILE_DIRT = 1, TILE_ROCK = 2, TILE_WATER = 3;

// A random number generator that gives the same numbers for the same seed.
// That makes a map repeatable, and later lets two online players stay in sync.
function makeRng(seed) {
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (a, b) => a + rng() * (b - a);
  rng.int = (a, b) => Math.floor(a + rng() * (b - a + 1));
  return rng;
}

// Smooth random hills, used to decide where rock and water go.
function makeNoise(rng, cell) {
  const gw = 64, grid = [];
  for (let i = 0; i < gw * gw; i++) grid.push(rng());
  const at = (x, y) => grid[((y % gw) + gw) % gw * gw + ((x % gw) + gw) % gw];
  const smooth = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  };
}

function generateMap(seed) {
  const W = CONFIG.MAP_W, H = CONFIG.MAP_H;
  const rng = makeRng(seed);
  const n1 = makeNoise(rng, 9), n2 = makeNoise(rng, 4), n3 = makeNoise(rng, 6);
  const tiles = new Uint8Array(W * H);
  const idx = (x, y) => y * W + x;
  const mirror = (x, y) => [W - 1 - x, H - 1 - y];

  // Terrain, mirrored through the centre of the map.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let [cx, cy] = [x, y];
      const [mx, my] = mirror(x, y);
      if (idx(x, y) > idx(mx, my)) [cx, cy] = [mx, my];
      const h = n1(cx, cy) * 0.75 + n2(cx, cy) * 0.25;
      let t = n3(cx, cy) > 0.58 ? TILE_DIRT : TILE_GRASS;
      if (h > 0.74) t = TILE_ROCK;
      else if (h < 0.24) t = TILE_WATER;
      tiles[idx(x, y)] = t;
    }
  }

  const bases = { 1: { x: 10, y: H - 11 }, 2: { x: W - 11, y: 10 } };
  // Open clearings: good spots for outposts and battles.
  const halfClearings = [{ x: 22, y: 20 }, { x: 34, y: 50 }];
  const clearings = [...halfClearings, { x: Math.floor(W / 2), y: Math.floor(H / 2) }];
  for (const f of halfClearings) { const [x, y] = mirror(f.x, f.y); clearings.push({ x, y }); }

  const halfFields = [
    { x: 20, y: H - 8 }, { x: 7, y: H - 24 },   // home fields
    { x: 42, y: 60 }, { x: 16, y: 34 },          // near expansions
    { x: 40, y: 30 },                             // contested middle
  ];
  const fieldTiles = [];
  for (const f of halfFields) {
    fieldTiles.push(f);
    const [x, y] = mirror(f.x, f.y);
    fieldTiles.push({ x, y });
  }

  // Scrap geysers: fixed spots where a Scavenger can deploy as an Extractor.
  // Given as tile corners; the Extractor sits on the 2x2 tiles around each.
  const halfGeysers = [{ x: 16, y: 54 }, { x: 22, y: 20 }, { x: 34, y: 50 }, { x: 44, y: 34 }];
  const geyserTiles = [];
  for (const g of halfGeysers) { geyserTiles.push(g); geyserTiles.push({ x: W - g.x, y: H - g.y }); }

  const clear = (cx, cy, r, type) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + r) {
        const t = tiles[idx(x, y)];
        if (t === TILE_ROCK || t === TILE_WATER) tiles[idx(x, y)] = type;
      }
    }
  };
  for (const t of [1, 2]) clear(bases[t].x, bases[t].y, 10, TILE_DIRT);
  for (const f of clearings) clear(f.x, f.y, 4, TILE_DIRT);
  for (const f of fieldTiles) clear(f.x, f.y, 4, TILE_GRASS);
  for (const g of geyserTiles) { clear(g.x, g.y, 3, TILE_DIRT); clear(g.x - 1, g.y - 1, 3, TILE_DIRT); }

  // Map edge is a rock wall.
  for (let x = 0; x < W; x++) { tiles[idx(x, 0)] = TILE_ROCK; tiles[idx(x, H - 1)] = TILE_ROCK; }
  for (let y = 0; y < H; y++) { tiles[idx(0, y)] = TILE_ROCK; tiles[idx(W - 1, y)] = TILE_ROCK; }

  // Make sure everything important can be driven to from both bases.
  const passable = i => tiles[i] !== TILE_ROCK && tiles[i] !== TILE_WATER;
  const important = [bases[2], ...clearings, ...fieldTiles, ...geyserTiles];
  for (let pass = 0; pass < 20; pass++) {
    const reach = new Uint8Array(W * H);
    const stack = [idx(bases[1].x, bases[1].y)];
    reach[stack[0]] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = idx(nx, ny);
        if (!reach[j] && passable(j)) { reach[j] = 1; stack.push(j); }
      }
    }
    const lost = important.find(p => !reach[idx(p.x, p.y)]);
    if (!lost) break;
    // Dig a road from the unreachable spot toward the nearest reachable tile.
    let best = null, bestD = Infinity;
    for (let i = 0; i < W * H; i++) {
      if (!reach[i]) continue;
      const d = (i % W - lost.x) ** 2 + (((i / W) | 0) - lost.y) ** 2;
      if (d < bestD) { bestD = d; best = { x: i % W, y: (i / W) | 0 }; }
    }
    const steps = Math.ceil(Math.sqrt(bestD)) * 2 + 1;
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(lost.x + (best.x - lost.x) * s / steps);
      const y = Math.round(lost.y + (best.y - lost.y) * s / steps);
      for (const [px, py] of [[x, y], mirror(x, y)]) clear(px, py, 1, TILE_DIRT);
    }
  }

  const T = CONFIG.TILE;
  const scrap = [];
  let sid = 1;
  for (const f of halfFields) {
    const count = rng.int(5, 7);
    for (let k = 0; k < count; k++) {
      const a = rng() * Math.PI * 2, r = rng.range(0.5, 2.8);
      const x = (f.x + 0.5 + Math.cos(a) * r) * T, y = (f.y + 0.5 + Math.sin(a) * r) * T;
      const amt = CONFIG.SCRAP_NODE_AMOUNT;
      scrap.push({ id: sid++, x, y, amount: amt, max: amt });
      scrap.push({ id: sid++, x: W * T - x, y: H * T - y, amount: amt, max: amt });
    }
  }

  const geysers = geyserTiles.map((g, i) => ({ id: i + 1, x: g.x * T, y: g.y * T, tx: g.x, ty: g.y, extractorId: 0 }));

  return { W, H, tiles, bases, scrap, geysers, seed };
}

// -----------------------------------------------------------------------------
// Pathfinding: the A* ("A-star") search finds the shortest route on the grid.
// -----------------------------------------------------------------------------

function isBlockedTile(game, tx, ty) {
  const m = game.map;
  if (tx < 0 || ty < 0 || tx >= m.W || ty >= m.H) return true;
  const i = ty * m.W + tx;
  const t = m.tiles[i];
  return t === TILE_ROCK || t === TILE_WATER || game.occupied[i] > 0;
}

function isBlockedAt(game, x, y) {
  const T = CONFIG.TILE;
  return isBlockedTile(game, Math.floor(x / T), Math.floor(y / T));
}

function nearestOpenTile(game, tx, ty, maxR = 12) {
  if (!isBlockedTile(game, tx, ty)) return { x: tx, y: ty };
  // Ties go to the square nearer the map centre. Both bases face the
  // centre, so this rule treats the two sides as exact mirror images.
  const cx = game.map.W / 2 - 0.5 - tx, cy = game.map.H / 2 - 0.5 - ty;
  for (let r = 1; r <= maxR; r++) {
    let best = null, bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (!isBlockedTile(game, tx + dx, ty + dy)) {
        const d = dx * dx + dy * dy - (dx * cx + dy * cy) * 1e-6;
        if (d < bestD) { bestD = d; best = { x: tx + dx, y: ty + dy }; }
      }
    }
    if (best) return best;
  }
  return null;
}

// Can a vehicle drive in a straight line from (x0,y0) to (x1,y1)?
function hasClearLine(game, x0, y0, x1, y1) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(dist / 8);
  for (let s = 1; s <= steps; s++) {
    const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
    if (isBlockedAt(game, x, y) || isBlockedAt(game, x + 10, y) || isBlockedAt(game, x - 10, y) ||
        isBlockedAt(game, x, y + 10) || isBlockedAt(game, x, y - 10)) return false;
  }
  return true;
}

function findPath(game, sx, sy, gx, gy) {
  const T = CONFIG.TILE, W = game.map.W, H = game.map.H;
  if (hasClearLine(game, sx, sy, gx, gy)) return [{ x: gx, y: gy }];

  let start = { x: Math.floor(sx / T), y: Math.floor(sy / T) };
  if (isBlockedTile(game, start.x, start.y)) start = nearestOpenTile(game, start.x, start.y, 3) || start;
  const goal = nearestOpenTile(game, Math.floor(gx / T), Math.floor(gy / T));
  if (!goal) return [];
  const goalExact = goal.x === Math.floor(gx / T) && goal.y === Math.floor(gy / T);

  const N = W * H;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = [];  // binary heap of [f, index]
  const push = (f, i) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]]; k = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
      }
    }
    return top;
  };
  const h = (x, y) => {
    const dx = Math.abs(x - goal.x), dy = Math.abs(y - goal.y);
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };

  const si = start.y * W + start.x, gi = goal.y * W + goal.x;
  g[si] = 0;
  push(h(start.x, start.y), si);
  let found = false, expanded = 0;
  while (heap.length && expanded < 8000) {
    const [, i] = pop();
    if (closed[i]) continue;
    closed[i] = 1; expanded++;
    if (i === gi) { found = true; break; }
    const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (isBlockedTile(game, nx, ny)) continue;
      // No cutting across the corner of a rock.
      if (dx && dy && (isBlockedTile(game, x + dx, y) || isBlockedTile(game, x, y + dy))) continue;
      const j = ny * W + nx;
      if (closed[j]) continue;
      const ng = g[i] + (dx && dy ? Math.SQRT2 : 1);
      if (ng < g[j]) { g[j] = ng; came[j] = i; push(ng + h(nx, ny), j); }
    }
  }
  if (!found) return [];

  const cells = [];
  for (let i = gi; i !== -1; i = came[i]) cells.push(i);
  cells.reverse();
  const pts = cells.map(i => ({ x: (i % W + 0.5) * T, y: (((i / W) | 0) + 0.5) * T }));
  if (goalExact) pts[pts.length - 1] = { x: gx, y: gy };

  // Smooth the zig-zag grid route into long straight legs.
  const out = [];
  let from = { x: sx, y: sy }, k = 0;
  while (k < pts.length - 1) {
    let far = k + 1;
    for (let j = pts.length - 1; j > k + 1; j--) {
      if (hasClearLine(game, from.x, from.y, pts[j].x, pts[j].y)) { far = j; break; }
    }
    out.push(pts[far]);
    from = pts[far]; k = far;
  }
  if (!out.length) out.push(pts[pts.length - 1]);
  return out;
}
