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
  // Saved games store where the sequence had got to.
  rng.state = () => s;
  rng.setState = v => { s = v >>> 0; };
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
  // Noise sizes grow with the map (2.3x per side since the 96x72 version), so
  // rock ridges and lakes are larger features rather than more, smaller ones.
  const n1 = makeNoise(rng, 21), n2 = makeNoise(rng, 10), n3 = makeNoise(rng, 13);
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

  // Bases stay tucked into opposite corners, 10 squares from the edges.
  const bases = { 1: { x: 10, y: H - 11 }, 2: { x: W - 11, y: 10 } };
  // Everything below is listed for the bottom-left player's half only and
  // mirrored through the centre for the other player.
  // Open clearings: good spots for outposts and battles.
  const halfClearings = [{ x: 51, y: 47 }, { x: 80, y: 116 }];
  // The centre clearing is carved twice, once as its own mirror image, so
  // the middle of the map stays perfectly symmetric.
  const mid = { x: Math.floor(W / 2), y: Math.floor(H / 2) };
  const clearings = [...halfClearings, mid, { x: W - 1 - mid.x, y: H - 1 - mid.y }];
  for (const f of halfClearings) { const [x, y] = mirror(f.x, f.y); clearings.push({ x, y }); }

  // Loose scrap fields: 18 per side, from home out to the contested middle.
  const halfFields = [
    { x: 21, y: 156 }, { x: 8, y: 144 }, { x: 40, y: 158 },                  // home fields (two close, as on the old map)
    { x: 59, y: 132 }, { x: 32, y: 105 }, { x: 91, y: 157 }, { x: 76, y: 158 }, { x: 12, y: 120 },  // near expansions
    { x: 10, y: 69 }, { x: 64, y: 93 }, { x: 47, y: 73 }, { x: 30, y: 70 }, { x: 80, y: 90 },      // middle distance
    { x: 118, y: 127 }, { x: 124, y: 140 }, { x: 69, y: 39 }, { x: 86, y: 69 }, { x: 100, y: 60 }, // contested
  ];
  const fieldTiles = [];
  for (const f of halfFields) {
    fieldTiles.push(f);
    const [x, y] = mirror(f.x, f.y);
    fieldTiles.push({ x, y });
  }

  // Scrap geysers: fixed spots where a Scavenger can deploy as an Extractor.
  // Given as tile corners; the Extractor sits on the 2x2 tiles around each.
  // 10 per side, at least 20 squares from any other geyser (including the
  // other side's): one under the start, two near home, two in the middle
  // distance, three forward on the flanks and two contested near the centre.
  const halfGeysers = [
    { x: bases[1].x, y: bases[1].y + 1 },  // under the starting Recycler
    { x: 33, y: 146 }, { x: 60, y: 143 },  // home (the first about 25 squares out, as on the old map)
    { x: 51, y: 113 }, { x: 14, y: 90 },   // middle distance
    { x: 103, y: 142 }, { x: 116, y: 158 }, { x: 29, y: 56 },  // forward, on the flanks
    { x: 96, y: 91 }, { x: 66, y: 40 },    // contested, toward the centre
  ];
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
  connectAll(tiles, W, H, bases[1], [bases[2], ...clearings, ...fieldTiles, ...geyserTiles],
    (x, y) => { for (const [px, py] of [[x, y], mirror(x, y)]) clear(px, py, 1, TILE_DIRT); });

  const T = CONFIG.TILE;
  const scrap = scatterScrap(rng, halfFields, W, H);

  const geysers = geyserTiles.map((g, i) => ({ id: i + 1, x: g.x * T, y: g.y * T, tx: g.x, ty: g.y, extractorId: 0 }));

  return { W, H, tiles, bases, scrap, geysers, seed, fields: fieldTiles };
}

// Digs roads until everything important can be driven to from `start`.
// dig(x, y) opens the ground around one square (and its mirror image).
function connectAll(tiles, W, H, start, important, dig) {
  const idx = (x, y) => y * W + x;
  const passable = i => tiles[i] !== TILE_ROCK && tiles[i] !== TILE_WATER;
  for (let pass = 0; pass < 80; pass++) {
    const reach = new Uint8Array(W * H);
    const stack = [idx(start.x, start.y)];
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
    if (!lost) return;
    // Dig a road from the unreachable spot toward the nearest reachable tile.
    let best = null, bestD = Infinity;
    for (let i = 0; i < W * H; i++) {
      if (!reach[i]) continue;
      const d = (i % W - lost.x) ** 2 + (((i / W) | 0) - lost.y) ** 2;
      if (d < bestD) { bestD = d; best = { x: i % W, y: (i / W) | 0 }; }
    }
    const steps = Math.ceil(Math.sqrt(bestD)) * 2 + 1;
    for (let s = 0; s <= steps; s++) dig(Math.round(lost.x + (best.x - lost.x) * s / steps), Math.round(lost.y + (best.y - lost.y) * s / steps));
  }
}

// Loose scrap: a handful of piles around each field centre, mirrored.
function scatterScrap(rng, halfFields, W, H) {
  const T = CONFIG.TILE, scrap = [];
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
  return scrap;
}

// The same starting spots, geysers and scrap fields as the wasteland map
// (bottom-left player's half; mirrored for the other side).
const HALF_FIELDS = [
  { x: 21, y: 156 }, { x: 8, y: 144 }, { x: 40, y: 158 },
  { x: 59, y: 132 }, { x: 32, y: 105 }, { x: 91, y: 157 }, { x: 76, y: 158 }, { x: 12, y: 120 },
  { x: 10, y: 69 }, { x: 64, y: 93 }, { x: 47, y: 73 }, { x: 30, y: 70 }, { x: 80, y: 90 },
  { x: 118, y: 127 }, { x: 124, y: 140 }, { x: 69, y: 39 }, { x: 86, y: 69 }, { x: 100, y: 60 },
];
const HALF_GEYSERS = base => [
  { x: base.x, y: base.y + 1 },
  { x: 33, y: 146 }, { x: 60, y: 143 },
  { x: 51, y: 113 }, { x: 14, y: 90 },
  { x: 103, y: 142 }, { x: 116, y: 158 }, { x: 29, y: 56 },
  { x: 96, y: 91 }, { x: 66, y: 40 },
];

// -----------------------------------------------------------------------------
// The urban map: a ruined city. A grid of streets (you can drive but not build
// on them) between city blocks: solid towers, blocks split by narrow alleys,
// walled courtyards, open lots and parks with trees. Some streets are choked
// with rubble, and a canal crosses the city between the two bases with only
// five bridges. You can only build on open ground: plazas, lots, courtyards
// and parks. Mirrored through the centre like the wasteland map.
//
// Each square also has a style for drawing: 0 plain, 1 park, 2 bridge,
// 3 rubble, 4 tree. map.noBuild marks the streets.
// -----------------------------------------------------------------------------
const URBAN = { P: 18, VX: 1, VW: 5, HY: 1, HW: 4 };   // street grid: period, offsets, widths
function generateUrbanMap(seed) {
  const W = CONFIG.MAP_W, H = CONFIG.MAP_H, { P, VX, VW, HY, HW } = URBAN;
  const rng = makeRng(seed);
  const tiles = new Uint8Array(W * H).fill(TILE_DIRT), style = new Uint8Array(W * H);
  const idx = (x, y) => y * W + x;
  const mirror = (x, y) => [W - 1 - x, H - 1 - y];
  const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  // Paints a square and its mirror image.
  const put = (x, y, t, st = 0) => { for (const [px, py] of [[x, y], mirror(x, y)]) if (inMap(px, py)) { tiles[idx(px, py)] = t; style[idx(px, py)] = st; } };
  const disc = (cx, cy, r, t, st = 0) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + r) put(x, y, t, st); };
  const bases = { 1: { x: 10, y: H - 11 }, 2: { x: W - 11, y: 10 } };

  // City blocks. Block (kx, ky) covers x 6+18kx..18+18kx and y 5+18ky..18+18ky;
  // its mirror image is block (11-kx, 8-ky).
  const BX = Math.floor((W - VX - VW) / P), BY = Math.floor((H - HY - HW) / P);
  const blockAt = (kx, ky) => ({ x0: VX + VW + kx * P, y0: HY + HW + ky * P, w: P - VW, h: P - HW });
  const forced = new Map();   // block -> type
  const blockOf = (x, y) => [Math.floor((x - VX - VW) / P), Math.floor((y - HY - HW) / P)];
  const mid = { x: Math.floor(W / 2), y: Math.floor(H / 2) };
  { const [kx, ky] = blockOf(mid.x - 4, mid.y); forced.set(kx + ',' + ky, 'plaza'); }
  for (const g of HALF_GEYSERS(bases[1])) { const [kx, ky] = blockOf(g.x, g.y); if (!forced.has(kx + ',' + ky)) forced.set(kx + ',' + ky, 'lot'); }
  for (let ky = 0; ky < BY; ky++) for (let kx = 0; kx < BX; kx++) {
    const mkx = BX - 1 - kx, mky = BY - 1 - ky;
    if (ky * BX + kx > mky * BX + mkx) continue;    // the mirror image is painted with it
    const r = makeRng((seed * 977 + ky * 131 + kx * 7) >>> 0);
    let type = forced.get(kx + ',' + ky) || forced.get(mkx + ',' + mky);
    if (!type) { const v = r(); type = v < 0.45 ? 'tower' : v < 0.67 ? 'alley' : v < 0.82 ? 'court' : v < 0.93 ? 'lot' : 'park'; }
    const { x0, y0, w, h } = blockAt(kx, ky);
    const fill = (t, st = 0) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, t, st); };
    if (type === 'tower') fill(TILE_ROCK);
    else if (type === 'alley') {
      // A solid block cut by a narrow alley (2 squares, no building).
      fill(TILE_ROCK);
      const along = r() < 0.5, at = 4 + Math.floor(r() * ((along ? h : w) - 9));
      for (let k = 0; k < 2; k++) for (let j = 0; j < (along ? w : h); j++) put(along ? x0 + j : x0 + at + k, along ? y0 + at + k : y0 + j, TILE_DIRT);
    } else if (type === 'court') {
      // A walled courtyard with one gateway: open ground inside.
      fill(TILE_ROCK);
      for (let y = y0 + 3; y < y0 + h - 3; y++) for (let x = x0 + 3; x < x0 + w - 3; x++) put(x, y, TILE_GRASS);
      const side = Math.floor(r() * 4), cxm = x0 + (w >> 1), cym = y0 + (h >> 1);
      for (let k = -1; k <= 1; k++) for (let d = 0; d < 3; d++) {
        if (side === 0) put(cxm + k, y0 + d, TILE_GRASS); else if (side === 1) put(cxm + k, y0 + h - 1 - d, TILE_GRASS);
        else if (side === 2) put(x0 + d, cym + k, TILE_GRASS); else put(x0 + w - 1 - d, cym + k, TILE_GRASS);
      }
    } else if (type === 'lot' || type === 'plaza') {
      // A cleared lot (rubble heaps round the edge) or the central plaza.
      fill(TILE_GRASS);
      if (type === 'lot') for (let k = 0; k < 5; k++) {
        const ex = r() < 0.5, x = ex ? x0 + Math.floor(r() * w) : (r() < 0.5 ? x0 : x0 + w - 2), y = ex ? (r() < 0.5 ? y0 : y0 + h - 2) : y0 + Math.floor(r() * h);
        put(x, y, TILE_ROCK, 3); if (r() < 0.5) put(x + 1, y, TILE_ROCK, 3);
      }
    } else {
      // A park: open ground with trees, which block vehicles.
      fill(TILE_GRASS, 1);
      for (let k = 0; k < 7; k++) put(x0 + 1 + Math.floor(r() * (w - 2)), y0 + 1 + Math.floor(r() * (h - 2)), TILE_ROCK, 4);
    }
  }
  // The central plaza runs across the avenue between its two halves.
  for (let y = mid.y - 6; y <= mid.y + 6; y++) for (let x = mid.x - 3; x <= mid.x + 3; x++) put(x, y, TILE_GRASS);

  // Rubble barricades: some street stretches are blocked, making dead ends.
  for (let a = 0; a <= BX; a++) for (let ky = 0; ky < BY; ky++) {
    if (rng() > 0.07) continue;
    const x0 = VX + a * P, y0 = HY + HW + ky * P + 5;
    for (let y = y0; y < y0 + 3; y++) for (let x = x0; x < x0 + VW; x++) put(x, y, TILE_ROCK, 3);
  }
  for (let b = 0; b <= BY; b++) for (let kx = 0; kx < BX; kx++) {
    if (rng() > 0.07) continue;
    const y0 = HY + b * P, x0 = VX + VW + kx * P + 5;
    for (let y = y0; y < y0 + HW; y++) for (let x = x0; x < x0 + 3; x++) put(x, y, TILE_ROCK, 3);
  }

  // The canal: from the top-left to the bottom-right, between the bases.
  // Only five streets cross it on bridges.
  const cx0 = (W - 1) / 2, cy0 = (H - 1) / 2;
  const bridgeV = new Set([2, 6, 10]), bridgeH = new Set([1, BY - 1]);
  const isBridge = (x, y) => (((x - VX) % P + P) % P < VW && bridgeV.has(Math.floor((x - VX) / P))) ||
                             (((y - HY) % P + P) % P < HW && bridgeH.has(Math.floor((y - HY) / P)));
  for (let x = 0; x < W; x++) {
    const yc = cy0 + (x - cx0) * 0.66 + 7 * Math.sin((x - cx0) * 0.045);
    for (let y = Math.floor(yc - 4); y <= Math.ceil(yc + 4); y++) {
      if (!inMap(x, y) || Math.abs(y - yc) > 3.4) continue;
      const i = idx(x, y);
      if (isBridge(x, y)) { tiles[i] = TILE_DIRT; style[i] = 2; } else { tiles[i] = TILE_WATER; style[i] = 0; }
    }
  }

  // Scrap fields lie in cleared squares of street; geysers in open lots; each
  // base in a wide plaza.
  const fieldTiles = [];
  for (const f of HALF_FIELDS) { fieldTiles.push(f); const [x, y] = mirror(f.x, f.y); fieldTiles.push({ x, y }); }
  for (const f of HALF_FIELDS) disc(f.x, f.y, 3, TILE_DIRT);
  const halfGeysers = HALF_GEYSERS(bases[1]), geyserTiles = [];
  for (const g of halfGeysers) { geyserTiles.push(g); geyserTiles.push({ x: W - g.x, y: H - g.y }); }
  for (const g of halfGeysers) { disc(g.x, g.y, 5, TILE_GRASS); disc(g.x - 1, g.y - 1, 5, TILE_GRASS); }
  disc(bases[1].x, bases[1].y, 14, TILE_GRASS);

  // Map edge is a wall.
  for (let x = 0; x < W; x++) { put(x, 0, TILE_ROCK); }
  for (let y = 0; y < H; y++) { put(0, y, TILE_ROCK); }

  connectAll(tiles, W, H, bases[1], [bases[2], mid, ...fieldTiles, ...geyserTiles],
    (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = tiles[idx(x + dx, y + dy)]; if (inMap(x + dx, y + dy) && (t === TILE_ROCK || t === TILE_WATER)) put(x + dx, y + dy, TILE_DIRT, 3); } });

  // Streets, bridges and rubble tracks can be driven on but not built on.
  const noBuild = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) noBuild[i] = tiles[i] === TILE_DIRT ? 1 : 0;

  const T = CONFIG.TILE;
  const scrap = scatterScrap(rng, HALF_FIELDS, W, H);
  const geysers = geyserTiles.map((g, i) => ({ id: i + 1, x: g.x * T, y: g.y * T, tx: g.x, ty: g.y, extractorId: 0 }));
  return { W, H, tiles, bases, scrap, geysers, seed, fields: fieldTiles, urban: true, style, noBuild };
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
// Checks the line and four points 10 px either side of it every 8 px. Written
// out longhand because route smoothing calls it a lot on the big map.
function hasClearLine(game, x0, y0, x1, y1) {
  const T = CONFIG.TILE, W = game.map.W, H = game.map.H, tiles = game.map.tiles, occ = game.occupied;
  const blocked = (x, y) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
    const i = ty * W + tx, t = tiles[i];
    return t === TILE_ROCK || t === TILE_WATER || occ[i] > 0;
  };
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8);
  for (let s = 1; s <= steps; s++) {
    const x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
    if (blocked(x, y) || blocked(x + 10, y) || blocked(x - 10, y) || blocked(x, y + 10) || blocked(x, y - 10)) return false;
  }
  return true;
}

// Is this point in the half of the map that searches treat as the mirror
// image of the other half?
function inMirroredHalf(game, x, y) {
  const WW = game.map.W * CONFIG.TILE, HH = game.map.H * CONFIG.TILE;
  return y * WW + x > (HH - y) * WW + (WW - x);
}

// The map rotated half a turn about its centre. Doing that to a grid stored
// row by row is the same as reading it backwards.
function mirroredView(game) {
  return { map: { W: game.map.W, H: game.map.H, tiles: game.map.tiles.slice().reverse() }, occupied: game.occupied.slice().reverse() };
}

// Routes are always worked out from the same half of the map: a request
// starting in the other half is solved on a mirrored copy and mirrored back.
// Otherwise the search's tie-breaking would give one side slightly different
// (and sometimes better) routes than the other, which adds up in battle.
function findPath(game, sx, sy, gx, gy) {
  const T = CONFIG.TILE, W = game.map.W, H = game.map.H, WW = W * T, HH = H * T;
  if (inMirroredHalf(game, sx, sy)) {
    return findPathOn(mirroredView(game), WW - sx, HH - sy, WW - gx, HH - gy).map(p => ({ x: WW - p.x, y: HH - p.y }));
  }
  return findPathOn(game, sx, sy, gx, gy);
}

function findPathOn(game, sx, sy, gx, gy) {
  const T = CONFIG.TILE, W = game.map.W, H = game.map.H;
  if (hasClearLine(game, sx, sy, gx, gy)) return [{ x: gx, y: gy }];

  let start = { x: Math.floor(sx / T), y: Math.floor(sy / T) };
  if (isBlockedTile(game, start.x, start.y)) start = nearestOpenTile(game, start.x, start.y, 3) || start;
  const goal = nearestOpenTile(game, Math.floor(gx / T), Math.floor(gy / T));
  if (!goal) return [];
  const goalExact = goal.x === Math.floor(gx / T) && goal.y === Math.floor(gy / T);

  const N = W * H;
  // Enough to cross the whole map around obstacles, but still bounded.
  const maxExpand = Math.max(8000, N);
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  // Binary heap of (score, square) kept in two plain number lists.
  const hf = [], hi = [];
  const push = (f, i) => {
    let k = hf.length; hf.push(f); hi.push(i);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= f) break;
      hf[k] = hf[p]; hi[k] = hi[p]; k = p;
    }
    hf[k] = f; hi[k] = i;
  };
  const pop = () => {
    const top = hi[0], lf = hf.pop(), li = hi.pop(), n = hf.length;
    if (n) {
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = -1, mf = lf;
        if (l < n && hf[l] < mf) { m = l; mf = hf[l]; }
        if (r < n && hf[r] < mf) { m = r; }
        if (m < 0) break;
        hf[k] = hf[m]; hi[k] = hi[m]; k = m;
      }
      hf[k] = lf; hi[k] = li;
    }
    return top;
  };
  const h = (x, y) => {
    const dx = Math.abs(x - goal.x), dy = Math.abs(y - goal.y);
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  const tiles = game.map.tiles, occ = game.occupied;
  const open = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = y * W + x, t = tiles[i];
    return t !== TILE_ROCK && t !== TILE_WATER && !(occ[i] > 0);
  };

  const si = start.y * W + start.x, gi = goal.y * W + goal.x;
  g[si] = 0;
  push(h(start.x, start.y), si);
  let found = false, expanded = 0;
  while (hf.length && expanded < maxExpand) {
    const i = pop();
    if (closed[i]) continue;
    closed[i] = 1; expanded++;
    if (i === gi) { found = true; break; }
    const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (!open(nx, ny)) continue;
      // No cutting across the corner of a rock.
      if (dx && dy && (!open(x + dx, y) || !open(x, y + dy))) continue;
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
    // Look at most 40 squares ahead: long straight stretches just become a
    // few shorter legs in a row, and the big map stays quick to plan on.
    for (let j = Math.min(pts.length - 1, k + 40); j > k + 1; j--) {
      if (hasClearLine(game, from.x, from.y, pts[j].x, pts[j].y)) { far = j; break; }
    }
    out.push(pts[far]);
    from = pts[far]; k = far;
  }
  if (!out.length) out.push(pts[pts.length - 1]);
  return out;
}
