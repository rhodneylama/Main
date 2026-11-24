// =============================================================================
// render.js — DRAWS EVERYTHING YOU SEE
//
// Nothing in here changes the game; it only paints the current state onto
// the screen. Vehicles and buildings come from sprites.js (vector drawings,
// no image files). Colours come from TEAMS in config.js.
// =============================================================================

const Render = {
  chunks: null,    // painted squares of ground, made as the camera reaches them
  scorches: [],    // explosion marks, repainted whenever a chunk is (re)made
  fog: null,       // a tiny image of the fog, stretched over the map
  fogData: null,
  frame: 0,
};

// The ground is painted in chunks of 16 x 16 squares (512 px) as they come into
// view, and chunks far off screen are thrown away. One picture of the whole map
// would be about 25 million pixels: more than a phone allows in a single image.
const CHUNK = 16, MAX_CHUNKS = 48;
const TERRAIN_COLORS = {
  [TILE_GRASS]: [[58, 74, 44], [62, 79, 46], [55, 70, 42]],
  [TILE_DIRT]:  [[92, 80, 58], [86, 75, 54], [97, 85, 62]],
  [TILE_ROCK]:  [[74, 72, 70], [68, 66, 64], [80, 78, 75]],
  [TILE_WATER]: [[34, 58, 78], [32, 55, 74], [36, 61, 82]],
};
// The ruined city: concrete lots, asphalt streets, rooftops, a dark canal;
// plus parks (and their trees), bridge decks and rubble, by square style.
const URBAN_COLORS = {
  [TILE_GRASS]: [[128, 124, 113], [122, 118, 108], [133, 129, 118]],
  [TILE_DIRT]:  [[56, 57, 60], [52, 53, 56], [60, 61, 64]],
  [TILE_ROCK]:  [[80, 74, 71], [76, 70, 67], [84, 78, 74]],
  [TILE_WATER]: [[27, 50, 62], [25, 47, 58], [30, 54, 66]],
};
const URBAN_STYLE_COLORS = {
  1: [[66, 88, 52], [62, 83, 49], [70, 93, 55]],      // park
  2: [[88, 86, 82], [84, 82, 78], [92, 90, 86]],      // bridge deck
  3: [[63, 64, 67], [59, 60, 63], [67, 68, 71]],      // rubble (lies on the street)
  4: [[66, 88, 52], [62, 83, 49], [70, 93, 55]],      // tree (on park ground)
};
// Tidal Flats: sand that floods to shallow water at high tide, and stone causeways.
const TIDAL_COLORS = {
  sand: [[166, 148, 106], [160, 142, 101], [172, 154, 111]],
  shallow: [[50, 96, 110], [47, 92, 106], [53, 100, 114]],
  causeway: [[118, 112, 102], [112, 106, 97], [124, 118, 108]],
};
const tileColors = (map, i) => {
  if (map.tidalMap) {
    if (map.tidal[i]) return map.tide === 'high' ? TIDAL_COLORS.shallow : TIDAL_COLORS.sand;
    if (map.style[i] === 5) return TIDAL_COLORS.causeway;
    return TERRAIN_COLORS[map.tiles[i]];
  }
  return (map.urban && map.style[i] && URBAN_STYLE_COLORS[map.style[i]]) || (map.urban ? URBAN_COLORS : TERRAIN_COLORS)[map.tiles[i]];
};

function buildTerrain(game) {
  const { W, H } = game.map;
  Render.game = game;
  Render.chunks = new Map();
  Render.scorches = [];
  buildFlat(game);
  const f = document.createElement('canvas');
  f.width = W; f.height = H;
  Render.fog = f;
  Render.fogData = f.getContext('2d').createImageData(W, H);
}

// One pixel per square: shown blurred while detailed chunks are still being
// painted, and the minimap's background. Rebuilt when the tide turns.
function buildFlat(game) {
  const { W, H } = game.map;
  const flat = document.createElement('canvas'); flat.width = W; flat.height = H;
  const fg = flat.getContext('2d'), img = fg.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const c = tileColors(game.map, i)[1];
    img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
  }
  fg.putImageData(img, 0, 0);
  Render.flat = flat;
  Render.tideVersion = game.map.tideVersion || 0;
  minimapBase = null;
}

// Each square has its own random numbers, so a chunk always paints the same
// way and the speckles that spill over a chunk's edge line up with its neighbour.
const tileRng = (seed, i) => makeRng((Math.imul(seed + 99, 2654435761) ^ Math.imul(i + 1, 40503)) >>> 0);

function paintChunk(game, cx, cy) {
  const { W, H, tiles } = game.map, T = CONFIG.TILE;
  const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = Math.min(W, x0 + CHUNK), y1 = Math.min(H, y0 + CHUNK);
  const c = document.createElement('canvas');
  c.width = (x1 - x0) * T; c.height = (y1 - y0) * T;
  const g = c.getContext('2d');
  g.translate(-x0 * T, -y0 * T);
  const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;
  const rngs = new Map();
  // Every square's random numbers are drawn in the same order every time.
  const rngOf = (x, y) => {
    const i = y * W + x; let r = rngs.get(i);
    if (!r) { r = tileRng(game.seed, i); r.color = Math.floor(r() * 3); rngs.set(i, r); }
    return r;
  };
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    g.fillStyle = rgb(tileColors(game.map, y * W + x)[rngOf(x, y).color]);
    g.fillRect(x * T, y * T, T, T);
  }
  // Neighbouring squares (one ring outside the chunk) are included below, because
  // their speckles and rock shadows reach a little way into this chunk.
  const ring = [];
  for (let y = Math.max(0, y0 - 1); y < Math.min(H, y1 + 1); y++) for (let x = Math.max(0, x0 - 1); x < Math.min(W, x1 + 1); x++) ring.push([x, y]);
  if (game.map.urban) { paintCity(game, g, ring, rngOf); return finishChunk(game, g, c, x0, y0, x1, y1); }
  // Soft speckles so the ground doesn't look like a chessboard.
  for (const [x, y] of ring) {
    const r = rngOf(x, y);
    for (let k = 0; k < 3; k++) {
      const px = (x + r()) * T, py = (y + r()) * T, pal = TERRAIN_COLORS[tiles[y * W + x]][Math.floor(r() * 3)];
      const m = r() < 0.5 ? 0.85 : 1.15, rad = 2 + r() * 7;
      g.fillStyle = `rgba(${pal[0] * m | 0},${pal[1] * m | 0},${pal[2] * m | 0},0.7)`;
      g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.fill();
    }
  }
  // Raised rock with a lit top edge and a shadow below; ripples on water.
  for (const [x, y] of ring) {
    const t = tiles[y * W + x], r = rngOf(x, y);
    if (t === TILE_ROCK) {
      const below = y + 1 < H ? tiles[(y + 1) * W + x] : TILE_ROCK;
      const above = y > 0 ? tiles[(y - 1) * W + x] : TILE_ROCK;
      if (below !== TILE_ROCK) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x * T, (y + 1) * T, T, 8); }
      if (above !== TILE_ROCK) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x * T, y * T, T, 4); }
      for (let k = 0; k < 3; k++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '40,40,40' : '120,118,112'},0.35)`;
        g.beginPath(); g.arc(x * T + r() * T, y * T + r() * T, 3 + r() * 6, 0, Math.PI * 2); g.fill();
      }
    } else if (t === TILE_WATER) {
      const above = y > 0 ? tiles[(y - 1) * W + x] : TILE_WATER;
      if (above !== TILE_WATER) { g.fillStyle = 'rgba(160,190,200,0.25)'; g.fillRect(x * T, y * T, T, 3); }
      g.strokeStyle = 'rgba(150,190,220,0.15)'; g.lineWidth = 1.5;
      g.beginPath(); const wy = y * T + 8 + r() * 16, wx = x * T + r() * 10;
      g.moveTo(wx, wy); g.quadraticCurveTo(wx + 6, wy - 3, wx + 12, wy); g.stroke();
    }
  }
  if (game.map.tidalMap) paintTidal(game, g, ring, rngOf);
  return finishChunk(game, g, c, x0, y0, x1, y1);
}

function finishChunk(game, g, c, x0, y0, x1, y1) {
  const T = CONFIG.TILE;
  // Tactical grid, like a military map.
  g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
  for (let x = Math.ceil(x0 / 4) * 4; x <= x1; x += 4) { g.beginPath(); g.moveTo(x * T, y0 * T); g.lineTo(x * T, y1 * T); g.stroke(); }
  for (let y = Math.ceil(y0 / 4) * 4; y <= y1; y += 4) { g.beginPath(); g.moveTo(x0 * T, y * T); g.lineTo(x1 * T, y * T); g.stroke(); }
  const chunk = { canvas: c, x: x0 * T, y: y0 * T, w: c.width, h: c.height, used: Render.frame };
  for (const sc of Render.scorches) paintScorch(chunk, sc);
  return chunk;
}

// The city's details: kerbs and lane markings on streets, parapets, roof
// fittings and tall shadows on buildings, broken concrete for rubble, tree
// canopies in parks, stone banks on the canal and railings on bridges.
function paintCity(game, g, ring, rngOf) {
  const { W, H, tiles, style } = game.map, T = CONFIG.TILE, { P, VX, VW, HY, HW, BX, BY } = game.map.grid;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? TILE_ROCK : tiles[y * W + x];
  const st = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : style[y * W + x];
  const solid = (x, y) => at(x, y) === TILE_ROCK && st(x, y) === 0;   // a building, not rubble or a tree
  // Ground first: cracks and stains.
  for (const [x, y] of ring) {
    const r = rngOf(x, y), t = at(x, y);
    if (t === TILE_ROCK && st(x, y) === 0) continue;
    for (let k = 0; k < 2; k++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.05)';
      g.beginPath(); g.arc((x + r()) * T, (y + r()) * T, 1.5 + r() * 4, 0, Math.PI * 2); g.fill();
    }
    if (t === TILE_GRASS && st(x, y) === 0 && r() < 0.25) {   // a crack in the concrete
      g.strokeStyle = 'rgba(40,38,34,0.35)'; g.lineWidth = 1; g.beginPath();
      const sx = (x + r()) * T, sy = (y + r()) * T; g.moveTo(sx, sy); g.lineTo(sx + (r() - 0.5) * 20, sy + (r() - 0.5) * 20); g.stroke();
    }
  }
  for (const [x, y] of ring) {
    const t = at(x, y), s = st(x, y), r = rngOf(x, y), px = x * T, py = y * T;
    if (t === TILE_DIRT && s !== 2) {
      // Kerbs where the street meets anything else.
      g.fillStyle = 'rgba(190,186,176,0.35)';
      if (at(x, y - 1) !== TILE_DIRT) g.fillRect(px, py, T, 2);
      if (at(x, y + 1) !== TILE_DIRT) g.fillRect(px, py + T - 2, T, 2);
      if (at(x - 1, y) !== TILE_DIRT) g.fillRect(px, py, 2, T);
      if (at(x + 1, y) !== TILE_DIRT) g.fillRect(px + T - 2, py, 2, T);
      // Faded centre lines, away from the crossings.
      const mx = ((x - VX) % P + P) % P, my = ((y - HY) % P + P) % P;
      g.fillStyle = 'rgba(214,180,70,0.45)';
      if (mx === 2 && my >= HW) g.fillRect(px + T / 2 - 1, py + 6, 2, 14);
      if (my === 2 && mx >= VW) g.fillRect(px + 6, py, 14, 2);
    } else if (s === 2) {
      // Bridge deck: seams and railings over the water.
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px, py + T / 2); g.lineTo(px + T, py + T / 2); g.stroke();
      g.fillStyle = '#3a3936';
      for (const [dx, dy, rx, ry, rw, rh] of [[0, -1, 0, 0, T, 3], [0, 1, 0, T - 3, T, 3], [-1, 0, 0, 0, 3, T], [1, 0, T - 3, 0, 3, T]])
        if (at(x + dx, y + dy) === TILE_WATER) g.fillRect(px + rx, py + ry, rw, rh);
    } else if (t === TILE_WATER) {
      // Stone banks and slow ripples.
      g.fillStyle = 'rgba(150,145,135,0.55)';
      if (at(x, y - 1) !== TILE_WATER) g.fillRect(px, py, T, 3);
      if (at(x, y + 1) !== TILE_WATER) g.fillRect(px, py + T - 3, T, 3);
      if (at(x - 1, y) !== TILE_WATER) g.fillRect(px, py, 3, T);
      if (at(x + 1, y) !== TILE_WATER) g.fillRect(px + T - 3, py, 3, T);
      g.strokeStyle = 'rgba(140,180,200,0.14)'; g.lineWidth = 1.5;
      g.beginPath(); const wy = py + 8 + r() * 16, wx = px + r() * 10; g.moveTo(wx, wy); g.quadraticCurveTo(wx + 6, wy - 3, wx + 12, wy); g.stroke();
    } else if (s === 3) {
      // Rubble: heaped broken concrete.
      for (let k = 0; k < 4; k++) {
        const cx = px + 4 + r() * (T - 8), cy = py + 4 + r() * (T - 8), sz = 5 + r() * 7, a = r() * 6;
        g.fillStyle = r() < 0.5 ? '#7d776f' : '#5f5a54'; g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1;
        g.beginPath(); for (let j = 0; j < 5; j++) { const aa = a + j * 1.26, rr = sz * (0.6 + r() * 0.4); g[j ? 'lineTo' : 'moveTo'](cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr); }
        g.closePath(); g.fill(); g.stroke();
      }
    } else if (s === 4) {
      // A tree: shadow, canopy and a lighter top.
      const cx = px + T / 2, cy = py + T / 2;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(cx + 4, cy + 6, 15, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2f5a2a'; g.beginPath(); g.arc(cx, cy, 15, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3f7436'; g.beginPath(); g.arc(cx - 3, cy - 3, 9, 0, Math.PI * 2); g.fill();
    }
  }
  // Buildings last, so their shadows fall across the street below them.
  // Each block's roof has its own tint: slate, brick, tar or weathered concrete.
  const ROOFS = ['#4f4a49', '#5e4a42', '#47494d', '#5a5650'];
  for (const [x, y] of ring) {
    if (!solid(x, y)) continue;
    const kx = Math.floor((x - VX - VW) / P), ky = Math.floor((y - HY - HW) / P);
    if (kx < 0 || ky < 0 || kx >= BX || ky >= BY) continue;   // the map's outer wall
    const k = Math.min(kx * BY + ky, (BX - 1 - kx) * BY + (BY - 1 - ky));   // mirrored blocks match
    g.fillStyle = ROOFS[((k * 2654435761) >>> 0) % 4]; g.fillRect(x * T, y * T, T, T);
  }
  for (const [x, y] of ring) {
    if (!solid(x, y)) continue;
    const r = rngOf(x, y), px = x * T, py = y * T;
    if (!solid(x, y + 1)) { g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(px + 4, py + T, T, 14); }
    if (!solid(x + 1, y)) { g.fillStyle = 'rgba(0,0,0,0.30)'; g.fillRect(px + T, py + 6, 8, T); }
  }
  for (const [x, y] of ring) {
    if (!solid(x, y)) continue;
    const r = rngOf(x, y), px = x * T, py = y * T;
    g.fillStyle = 'rgba(205,198,186,0.55)';   // parapet round the roof edge
    if (!solid(x, y - 1)) g.fillRect(px, py, T, 4);
    if (!solid(x - 1, y)) g.fillRect(px, py, 4, T);
    g.fillStyle = 'rgba(40,36,33,0.55)';
    if (!solid(x, y + 1)) g.fillRect(px, py + T - 4, T, 4);
    if (!solid(x + 1, y)) g.fillRect(px + T - 4, py, 4, T);
    // Roof fittings: vents, air units and skylights.
    const v = r();
    if (v < 0.12) { g.fillStyle = '#b8b2a6'; g.fillRect(px + 8, py + 9, 14, 11); g.strokeStyle = 'rgba(0,0,0,0.4)'; g.strokeRect(px + 8, py + 9, 14, 11); g.beginPath(); g.arc(px + 15, py + 14.5, 3.5, 0, Math.PI * 2); g.stroke(); }
    else if (v < 0.2) { g.fillStyle = 'rgba(30,30,30,0.45)'; g.beginPath(); g.arc(px + 16, py + 16, 5, 0, Math.PI * 2); g.fill(); }
    else if (v < 0.26) { g.fillStyle = 'rgba(120,150,170,0.5)'; g.fillRect(px + 6, py + 6, 20, 8); }
    else if (v < 0.4) { g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px, py + 16); g.lineTo(px + T, py + 16); g.stroke(); }
  }
}

// Ripples on the sand (or foam over it at high tide), and edge stones on the causeways.
function paintTidal(game, g, ring, rngOf) {
  const { W, H, tidal, style, tide } = game.map, T = CONFIG.TILE;
  const wetAt = (x, y) => x < 0 || y < 0 || x >= W || y >= H || game.map.tiles[y * W + x] === TILE_WATER;
  for (const [x, y] of ring) {
    const i = y * W + x, r = rngOf(x, y), px = x * T, py = y * T;
    if (tidal[i]) {
      g.strokeStyle = tide === 'high' ? 'rgba(210,235,240,0.18)' : 'rgba(110,92,60,0.30)'; g.lineWidth = 1.2;
      for (let k = 0; k < 2; k++) {
        const wy = py + 6 + r() * 20, wx = px + r() * 8;
        g.beginPath(); g.moveTo(wx, wy); g.quadraticCurveTo(wx + 8, wy - 3, wx + 16, wy); g.stroke();
      }
      if (tide !== 'high' && r() < 0.12) { g.fillStyle = 'rgba(235,225,200,0.6)'; g.beginPath(); g.arc(px + r() * T, py + r() * T, 1.6, 0, Math.PI * 2); g.fill(); }  // shells
    } else if (style[i] === 5) {
      g.fillStyle = 'rgba(60,56,50,0.55)';
      if (wetAt(x, y - 1) || tidal[i - W]) g.fillRect(px, py, T, 4);
      if (wetAt(x, y + 1) || tidal[i + W]) g.fillRect(px, py + T - 4, T, 4);
      if (wetAt(x - 1, y) || tidal[i - 1]) g.fillRect(px, py, 4, T);
      if (wetAt(x + 1, y) || tidal[i + 1]) g.fillRect(px + T - 4, py, 4, T);
      g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 1; g.strokeRect(px + 3, py + 3, T - 6, T - 6);
    }
  }
}

function paintScorch(chunk, sc) {
  if (sc.x + sc.r < chunk.x || sc.x - sc.r > chunk.x + chunk.w || sc.y + sc.r < chunk.y || sc.y - sc.r > chunk.y + chunk.h) return;
  const g = chunk.canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, -chunk.x, -chunk.y);
  const grad = g.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, sc.r);
  grad.addColorStop(0, 'rgba(20,16,12,0.45)'); grad.addColorStop(1, 'rgba(20,16,12,0)');
  g.fillStyle = grad; g.beginPath(); g.arc(sc.x, sc.y, sc.r, 0, Math.PI * 2); g.fill();
}

// Paints the chunks that overlap the given world rectangle.
function drawTerrain(ctx, game, vx0, vy0, vx1, vy1) {
  const T = CONFIG.TILE, S = CHUNK * T, { W, H } = game.map;
  // The tide turned: repaint the ground.
  if (game.map.tidalMap && (game.map.tideVersion || 0) !== Render.tideVersion) { Render.chunks = new Map(); buildFlat(game); }
  Render.frame++;
  const cx0 = Math.max(0, Math.floor(vx0 / S)), cy0 = Math.max(0, Math.floor(vy0 / S));
  const cx1 = Math.min(Math.ceil(W / CHUNK) - 1, Math.floor(vx1 / S)), cy1 = Math.min(Math.ceil(H / CHUNK) - 1, Math.floor(vy1 / S));
  // Painting a chunk takes a few milliseconds, so only a few are painted per
  // frame. Until the rest are ready, a blurred low-detail map shows instead.
  let budget = 2, flatDrawn = false;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const key = cy * 1000 + cx;
    let ch = Render.chunks.get(key);
    if (!ch && budget > 0) { ch = paintChunk(game, cx, cy); Render.chunks.set(key, ch); budget--; }
    if (!ch) {
      if (!flatDrawn) {
        flatDrawn = true;
        const sx = Math.max(0, Math.floor(vx0 / T)), sy = Math.max(0, Math.floor(vy0 / T));
        const sw = Math.min(W, Math.ceil(vx1 / T) + 1) - sx, sh = Math.min(H, Math.ceil(vy1 / T) + 1) - sy;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(Render.flat, sx, sy, sw, sh, sx * T, sy * T, sw * T, sh * T);
      }
      continue;
    }
    ch.used = Render.frame;
    ctx.drawImage(ch.canvas, ch.x, ch.y);
  }
  // Forget the chunks that have been off screen longest.
  if (Render.chunks.size > MAX_CHUNKS) {
    const old = [...Render.chunks].filter(([, c]) => c.used !== Render.frame).sort((a, b) => a[1].used - b[1].used);
    for (const [k] of old.slice(0, Render.chunks.size - MAX_CHUNKS)) Render.chunks.delete(k);
  }
}

// Scorch marks stay on the ground for the rest of the battle.
function scorch(x, y, r) {
  const sc = { x, y, r };
  Render.scorches.push(sc);
  if (Render.scorches.length > 3000) Render.scorches.shift();
  for (const ch of Render.chunks.values()) paintScorch(ch, sc);
}

function drawGame(ctx, game, view) {
  const { cam, team } = view;
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const T = CONFIG.TILE, W = game.map.W;
  const tm = game.teams[team];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d0a'; ctx.fillRect(0, 0, cw, ch);
  ctx.setTransform(cam.zoom, 0, 0, cam.zoom, -cam.x * cam.zoom, -cam.y * cam.zoom);

  const vx0 = cam.x, vy0 = cam.y, vx1 = cam.x + cw / cam.zoom, vy1 = cam.y + ch / cam.zoom;
  const onScreen = (x, y, pad = 80) => x > vx0 - pad && x < vx1 + pad && y > vy0 - pad && y < vy1 + pad;
  const visAt = (x, y) => view.revealAll || tm.vis[Math.floor(y / T) * W + Math.floor(x / T)] === 1;
  const exploredAt = (x, y) => view.revealAll || tm.explored[Math.floor(y / T) * W + Math.floor(x / T)] === 1;

  drawTerrain(ctx, game, vx0, vy0, vx1, vy1);

  // Territory edges (where you're allowed to build) while placing a building.
  if (view.placing) drawTerritory(ctx, game, team, view.placing);

  // Scrap geysers (free ones glow; claimed ones sit under an Extractor)
  for (const g of game.geysers) {
    if (!onScreen(g.x, g.y) || !exploredAt(g.x, g.y) || geyserTaken(game, g)) continue;
    drawGeyser(ctx, g, game.time, view.aim === 'deploy');
  }

  // Scrap piles
  for (const s of game.scrap) {
    if (!onScreen(s.x, s.y) || !exploredAt(s.x, s.y)) continue;
    drawScrap(ctx, s);
  }

  // Uplinks (capture-and-hold battles): always shown, they're the objective.
  if (game.uplinks) for (const u of game.uplinks) if (onScreen(u.x, u.y, 200)) drawUplink(ctx, u, game.time);

  // Wrecks (burnt-out vehicles in their own shape) and craters where buildings stood
  for (const fx of game.effects) if ((fx.kind === 'wreck' || fx.kind === 'crater') && onScreen(fx.x, fx.y)) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (fx.life - fx.t) / 3);
    const art = artFor(fx.faction), id = artId(fx.faction, fx.type);
    if (fx.kind === 'crater') art.drawCrater(ctx, id, fx.x, fx.y);
    else if (fx.t > 0.36) {
      // Appears once the explosion has cleared, then smoulders for a while.
      art.drawSprite(ctx, id, { x: fx.x, y: fx.y, heading: fx.a, team: teamName(fx.team), mk: fx.mk, wreck: true });
      if (fx.t < 8) art.drawDamage(ctx, id, fx.x, fx.y, game.time);
    }
    ctx.restore();
  }

  // Rally points for selected buildings
  for (const e of view.selected) if (e.kind === 'building' && e.rally) {
    ctx.strokeStyle = 'rgba(140,255,160,0.5)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.rally.x, e.rally.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#8cffa0'; ctx.beginPath(); ctx.arc(e.rally.x, e.rally.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ddd'; ctx.fillRect(e.rally.x - 1, e.rally.y - 22, 2, 22);
    ctx.fillStyle = '#8cffa0'; ctx.beginPath(); ctx.moveTo(e.rally.x + 1, e.rally.y - 22); ctx.lineTo(e.rally.x + 14, e.rally.y - 18); ctx.lineTo(e.rally.x + 1, e.rally.y - 13); ctx.fill();
  }

  const selectedIds = new Set(view.selected.map(e => e.id));
  const buildings = game.entities.filter(e => e.kind === 'building');
  const units = game.entities.filter(e => e.kind === 'unit');
  if (game.wallCount) drawWallNetwork(ctx, game, team, onScreen, game.time);   // walls first: bastions and gates sit on their ends
  for (const b of buildings) {
    if (!onScreen(b.x, b.y, 120)) continue;
    const seen = view.revealAll || b.team === team || isVisibleTo(game, team, b);
    if (!seen && !b.seen[team]) continue;
    drawBuilding(ctx, b, selectedIds.has(b.id), !seen, game.time);
  }

  // Move-order lines for selected units
  for (const u of view.selected) if (u.kind === 'unit' && u.path.length && u.team === team) {
    ctx.strokeStyle = 'rgba(140,255,160,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(u.x, u.y);
    for (const p of u.path) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  // Fires on the ground (incendiary shells) and mines (yours, or ones a Sensor Pulse found).
  for (const f of game.fires || []) {
    if (!onScreen(f.x, f.y, f.r) || (!view.revealAll && !visAt(f.x, f.y))) continue;
    const fade = Math.min(1, (f.until - game.time) / 1.5);
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + game.time * 0.7, rr = f.r * (0.25 + 0.6 * ((i * 37) % 10) / 10), fl = 0.6 + 0.4 * Math.sin(game.time * 9 + i * 2);
      ctx.fillStyle = `rgba(255,${110 + i * 15},40,${0.35 * fade * fl})`;
      ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr, 9 + 6 * fl, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (const m of game.mines || []) {
    if (!onScreen(m.x, m.y) || !(m.team === team || view.revealAll || (m.seen && m.seen[team] > game.time))) continue;
    ctx.fillStyle = '#2b2d2a'; ctx.strokeStyle = TEAMS[m.team].color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(m.x, m.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = game.time < m.armAt || Math.sin(game.time * 6) > 0 ? '#ff5a4a' : '#5a1a14'; ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
  }

  for (const u of units) {
    if (!onScreen(u.x, u.y)) continue;
    if (u.team !== team && !view.revealAll && !isVisibleTo(game, team, u)) continue;
    // Your own cloaked vehicles show faintly; the enemy can't see them at all.
    if (u.cloakOn) { ctx.save(); ctx.globalAlpha = 0.4; drawUnit(ctx, u, selectedIds.has(u.id), game.time); ctx.restore(); }
    else drawUnit(ctx, u, selectedIds.has(u.id), game.time);
  }

  for (const p of game.projectiles) {
    if (p.delay > 0 || !onScreen(p.x, p.y) || !visAt(p.x, p.y)) continue;
    drawProjectile(ctx, p);
  }

  for (const fx of game.effects) {
    if (fx.kind === 'wreck' || fx.kind === 'crater' || !onScreen(fx.x, fx.y, 600)) continue;
    if (!visAt(fx.x, fx.y) && !(fx.kind === 'droppod' && fx.team === team)) continue;
    drawEffect(ctx, fx);
  }
  // Smoke clouds, over everything: nobody sees into them.
  for (const c of game.smokes || []) {
    if (!onScreen(c.x, c.y, c.r + 40)) continue;
    const grow = Math.min(1, (game.time - c.born) / 1.2), fade = Math.min(1, (c.until - game.time) / 2);
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + game.time * 0.15, rr = c.r * 0.55 * grow * ((i % 3) / 2);
      ctx.fillStyle = `rgba(170,172,165,${0.42 * fade})`;
      ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, c.r * 0.5 * grow + 6, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Forcefields, over the vehicles they protect.
  for (const b of buildings) {
    if (!b.def.field || !onScreen(b.fieldAt ? b.fieldAt.x : b.x, b.fieldAt ? b.fieldAt.y : b.y, 260 + b.def.field.length / 2)) continue;
    if (b.team !== team && !view.revealAll && !visAt(b.x, b.y) && !visAt(b.x + Math.cos(b.facing) * 58, b.y + Math.sin(b.facing) * 58)) continue;
    drawField(ctx, b, game.time);
  }

  if (!view.revealAll) drawFog(ctx, game, tm);

  // Health bars on top of the fog so they're always readable.
  for (const e of game.entities) {
    if (!onScreen(e.x, e.y)) continue;
    if (e.team !== team && !view.revealAll && !isVisibleTo(game, team, e)) continue;
    const sel = selectedIds.has(e.id);
    const showStore = e.team === team && e.kind === 'building' && e.def.store && e.stored > 0.5;
    const hurtShield = e.kind === 'unit' && e.def.shield && e.shield < e.def.shield - 0.5;
    const busy = e.kind === 'building' && e.team === team && (e.upgrading !== null || e.researching);
    if (sel || e.hp < e.maxHp || (e.kind === 'building' && e.built < 1) || showStore || hurtShield || busy) drawHealthBar(ctx, e, sel);
  }

  // Veterans: one to three small gold bars beside them (Veteran, Elite, Ace).
  ctx.fillStyle = '#ffd25a'; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 1;
  for (const e of game.entities) {
    if (e.kind !== 'unit' || !e.rank || !onScreen(e.x, e.y)) continue;
    if (e.team !== team && !view.revealAll && !isVisibleTo(game, team, e)) continue;
    for (let k = 0; k < e.rank; k++) {
      const x = e.x - e.radius - 9, y = e.y + e.radius - 4 - k * 5;
      ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x, y - 3); ctx.lineTo(x + 4, y); ctx.lineTo(x + 4, y + 2); ctx.lineTo(x, y - 1); ctx.lineTo(x - 4, y + 2); ctx.closePath();
      ctx.stroke(); ctx.fill();
    }
  }

  // Reinforcing an allied commander: a gold chevron over the vehicles you command.
  if (view.reinforce) {
    ctx.fillStyle = '#ffd25a'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1.5;
    for (const e of game.entities) {
      if (e.kind !== 'unit' || e.cmdr !== 'player' || e.team !== team || !onScreen(e.x, e.y)) continue;
      const y = e.y - e.radius - 18;
      ctx.beginPath(); ctx.moveTo(e.x - 5, y - 3); ctx.lineTo(e.x, y + 2); ctx.lineTo(e.x + 5, y - 3); ctx.lineTo(e.x + 5, y); ctx.lineTo(e.x, y + 5); ctx.lineTo(e.x - 5, y); ctx.closePath();
      ctx.stroke(); ctx.fill();
    }
  }

  // Group numbers beside your vehicles that belong to a group.
  if (view.groupOf && view.groupOf.size) {
    ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const e of game.entities) {
      const k = e.kind === 'unit' && e.team === team && view.groupOf.get(e.id);
      if (!k || !onScreen(e.x, e.y)) continue;
      const x = e.x + e.radius + 4, y = e.y - e.radius - 2;
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.fillStyle = '#8cffa0'; ctx.fillText(k, x, y + 0.5);
    }
  }

  // Command pings (where you just clicked)
  for (const p of view.pings) {
    const k = p.t / 0.5;
    ctx.strokeStyle = p.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6 + k * 16, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (view.placing && (view.placeAt || view.mouseWorld)) drawPlacement(ctx, game, view);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (view.drag) {
    const { x0, y0, x1, y1 } = view.drag;
    ctx.strokeStyle = '#8cffa0'; ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(140,255,160,0.08)';
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
  }
}

function drawFog(ctx, game, tm) {
  const d = Render.fogData.data, n = game.map.W * game.map.H;
  for (let i = 0; i < n; i++) {
    const a = tm.vis[i] ? 0 : tm.explored[i] ? 120 : 235;
    d[i * 4] = 6; d[i * 4 + 1] = 8; d[i * 4 + 2] = 6; d[i * 4 + 3] = a;
  }
  Render.fog.getContext('2d').putImageData(Render.fogData, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(Render.fog, 0, 0, game.map.W * CONFIG.TILE, game.map.H * CONFIG.TILE);
}

function drawTerritory(ctx, game, team, placing) {
  const T = CONFIG.TILE;
  const def = BUILDING_TYPES[placing];
  if (def && def.placeNear) {
    // Silos have their own rule: next to the Recycler, or joined onto an Extractor.
    ctx.fillStyle = 'rgba(232,207,130,0.10)'; ctx.strokeStyle = 'rgba(232,207,130,0.6)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 2;
    for (const e of game.entities) if (e.team === team && e.type === def.placeNear && e.built >= 1) {
      if (def.adjacent) {
        // The ring of squares a silo can occupy while touching this Extractor.
        const pad = def.size + 1;
        ctx.fillRect((e.tx - pad) * T, (e.ty - pad) * T, (e.size + pad * 2) * T, (e.size + pad * 2) * T);
        ctx.strokeRect((e.tx - pad) * T, (e.ty - pad) * T, (e.size + pad * 2) * T, (e.size + pad * 2) * T);
      } else {
        ctx.beginPath(); ctx.arc(e.x, e.y, (def.placeRange + e.size / 2) * T, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    return;
  }
  ctx.fillStyle = 'rgba(140,255,160,0.07)';
  ctx.strokeStyle = 'rgba(140,255,160,0.35)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 2;
  const circles = [];
  for (const e of game.entities) if (e.kind === 'building' && e.team === team && e.built >= 1 && e.def.buildRadius) circles.push([e.x, e.y, e.def.buildRadius * T]);
  for (const [x, y, r] of circles) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  ctx.setLineDash([]);
}

function drawPlacement(ctx, game, view) {
  const T = CONFIG.TILE, def = BUILDING_TYPES[view.placing];
  const at = view.placeAt || view.mouseWorld;
  if (!at) return;
  if (view.placing === 'wall') { drawWallPlacement(ctx, game, view, at); return; }
  let { tx, ty } = placementTile(at, def.size);
  const bs = bastionAt(game, view.team, view.placing, tx, ty);
  if (bs) {
    // A Gun Tower or Radar up on a bastion: in its middle.
    const ok = canPlaceBuilding(game, view.team, view.placing, bs.tx, bs.ty).ok, h = def.size * T / 2;
    ctx.fillStyle = ok ? 'rgba(120,255,140,0.25)' : 'rgba(255,90,80,0.3)'; ctx.strokeStyle = ok ? '#8cffa0' : '#ff6a5a'; ctx.lineWidth = 2;
    ctx.fillRect(bs.x - h, bs.y - h, 2 * h, 2 * h); ctx.strokeRect(bs.x - h, bs.y - h, 2 * h, 2 * h);
    if (def.weapon) { ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(bs.x, bs.y, def.weapon.range * WALL.mountReach, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    if (def.field) {   // a Shield Projector: where its field will stand
      const g = fieldGeometry({ def, facing: view.placeFacing || 0, x: bs.x, y: bs.y });
      ctx.strokeStyle = 'rgba(90,184,255,0.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.lineTo(g.bx, g.by); ctx.stroke();
    }
    return;
  }
  const onWall = snapOntoWall(game, view.team, view.placing, at);
  if (onWall) {
    // Dropped onto a wall: lined up with it, replacing the sections under it.
    const ok = canPlaceBuilding(game, view.team, view.placing, onWall.tx, onWall.ty).ok;
    const ghost = { def, type: view.placing, faction: game.teams[view.team].faction, team: view.team, tx: onWall.tx, ty: onWall.ty, size: def.size,
      x: (onWall.tx + def.size / 2) * T, y: (onWall.ty + def.size / 2) * T, facing: onWall.facing, seg: onWall.seg, built: 1, hp: 1, maxHp: 1, id: 0 };
    ctx.save(); ctx.globalAlpha = ok ? 0.85 : 0.4; drawWallPiece(ctx, ghost, false, game.time); ctx.restore();
    if (!ok) { ctx.strokeStyle = '#ff6a5a'; ctx.lineWidth = 2; ctx.strokeRect(onWall.tx * T, onWall.ty * T, def.size * T, def.size * T); }
    return;
  }
  const ok = canPlaceBuilding(game, view.team, view.placing, tx, ty).ok;
  ctx.fillStyle = ok ? 'rgba(120,255,140,0.25)' : 'rgba(255,90,80,0.3)';
  ctx.strokeStyle = ok ? '#8cffa0' : '#ff6a5a'; ctx.lineWidth = 2;
  ctx.fillRect(tx * T, ty * T, def.size * T, def.size * T);
  ctx.strokeRect(tx * T, ty * T, def.size * T, def.size * T);
  if (def.weapon) {
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.arc((tx + def.size / 2) * T, (ty + def.size / 2) * T, def.weapon.range, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (def.wallPiece) {
    // Which way the gate or bastion faces (its front, the outside).
    const step = Math.PI / 2, f = Math.round((view.placeFacing || 0) / step) * step, fx = Math.cos(f), fy = Math.sin(f);
    const cx = (tx + def.size / 2) * T + fx * (def.size * T / 2 + 10), cy = (ty + def.size / 2) * T + fy * (def.size * T / 2 + 10);
    ctx.fillStyle = 'rgba(255,210,90,0.95)';
    ctx.beginPath(); ctx.moveTo(cx + fx * 10, cy + fy * 10); ctx.lineTo(cx - fy * 8, cy + fx * 8); ctx.lineTo(cx + fy * 8, cy - fx * 8); ctx.closePath(); ctx.fill();
  }
  if (def.field) {
    // Where its wall of force will stand, and which way it faces.
    const g = fieldGeometry({ def, facing: view.placeFacing || 0, x: (tx + def.size / 2) * T, y: (ty + def.size / 2) * T });
    ctx.strokeStyle = 'rgba(90,184,255,0.9)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.lineTo(g.bx, g.by); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.cx + g.dx * 30, g.cy + g.dy * 30); ctx.stroke();
    const ax = g.cx + g.dx * 30, ay = g.cy + g.dy * 30;
    ctx.beginPath(); ctx.moveTo(ax + g.dx * 8, ay + g.dy * 8); ctx.lineTo(ax - g.dy * 7, ay + g.dx * 7); ctx.lineTo(ax + g.dy * 7, ay - g.dx * 7); ctx.closePath();
    ctx.fillStyle = 'rgba(90,184,255,0.9)'; ctx.fill();
  }
}

// A wall being dragged out from its pivot: the wall itself, any square where
// it can't go in red, its front, how many sections and what they cost.
function drawWallPlacement(ctx, game, view, at) {
  const T = CONFIG.TILE, team = view.team;
  // Snap points nearby: the ends of your walls, gate posts and bastions.
  for (const q of wallSnapPoints(game, team)) if (Math.hypot(q.x - at.x, q.y - at.y) < T * 4) {
    ctx.strokeStyle = 'rgba(255,210,90,0.6)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(q.x, q.y, WALL_W / 2 + 6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  const a = view.wallStart || snapWallStart(game, team, at);
  const guide = (from, to) => {   // a dashed line showing what it lines up with
    ctx.save(); ctx.strokeStyle = 'rgba(255,210,90,0.85)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.restore();
  };
  if (!view.wallStart) for (const g of a.guides || []) guide(g, a);
  // The square the pivot is locked to.
  ctx.strokeStyle = 'rgba(255,210,90,0.9)'; ctx.lineWidth = 2;
  ctx.strokeRect(Math.floor(a.x / T) * T + 1, Math.floor(a.y / T) * T + 1, T - 2, T - 2);
  ctx.fillStyle = '#ffd25a'; ctx.strokeStyle = '#000';
  ctx.beginPath(); ctx.arc(a.x, a.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // the pivot
  if (!view.wallStart) return;
  const e = view.wallEnd, b = e && e.ax === a.x && e.ay === a.y ? e : snapWallEnd(game, team, a, at);
  if (Math.hypot(b.x - a.x, b.y - a.y) < 4) return;
  for (const g of b.guides || []) guide(g, b);
  if (b.meets) { ctx.strokeStyle = 'rgba(255,210,90,0.95)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(b.x, b.y, WALL_W / 2 + 7, 0, Math.PI * 2); ctx.stroke(); }
  const facing = wallFacingAB(game, a, b, view.wallFlip), nx = Math.cos(facing), ny = Math.sin(facing);
  const tiles = wallTiles(a.x, a.y, b.x, b.y);
  // The squares it will stand on: outlined, red where it can't go.
  for (const [x, y] of tiles) {
    const i = y * game.map.W + x, mine = game.wallGrid && game.wallGrid[i] === team;
    if (mine) continue;   // already wall there: joins it
    const good = canPlaceBuilding(game, team, 'wall', x, y).ok;
    ctx.fillStyle = good ? 'rgba(120,255,140,0.12)' : 'rgba(255,90,80,0.35)'; ctx.strokeStyle = good ? 'rgba(140,255,160,0.7)' : '#ff6a5a'; ctx.lineWidth = 1.5;
    ctx.fillRect(x * T, y * T, T, T); ctx.strokeRect(x * T + 0.5, y * T + 0.5, T - 1, T - 1);
  }
  ctx.save(); ctx.globalAlpha = 0.7;
  drawWallBand(ctx, [a, b], nx, ny, { faction: game.teams[team].faction, team }, 1, false, game.time);
  ctx.restore();
  drawWallPillar(ctx, a.x, a.y, { faction: game.teams[team].faction, team }, 0.7);
  drawWallPillar(ctx, b.x, b.y, { faction: game.teams[team].faction, team }, 0.7);
  // The front: arrows on the outside.
  ctx.fillStyle = 'rgba(255,210,90,0.95)';
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  for (let d = 24; d < L - 8; d += 64) {
    const cx = a.x + (b.x - a.x) * d / L + nx * 32, cy = a.y + (b.y - a.y) * d / L + ny * 32;
    ctx.beginPath(); ctx.moveTo(cx + nx * 9, cy + ny * 9); ctx.lineTo(cx - ny * 6, cy + nx * 6); ctx.lineTo(cx + ny * 6, cy - nx * 6); ctx.closePath(); ctx.fill();
  }
  ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3.5;
  const cost = BUILDING_TYPES.wall.cost, n = wallSections({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
  const deg = ((Math.round(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) % 360) + 360) % 360;
  const label = `${n} section${n === 1 ? '' : 's'} × ${cost} = ${n * cost} scrap · ${deg}°`;
  const lx = b.x, ly = b.y - 34;
  ctx.textAlign = 'center'; ctx.strokeText(label, lx, ly); ctx.fillText(label, lx, ly); ctx.textAlign = 'left';
}

function placementTile(world, size) {
  const T = CONFIG.TILE;
  return { tx: Math.round(world.x / T - size / 2), ty: Math.round(world.y / T - size / 2) };
}

function drawGeyser(ctx, g, time, highlight) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 3 + g.id);
  ctx.save(); ctx.translate(g.x, g.y);
  const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
  grad.addColorStop(0, `rgba(255,214,110,${0.55 + pulse * 0.3})`); grad.addColorStop(1, 'rgba(255,214,110,0)');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a241a'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a7440'; ctx.lineWidth = 3; ctx.stroke();
  // Puffs of scrap dust rising out of the vent
  for (let k = 0; k < 3; k++) {
    const t = (time * 0.8 + k / 3 + g.id * 0.37) % 1;
    ctx.fillStyle = `rgba(230,210,150,${0.45 * (1 - t)})`;
    ctx.beginPath(); ctx.arc(Math.sin(k * 2.1 + g.id) * 5, -t * 26, 3 + t * 6, 0, Math.PI * 2); ctx.fill();
  }
  if (highlight) {
    ctx.strokeStyle = '#8cffa0'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.arc(0, 0, 36 + pulse * 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawScrap(ctx, s) {
  const k = 0.45 + 0.55 * s.amount / s.max;
  const seed = s.id * 9301;
  ctx.save(); ctx.translate(s.x, s.y);
  for (let i = 0; i < 5; i++) {
    const a = (seed * (i + 1) % 628) / 100, r = (i ? 6 : 0) * k;
    const sz = (5 + (seed * (i + 3) % 5)) * k;
    ctx.fillStyle = i % 2 ? '#8a8f94' : '#b8a36a';
    ctx.save(); ctx.translate(Math.cos(a) * r, Math.sin(a) * r); ctx.rotate(a);
    ctx.fillRect(-sz / 2, -sz / 2, sz, sz * 0.7);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,230,140,0.8)';
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

// Which design from the unit sheet (js/sprites.js) each game type uses.
// No prototype, so a type like "constructor" isn't mistaken for a built-in.
// Power Generators and Shield Projectors are drawn here (drawPowerBuilding); they borrow the Silo's explosion and crater.
const SPRITE_ID = Object.assign(Object.create(null), { mobileRecycler: 'recyclerV', repairpad: 'repair', basesilo: 'silo', outsilo: 'exsilo', arttower: 'towerArt', heavytower: 'towerHeavy', generator: 'silo', shield: 'silo', armory: 'lab', drone: 'scout', heavy: 'juggernaut', heavyBuilder: 'constructor', wall: 'silo', gate: 'silo', bastion: 'silo' });
const spriteId = type => SPRITE_ID[type] || type;
// The Kethra Concord's designs (js/sprites_kethra.js). Its towers have one
// design; upgraded ones are drawn with its gold markings.
const KETHRA_ID = Object.assign(Object.create(null), {
  mobileRecycler: 'monad', recycler: 'nexus', scavenger: 'skimmer', constructor: 'loom', scout: 'shard', tank: 'bulwark',
  artillery: 'spire', hornet: 'talon', sentry: 'pylon', factory: 'assembler', repairpad: 'lattice', extractor: 'siphon',
  basesilo: 'vault', tower: 'prism', arttower: 'prism', heavytower: 'prism', lab: 'archive', radar: 'array', generator: 'vault', shield: 'vault', armory: 'archive', drone: 'shard', heavy: 'colossus', heavyBuilder: 'loom', wall: 'vault', gate: 'vault', bastion: 'vault',
});
// Which set of designs, and which design in it, draws a thing of a given faction.
const artFor = faction => (faction === 'kethra' && window.KethraSprites ? KethraSprites : UnitSprites);
const artId = (faction, type) => (faction === 'kethra' && window.KethraSprites ? KETHRA_ID[type] || type : spriteId(type));
const teamName = t => (t === 1 ? 'blue' : 'red');
// Seconds since a gun last fired, while its recoil and muzzle flash still show.
const sinceShot = (e, now) => (e.lastShot !== undefined && now - e.lastShot < 0.5 ? now - e.lastShot : null);

// A brief white flash over something that has just been hit.
function flashOver(ctx, x, y, r) {
  ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

function drawBuilding(ctx, b, selected, ghost, time) {
  if (b.def.wallPiece) { drawWallPiece(ctx, b, ghost, time); if (selected) drawSelection(ctx, b); return; }
  if (b.type === 'generator' || b.type === 'shield') { drawPowerBuilding(ctx, b, ghost, time); if (selected) drawSelection(ctx, b); return; }
  if (b.type === 'armory') { drawArmory(ctx, b, ghost, time); if (selected) drawSelection(ctx, b); return; }
  const T = CONFIG.TILE, s = b.size * T, art = artFor(b.faction), id = artId(b.faction, b.variant || b.type), team = teamName(b.team);
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.5;
  if (b.built < 1) {
    // Construction site: the design fades in as it is built, inside a dashed outline.
    ctx.globalAlpha *= 0.2 + 0.55 * b.built;
    art.drawSprite(ctx, id, { x: b.x, y: b.y, team, turret: b.turret });
    ctx.globalAlpha = ghost ? 0.5 : 1;
    ctx.strokeStyle = TEAMS[b.team].color; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.strokeRect(b.x - s / 2 + 2, b.y - s / 2 + 2, s - 4, s - 4); ctx.setLineDash([]);
    ctx.restore();
    if (selected) drawSelection(ctx, b);
    return;
  }
  // The lab's dome only pulses while it is researching.
  const t = b.type === 'lab' && !b.researching ? 0 : time;
  art.drawSprite(ctx, id, { x: b.x, y: b.y, team, mk: b.level > 1 || (art !== UnitSprites && !!b.variant), t, turret: b.turret, fire: sinceShot(b, time) });
  if (b.hp < b.maxHp * 0.5) art.drawDamage(ctx, id, b.x, b.y, time);
  if (b.hitFlash > 0) flashOver(ctx, b.x, b.y, s * 0.45);
  ctx.restore();
  if (selected) drawSelection(ctx, b);
}

// Compound walls: concrete (Scrapline) or dark crystal-bound stone (Kethra).
// Each wall run is drawn as one smooth, thick band along its true line (the
// squares underneath are only where it blocks), joined smoothly to the runs,
// gates and bastions it touches. The front (outside) has a darker face and a
// row of spikes.
const WALL_W = 34;   // band width: a little more than a square
function wallColours(faction) {
  const k = faction === 'kethra';
  return { base: k ? '#2a2f3d' : '#5a5c51', top: k ? '#434b60' : '#8d8f80', hi: k ? '#56607a' : '#a3a593', dark: k ? '#171a23' : '#34362e',
           edge: '#0d0f0c', spike: k ? '#8a6fd0' : '#706d5e' };
}
function drawWallNetwork(ctx, game, team, onScreen, time) {
  const T = CONFIG.TILE;
  const shown = new Map();   // piece -> drawn faded (seen before, not in sight now)
  for (const e of game.entities) {
    if (e.kind !== 'building' || e.type !== 'wall' || !onScreen(e.x, e.y, 300)) continue;
    const vis = view.revealAll || e.team === team || isVisibleTo(game, team, e);
    if (vis || e.seen[team]) shown.set(e, !vis);
  }
  const runs = new Map();
  for (const [e] of shown) { const k = e.team + ':' + (e.runId || 'x' + e.id); if (!runs.has(k)) runs.set(k, []); runs.get(k).push(e); }
  const pillars = [];
  for (const list of runs.values()) {
    const g = wallSeg(game, list[0]), vx = g.bx - g.ax, vy = g.by - g.ay, L = Math.hypot(vx, vy);
    const f = list[0].facing || 0, nx = Math.cos(f), ny = Math.sin(f);
    if (L < 1) { pillars.push({ x: g.ax, y: g.ay, e: list[0], faded: shown.get(list[0]) }); continue; }
    const ux = vx / L, uy = vy / L;
    // Where each piece's square cuts the line: those stretches are drawn.
    const spans = [];
    for (const e of list) {
      const x0 = e.tx * T - 0.5, x1 = (e.tx + 1) * T + 0.5, y0 = e.ty * T - 0.5, y1 = (e.ty + 1) * T + 0.5;
      let t0 = 0, t1 = L;
      for (const [d, o, lo, hi] of [[ux, g.ax, x0, x1], [uy, g.ay, y0, y1]]) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = 1; t1 = 0; } continue; }
        let a = (lo - o) / d, b = (hi - o) / d; if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      }
      if (t1 > t0) spans.push({ t0, t1, e });
    }
    spans.sort((a, b) => a.t0 - b.t0);
    // Join neighbouring stretches with the same state into one band.
    const bands = [];
    for (const sp of spans) {
      const st = sp.e.built >= 1 ? 1 : 0, last = bands[bands.length - 1];
      if (last && last.st === st && sp.t0 <= last.t1 + 2) { last.t1 = Math.max(last.t1, sp.t1); last.n++; last.built += sp.e.built; last.faded = last.faded || shown.get(sp.e); }
      else bands.push({ t0: sp.t0, t1: sp.t1, st, n: 1, built: sp.e.built, faded: shown.get(sp.e) });
    }
    // Where the run starts or ends on another wall's square (a joint), carry
    // the band on to the shared pillar.
    const ownAt = (x, y) => { const i = Math.floor(y / T) * game.map.W + Math.floor(x / T); return game.wallGrid[i] === list[0].team && !list.some(e => e.id === game.wallId[i]); };
    if (bands.length && bands[0].t0 > 2 && bands[0].t0 < T * 1.6 && ownAt(g.ax, g.ay)) bands[0].t0 = 0;
    const lb = bands[bands.length - 1];
    if (lb && lb.t1 < L - 2 && lb.t1 > L - T * 1.6 && ownAt(g.bx, g.by)) lb.t1 = L;
    for (const bd of bands) {
      const p0 = { x: g.ax + ux * bd.t0, y: g.ay + uy * bd.t0 }, p1 = { x: g.ax + ux * bd.t1, y: g.ay + uy * bd.t1 };
      drawWallBand(ctx, [p0, p1], nx, ny, list[0], bd.st ? (bd.faded ? 0.5 : 1) : 0.2 + 0.55 * bd.built / bd.n, !bd.st, time);
      // A pillar at each end of the run; a broken end where it was breached.
      for (const [t, p] of [[bd.t0, p0], [bd.t1, p1]]) {
        const end = t < 2 ? { x: g.ax, y: g.ay } : t > L - 2 ? { x: g.bx, y: g.by } : null;
        if (end) pillars.push({ x: end.x, y: end.y, e: list[0], faded: bd.faded, alpha: bd.st ? 1 : 0.2 + 0.55 * bd.built / bd.n });
        else if (!game.entities.some(o => (o.def.gate || o.def.bastion) && o.team === list[0].team && o.hp > 0 && Math.hypot(o.x - p.x, o.y - p.y) < T * 1.8)) drawRubbleEnd(ctx, p, ux, uy, t === bd.t0 ? -1 : 1, list[0]);   // a real breach, not a gate
      }
    }
  }
  // Pillars last, so joins between runs sit under one round post.
  const done = [];
  for (const pl of pillars) {
    if (done.some(q => Math.hypot(q.x - pl.x, q.y - pl.y) < 4)) continue;
    done.push(pl);
    drawWallPillar(ctx, pl.x, pl.y, pl.e, pl.faded ? 0.5 : (pl.alpha || 1));
  }
}
function drawWallBand(ctx, pts, nx, ny, piece, alpha, building, time) {
  const C = wallColours(piece.faction), path = (off, k = 0) => {
    ctx.beginPath();
    pts.forEach((p, i) => { const x = p.x + nx * off, y = p.y + ny * off; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  };
  ctx.save(); ctx.globalAlpha *= alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = WALL_W + 2; ctx.save(); ctx.translate(3, 4); path(0); ctx.stroke(); ctx.restore();   // shadow
  ctx.strokeStyle = C.edge; ctx.lineWidth = WALL_W; path(0); ctx.stroke();
  ctx.strokeStyle = C.base; ctx.lineWidth = WALL_W - 3; path(0); ctx.stroke();
  ctx.strokeStyle = C.dark; ctx.lineWidth = 9; path(WALL_W / 2 - 7); ctx.stroke();             // the front face
  ctx.strokeStyle = C.top; ctx.lineWidth = WALL_W - 16; path(-2); ctx.stroke();              // the walkway on top
  ctx.strokeStyle = C.hi; ctx.lineWidth = 2; path(-WALL_W / 2 + 9); ctx.stroke();            // a lit edge at the back
  // The side's colour: a solid stripe along the top (and round it while it's being built).
  ctx.strokeStyle = TEAMS[piece.team].color; ctx.lineWidth = 2; path(-2); ctx.stroke();
  if (building) { ctx.lineWidth = 1.5; path(WALL_W / 2 - 1); ctx.stroke(); path(-WALL_W / 2 + 1); ctx.stroke(); }
  // Spikes along the front, the side's colour along the top, Shield Wall emitters.
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const along = d => { for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); if (d <= L || i === pts.length - 1) { const k = L ? Math.min(1, d / L) : 0; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k }; } d -= L; } return pts[0]; };
  ctx.fillStyle = C.spike; ctx.strokeStyle = C.edge; ctx.lineWidth = 1;
  const tx = -ny, ty = nx;
  for (let d = 9; d < total - 4; d += 16) {
    const p = along(d), bx = p.x + nx * (WALL_W / 2 - 1), by = p.y + ny * (WALL_W / 2 - 1);
    ctx.beginPath(); ctx.moveTo(bx + nx * 7, by + ny * 7); ctx.lineTo(bx + tx * 4.5, by + ty * 4.5); ctx.lineTo(bx - tx * 4.5, by - ty * 4.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
function drawWallPillar(ctx, x, y, piece, alpha = 1) {
  const C = wallColours(piece.faction), r = WALL_W / 2 + 3;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x + 3, y + 4, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.base; ctx.strokeStyle = C.edge; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.top; ctx.beginPath(); ctx.arc(x, y, r - 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.hi; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r - 5, Math.PI * 0.9, Math.PI * 1.6); ctx.stroke();
  ctx.fillStyle = TEAMS[piece.team].color; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawRubbleEnd(ctx, p, ux, uy, dir, piece) {
  const C = wallColours(piece.faction);
  ctx.save(); ctx.fillStyle = C.base; ctx.strokeStyle = C.edge; ctx.lineWidth = 1;
  for (let k = 0; k < 4; k++) {
    const o = (k - 1.5) * 8, x = p.x - uy * o + ux * dir * (3 + (k % 2) * 4), y = p.y + ux * o + uy * dir * (3 + (k % 2) * 4);
    ctx.beginPath(); ctx.arc(x, y, 3 + (k % 2), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
function drawWallPiece(ctx, b, ghost, time) {
  const T = CONFIG.TILE, s = b.size * T, x0 = b.tx * T, y0 = b.ty * T;
  const C = wallColours(b.faction), accent = TEAMS[b.team].color;
  const fx = Math.cos(b.facing || 0), fy = Math.sin(b.facing || 0);
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.5;
  if (b.built < 1) ctx.globalAlpha *= 0.25 + 0.6 * b.built;
  ctx.strokeStyle = C.edge; ctx.lineWidth = 1.2;
  if (b.type === 'wall') {
    // The band itself is drawn by drawWallNetwork; here, only a Shield Wall
    // emitter on its front.
    if (b.shieldWall && b.built >= 1) {
      const on = 0.6 + 0.4 * Math.sin(time * 5 + b.id);
      ctx.fillStyle = `rgba(110,200,255,${on})`;
      ctx.beginPath(); ctx.arc(b.x + fx * 11, b.y + fy * 11, 3, 0, Math.PI * 2); ctx.fill();
    }
  } else if (b.def.gate) {
    // Two pillars on the wall's line, doors sliding between them.
    const g = b.seg || (() => { const ux = -fy, uy = fx, w = T * (b.size / 2 + 0.6); return { ax: b.x - ux * w, ay: b.y - uy * w, bx: b.x + ux * w, by: b.y + uy * w }; })();
    const cx = (g.ax + g.bx) / 2, cy = (g.ay + g.by) / 2, half = Math.hypot(g.bx - g.ax, g.by - g.ay) / 2, a = Math.atan2(g.by - g.ay, g.bx - g.ax);
    let open = 0;
    forUnitsNear(game, cx, cy, 80, u => { if (u.team === b.team && u.hp > 0 && Math.hypot(u.x - cx, u.y - cy) < 75) open = 1; });
    b.openK = (b.openK || 0) + ((open ? 1 : 0) - (b.openK || 0)) * 0.15;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
    const H = WALL_W / 2 - 5, gap = half - (WALL_W / 2 + 1);
    ctx.fillStyle = 'rgba(20,18,14,0.45)'; ctx.fillRect(-gap, -H, 2 * gap, 2 * H);   // the opening
    const d = gap * (1 - b.openK * 0.92);
    for (const k of [-1, 1]) {
      ctx.save(); ctx.translate(k * (gap - d / 2), 0);
      ctx.fillStyle = C.top; ctx.fillRect(-d / 2, -H + 3, d, 2 * H - 6); ctx.strokeRect(-d / 2, -H + 3, d, 2 * H - 6);
      ctx.fillStyle = '#e0b030';
      for (let q = -d / 2 + 2; q < d / 2 - 4; q += 7) { ctx.beginPath(); ctx.moveTo(q, -H + 3); ctx.lineTo(q + 3.5, -H + 3); ctx.lineTo(q + 7, H - 3); ctx.lineTo(q + 3.5, H - 3); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();
    ctx.restore(); ctx.save();
    drawWallPillar(ctx, g.ax, g.ay, b, ghost ? 0.5 : b.built < 1 ? 0.25 + 0.6 * b.built : 1);
    drawWallPillar(ctx, g.bx, g.by, b, ghost ? 0.5 : b.built < 1 ? 0.25 + 0.6 * b.built : 1);
  } else {
    // Bastion: a heavy square keep the wall runs into, round towers on its
    // corners, battlements, a ring where a gun or radar can stand.
    const m = 4, x = x0 - m, y = y0 - m, w = s + 2 * m;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 4, y + 5, w, w);
    ctx.fillStyle = C.base; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, w, 6) : ctx.rect(x, y, w, w); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.top; ctx.fillRect(x + 8, y + 8, w - 16, w - 16);
    ctx.fillStyle = C.dark;
    for (let q = 0; q < 5; q++) {
      const t = 12 + q * (w - 24) / 4 - 3;
      ctx.fillRect(x + t, y + 2, 6, 5); ctx.fillRect(x + t, y + w - 7, 6, 5); ctx.fillRect(x + 2, y + t, 5, 6); ctx.fillRect(x + w - 7, y + t, 5, 6);
    }
    for (const [cx, cy] of [[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + w - 5], [x + w - 5, y + w - 5]]) {
      ctx.fillStyle = C.base; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.hi; ctx.beginPath(); ctx.arc(cx - 1.5, cy - 1.5, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = C.dark; ctx.fillRect(x + w / 2 - 10 + fx * (w / 2 - 6), y + w / 2 - 10 + fy * (w / 2 - 6), 20, 20);   // front parapet
    if (!b.mountId) { ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, s * 0.2, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
  if (b.built < 1 && b.type !== 'wall') {
    ctx.strokeStyle = TEAMS[b.team].color; ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 + 1.5, y0 + 1.5, s - 3, s - 3);
  } else if (b.built >= 1) {
    if (b.hp < b.maxHp * 0.5) {   // cracks
      ctx.strokeStyle = 'rgba(10,10,8,0.7)'; ctx.lineWidth = 1.2; ctx.beginPath();
      const r = (b.id * 9301 + 49297) % 233280 / 233280, k = Math.min(s, 30) / 2;
      ctx.moveTo(b.x - k * (0.6 - r * 0.5), b.y - k * 0.8); ctx.lineTo(b.x, b.y - k * 0.1); ctx.lineTo(b.x + k * (0.5 - r * 0.3), b.y + k * 0.8);
      if (b.hp < b.maxHp * 0.25) { ctx.moveTo(b.x - k * 0.9, b.y + k * 0.2); ctx.lineTo(b.x, b.y - k * 0.1); }
      ctx.stroke();
    }
    if (b.hitFlash > 0) flashOver(ctx, b.x, b.y, Math.min(s, 34) * 0.45);
  }
}

function drawSelection(ctx, e) {
  ctx.strokeStyle = '#8cffa0'; ctx.lineWidth = 1.5;
  if (e.kind === 'building') {
    const s = e.size * CONFIG.TILE / 2 + 3, c = 10;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.moveTo(e.x + sx * s, e.y + sy * (s - c)); ctx.lineTo(e.x + sx * s, e.y + sy * s); ctx.lineTo(e.x + sx * (s - c), e.y + sy * s);
    }
    ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 5, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawUnit(ctx, u, selected, time) {
  const r = u.radius, art = artFor(u.faction), id = artId(u.faction, baseType(u));
  if (selected) drawSelection(ctx, u);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(u.x + 3, u.y + 5, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  if (u.cmdId) {   // under a commander: a green ring on the ground
    ctx.strokeStyle = 'rgba(94,224,106,0.85)'; ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(94,224,106,0.18)';
    ctx.beginPath(); ctx.ellipse(u.x, u.y + 2, r + 4, (r + 4) * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  if (u.type === 'drone') { drawCustomUnit(ctx, u, time); }
  else art.drawSprite(ctx, id, {
    x: u.x, y: u.y, heading: u.angle, turret: wrapAngle(u.turret - u.angle), team: u.cmdId ? 'green' : teamName(u.team),   // under a commander: green
    mk: !!u.def.base || !!u.def.wallBuilder, t: time, legE: u.legE || 0, fire: sinceShot(u, time),
    turret2: u.turret2 !== undefined ? wrapAngle(u.turret2 - u.angle) : undefined,
    fire2: u.lastShot2 !== undefined && time - u.lastShot2 < 0.5 ? time - u.lastShot2 : null,
    thrust: u.movingTick >= game.tick - 1,   // Kethra exhaust glow while moving
    shield: !!u.def.shield && u.shield > 1, shieldHit: u.shieldFlash > 0,
  });
  if (u.hp < u.maxHp * 0.5) art.drawDamage(ctx, id, u.x, u.y, time);
  if (u.hitFlash > 0) flashOver(ctx, u.x, u.y, r);
  if (u.def.special && u.def.shield && u.shield > 1 && !u.def.shieldFX) {   // a Shield special: a close bubble
    const f = u.shield / u.def.shield;
    ctx.strokeStyle = `rgba(${f > 0.5 ? '120,200,255' : '255,170,80'},${0.35 + (u.shieldFlash > 0 ? 0.5 : 0.25 * f)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(u.x, u.y, r + 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(120,200,255,${0.06 + (u.shieldFlash > 0 ? 0.12 : 0)})`; ctx.fill();
  }
  if (u.empUntil > time) {   // stalled by an EMP: blue sparks crawling over it
    ctx.strokeStyle = `rgba(150,220,255,${0.6 + 0.4 * Math.sin(time * 40)})`; ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) { const a = time * 7 + i * 2.1; ctx.beginPath(); ctx.moveTo(u.x + Math.cos(a) * r, u.y + Math.sin(a) * r); ctx.lineTo(u.x + Math.cos(a + 0.6) * (r * 0.4), u.y + Math.sin(a + 0.6) * (r * 0.4)); ctx.stroke(); }
  }
  if (u.boostUntil > time) {   // Overdrive: a streak behind it
    ctx.strokeStyle = 'rgba(255,200,90,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(u.x - Math.cos(u.angle) * r, u.y - Math.sin(u.angle) * r); ctx.lineTo(u.x - Math.cos(u.angle) * (r + 18), u.y - Math.sin(u.angle) * (r + 18)); ctx.stroke();
  }
  if (u.shockUntil > time) {   // slowed by a Shock Emitter
    ctx.strokeStyle = `rgba(140,228,255,${0.5 + 0.4 * Math.sin(time * 30)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 2, rr = r + 3 + (i % 2) * 3; ctx[i ? 'lineTo' : 'moveTo'](u.x + Math.cos(a) * rr, u.y + Math.sin(a) * rr); } ctx.stroke();
  }
  if (u.cmdId && game.teams[u.team].commands && game.teams[u.team].commands.some(c => c.cmdrId === u.id)) drawStar(ctx, u.x, u.y - r - 10, 8);   // the commander
  if (u.repairing > 0) {
    ctx.strokeStyle = `rgba(110,224,110,${0.5 + 0.4 * Math.sin(time * 10)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(u.x, u.y, r + 4, 0, Math.PI * 2); ctx.stroke();
  }
}

// A commander's gold star.
function drawStar(ctx, x, y, R) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.45 : R; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1.2; ctx.fill(); ctx.stroke();
}

// Repair Drone: a small hovering rotor craft with a green repair light.
// Kethra version has cyan rotor light. (The Juggernaut is a proper sprite.)
function drawCustomUnit(ctx, u, time) {
  const kethra = u.faction === 'kethra', col = TEAMS[u.team].color, r = u.radius;
  const body = kethra ? '#2a2e3a' : '#4a5446', plate = kethra ? '#3c4254' : '#6b7866', glow = kethra ? '#6ff0ff' : '#ffd25a';
  ctx.save(); ctx.translate(u.x, u.y);
  ctx.strokeStyle = '#0d0f0c'; ctx.lineWidth = 1.5;
  if (u.type === 'drone') {
    const bob = Math.sin(time * 5 + u.id) * 1.5;
    ctx.translate(0, bob - 3);
    ctx.rotate(u.angle);
    // Four rotor arms with spinning blurs.
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, ax = Math.cos(a) * r * 0.95, ay = Math.sin(a) * r * 0.95;
      ctx.strokeStyle = plate; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ax, ay); ctx.stroke();
      // White propellers, so drones stand out on any ground.
      ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(ax, ay, r * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8;
      const sp = time * 40 + k;
      ctx.beginPath(); ctx.moveTo(ax - Math.cos(sp) * r * 0.5, ay - Math.sin(sp) * r * 0.5); ctx.lineTo(ax + Math.cos(sp) * r * 0.5, ay + Math.sin(sp) * r * 0.5); ctx.stroke();
    }
    ctx.strokeStyle = '#0d0f0c'; ctx.lineWidth = 1.5;
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2); ctx.fill();
    // Repair light: a green cross that pulses while it works.
    const busy = u.mending !== undefined && time - u.mending < 0.2;
    ctx.fillStyle = busy ? `rgba(110,240,110,${0.7 + 0.3 * Math.sin(time * 14)})` : '#6ee06e';
    ctx.fillRect(-1.2, -4, 2.4, 8); ctx.fillRect(-4, -1.2, 8, 2.4);
  }
  ctx.restore();
}

// Power Generator (a coil with a glowing core that spins while it powers
// something) and Shield Projector (an emitter fork pointing the way its
// field faces). Kethra versions are rounder, with cyan light.
// Armory: a squat bunker with a blast door and a gun rack on the roof
// (Scrapline), or a rounded forge with a glowing core (Kethra). Sparks fly
// from it while it researches.
function drawArmory(ctx, b, ghost, time) {
  const T = CONFIG.TILE, s = b.size * T, h = s / 2, col = TEAMS[b.team].color, kethra = b.faction === 'kethra';
  ctx.save(); ctx.translate(b.x, b.y);
  ctx.globalAlpha = ghost ? 0.5 : b.built < 1 ? 0.25 + 0.6 * b.built : 1;
  ctx.strokeStyle = '#0d0f0c'; ctx.lineWidth = 2;
  if (kethra) {
    ctx.fillStyle = '#3c4254'; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * (h - 3), Math.sin(a) * (h - 3)); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a2e3a'; ctx.beginPath(); ctx.arc(0, 0, h * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const live = b.researching && b.built >= 1;
    ctx.fillStyle = live ? `rgba(111,240,255,${0.6 + 0.4 * Math.sin(time * 8)})` : '#6ff0ff';
    ctx.beginPath(); ctx.arc(0, 0, h * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a5cff'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + (live ? time : 0); ctx.beginPath(); ctx.moveTo(Math.cos(a) * h * 0.3, Math.sin(a) * h * 0.3); ctx.lineTo(Math.cos(a) * h * 0.52, Math.sin(a) * h * 0.52); ctx.stroke(); }
    ctx.fillStyle = col; ctx.fillRect(-h * 0.5, h - 9, h, 4);
  } else {
    ctx.fillStyle = '#5a6156'; ctx.beginPath(); ctx.rect(-h + 3, -h + 3, s - 6, s - 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6f7869'; ctx.fillRect(-h + 7, -h + 7, s - 14, s * 0.42);
    // Gun rack on the roof: three barrels.
    ctx.fillStyle = '#2f332d';
    for (let i = 0; i < 3; i++) ctx.fillRect(-h + 12, -h + 11 + i * 7, s - 30, 3.5);
    ctx.fillStyle = '#c9ced4'; for (let i = 0; i < 3; i++) ctx.fillRect(h - 18, -h + 10 + i * 7, 5, 5.5);
    // Blast door with hazard stripes.
    ctx.fillStyle = '#e0b030'; ctx.fillRect(-h * 0.55, h * 0.12, h * 1.1, h * 0.62);
    ctx.fillStyle = '#1b1d21';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); const x0 = -h * 0.55 + i * h * 0.24; ctx.moveTo(x0, h * 0.74); ctx.lineTo(x0 + h * 0.12, h * 0.74); ctx.lineTo(x0 + h * 0.24, h * 0.12); ctx.lineTo(x0 + h * 0.12, h * 0.12); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = '#0d0f0c'; ctx.lineWidth = 1.5; ctx.strokeRect(-h * 0.55, h * 0.12, h * 1.1, h * 0.62);
    ctx.fillStyle = col; ctx.fillRect(-h + 5, -h + 5, 5, s - 10);
  }
  // Sparks from the work going on inside.
  if (b.researching && b.built >= 1 && !ghost) {
    for (let i = 0; i < 4; i++) {
      const ph = (time * 2 + i * 0.27) % 1, a = i * 2.1 + Math.floor(time * 2 + i * 0.27) * 1.3;
      ctx.fillStyle = `rgba(255,${200 - ph * 100 | 0},80,${1 - ph})`;
      ctx.beginPath(); ctx.arc(Math.cos(a) * h * 0.3 * (1 + ph), -h * 0.1 + Math.sin(a) * h * 0.3 * (1 + ph) - ph * 10, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawPowerBuilding(ctx, b, ghost, time) {
  const T = CONFIG.TILE, s = b.size * T, h = s / 2, col = TEAMS[b.team].color, kethra = b.faction === 'kethra';
  const glow = kethra ? '#6ff0ff' : '#ffd25a', body = kethra ? '#2a2e3a' : '#4a5446', plate = kethra ? '#3c4254' : '#6b7866';
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.globalAlpha = ghost ? 0.5 : b.built < 1 ? 0.25 + 0.6 * b.built : 1;
  ctx.fillStyle = body; ctx.strokeStyle = '#0d0f0c'; ctx.lineWidth = 2;
  ctx.beginPath();
  if (kethra) ctx.arc(0, 0, h - 3, 0, Math.PI * 2); else ctx.rect(-h + 3, -h + 3, s - 6, s - 6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = col; ctx.fillRect(-h + 5, h - 9, s - 10, 4);   // team stripe
  const live = b.built >= 1 && (b.type === 'generator' ? b.powering > 0 : b.powered);
  if (b.type === 'generator') {
    ctx.fillStyle = plate; ctx.beginPath(); ctx.arc(0, -2, h * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.rotate(live ? time * 3 : 0);
    ctx.strokeStyle = live ? glow : '#555'; ctx.lineWidth = 3;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, -2, h * 0.45, k * 2.09, k * 2.09 + 1.3); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = live ? glow : '#444'; ctx.globalAlpha *= live ? 0.75 + 0.25 * Math.sin(time * 6) : 1;
    ctx.beginPath(); ctx.arc(0, -2, h * 0.2, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.rotate(b.facing || 0);
    ctx.fillStyle = plate; ctx.fillRect(-h * 0.5, -h * 0.45, h * 0.9, h * 0.9); ctx.strokeRect(-h * 0.5, -h * 0.45, h * 0.9, h * 0.9);
    ctx.strokeStyle = live ? glow : '#666'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(h * 0.2, -h * 0.55); ctx.lineTo(h * 0.75, -h * 0.55); ctx.moveTo(h * 0.2, h * 0.55); ctx.lineTo(h * 0.75, h * 0.55);
    ctx.moveTo(h * 0.2, -h * 0.55); ctx.lineTo(h * 0.2, h * 0.55); ctx.stroke();
    ctx.fillStyle = live ? glow : '#444'; ctx.beginPath(); ctx.arc(h * 0.45, 0, h * 0.16, 0, Math.PI * 2); ctx.fill();
    // Rebooting: a ring that fills as it comes back.
    const f = b.field;
    if (b.built >= 1 && b.powered && f && f.state === 'down') {
      ctx.rotate(-(b.facing || 0)); ctx.strokeStyle = '#ffd25a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, h + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - f.t / b.def.field.reboot)); ctx.stroke();
    }
  }
  ctx.restore();
  if (b.built < 1) {
    ctx.strokeStyle = TEAMS[b.team].color; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.strokeRect(b.x - h + 2, b.y - h + 2, s - 4, s - 4); ctx.setLineDash([]);
  } else {
    if (b.hp < b.maxHp * 0.5) artFor(b.faction).drawDamage(ctx, artId(b.faction, b.type), b.x, b.y, time);
    if (b.hitFlash > 0) flashOver(ctx, b.x, b.y, s * 0.45);
  }
}

// A forcefield's colour by its health: blue, then orange, then red.
const fieldColor = k => (k > 0.6 ? '90,184,255' : k > 0.3 ? '255,160,64' : '255,74,58');

// A Shield Projector's wall of force (fieldGeometry in sim.js), bowed a
// little outward, shimmering, flaring where it was just hit.
function drawField(ctx, b, time) {
  const F = b.def.field, g = fieldGeometry(b), f = b.field;
  if (!f || !b.powered || b.built < 1) return;
  if (f.state !== 'up') {
    // Down: a faint dashed outline of where it will come back.
    ctx.save(); ctx.strokeStyle = 'rgba(255,210,90,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([5, 9]);
    ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.lineTo(g.bx, g.by); ctx.stroke(); ctx.restore();
    return;
  }
  const k = f.hp / F.hp, rgb = fieldColor(k), hit = Math.max(0, 1 - (time - f.lastHit) * 3);
  const qx = g.cx + g.dx * 14, qy = g.cy + g.dy * 14;   // bowed outward
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(${rgb},${0.16 + 0.2 * hit})`; ctx.lineWidth = 16;
  ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.quadraticCurveTo(qx, qy, g.bx, g.by); ctx.stroke();
  ctx.strokeStyle = `rgba(${rgb},${0.55 + 0.35 * hit})`; ctx.lineWidth = 3;
  ctx.setLineDash([14, 6]); ctx.lineDashOffset = -time * 40;
  ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.quadraticCurveTo(qx, qy, g.bx, g.by); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = `rgba(${rgb},0.8)`;
  for (const [x, y] of [[g.ax, g.ay], [g.bx, g.by]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawHealthBar(ctx, e, selected) {
  const w = e.kind === 'building' ? e.size * CONFIG.TILE * 0.8 : 28;
  const y = e.y - (e.kind === 'building' ? e.size * CONFIG.TILE / 2 + 10 : e.radius + 10);
  const k = Math.max(0, e.hp / e.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 6);
  ctx.fillStyle = k > 0.6 ? '#6ee06e' : k > 0.3 ? '#f0c040' : '#ff5a4a';
  ctx.fillRect(e.x - w / 2, y, w * k, 4);
  if (e.kind === 'building' && e.built < 1) {
    ctx.fillStyle = '#f0c040'; ctx.fillRect(e.x - w / 2, y + 6, w * e.built, 3);
  }
  if (e.kind === 'unit' && e.def.shield) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(e.x - w / 2 - 1, y - 5, w + 2, 4);
    ctx.fillStyle = '#8cd2ff'; ctx.fillRect(e.x - w / 2, y - 4, w * e.shield / e.def.shield, 2);
  }
  if (e.kind === 'building' && e.def.store && e.built >= 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(e.x - w / 2 - 1, y + 5, w + 2, 5);
    ctx.fillStyle = '#e8cf82'; ctx.fillRect(e.x - w / 2, y + 6, w * e.stored / e.def.store, 3);
  }
  // Upgrade and research progress (amber), shown under the health bar.
  const work = e.kind === 'building' && (e.upgrading !== null && e.upgrading !== undefined ? e.upgrading / upgradeOf(e).time
    : e.researching ? e.researching.t / RESEARCH[e.researching.key].time : null);
  if (work !== null && work !== undefined && work !== false) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(e.x - w / 2 - 1, y + 5, w + 2, 5);
    ctx.fillStyle = '#f0a040'; ctx.fillRect(e.x - w / 2, y + 6, w * Math.min(1, work), 3);
  } else if (e.kind === 'building' && e.queue && e.queue.length && e.built >= 1) {
    const def = UNIT_TYPES[e.queue[0]];
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(e.x - w / 2 - 1, y + 5, w + 2, 5);
    ctx.fillStyle = '#8cc8ff'; ctx.fillRect(e.x - w / 2, y + 6, w * e.prodTime / def.buildTime, 3);
  }
}

function drawProjectile(ctx, p) {
  if (p.kind === 'bullet') {
    ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2;
    const a = Math.atan2(p.ty - p.y, p.tx - p.x);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(a) * 10, p.y - Math.sin(a) * 10); ctx.stroke();
  } else if (p.kind === 'shell') {
    ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
  } else if (p.kind === 'missile') {
    // A homing missile: a white body with a bright exhaust and a long trail.
    const a = Math.atan2(p.ty - p.y, p.tx - p.x), c = Math.cos(a), s = Math.sin(a);
    ctx.strokeStyle = 'rgba(220,220,220,0.35)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - c * 26, p.y - s * 26); ctx.stroke();
    ctx.strokeStyle = '#f2f2ea'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x + c * 5, p.y + s * 5); ctx.lineTo(p.x - c * 3, p.y - s * 3); ctx.stroke();
    ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.arc(p.x - c * 4, p.y - s * 4, 2, 0, Math.PI * 2); ctx.fill();
  } else if (p.kind === 'laser') {
    // (the beam is drawn as an effect)
  } else if (p.kind === 'flak') {
    ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
  } else if (p.kind === 'plasma') {
    // A slow, glowing ball of plasma.
    ctx.fillStyle = 'rgba(190,120,255,0.35)'; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e6c8ff'; ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill();
  } else if (p.kind === 'rail') {
    // A railgun slug: a white-hot streak (the beam itself is an effect).
    const a = Math.atan2(p.ty - p.y, p.tx - p.x);
    ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(a) * 26, p.y - Math.sin(a) * 26); ctx.stroke();
  } else if (p.kind === 'flame') {
    // A tongue of fire that swells as it flies.
    const f = 1 - Math.min(1, Math.hypot(p.tx - p.x, p.ty - p.y) / 120);
    ctx.fillStyle = 'rgba(255,120,30,0.55)'; ctx.beginPath(); ctx.arc(p.x, p.y, 5 + f * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,90,0.85)'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5 + f * 3, 0, Math.PI * 2); ctx.fill();
  } else if (p.kind === 'shock') {
    // A crackling blue bolt.
    const a = Math.atan2(p.ty - p.y, p.tx - p.x), c = Math.cos(a), s = Math.sin(a);
    ctx.strokeStyle = '#8fe4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y);
    for (let i = 1; i <= 4; i++) { const j = (i % 2 ? 1 : -1) * 3; ctx.lineTo(p.x - c * i * 4 - s * j, p.y - s * i * 4 + c * j); }
    ctx.stroke();
  } else if (p.kind === 'rocket') {
    // A small rocket with a smoky trail back toward where it was fired.
    const a = Math.atan2(p.ty - p.y, p.tx - p.x), c = Math.cos(a), s = Math.sin(a);
    ctx.strokeStyle = 'rgba(200,200,200,0.45)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - c * 16, p.y - s * 16); ctx.stroke();
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(p.x + c * 4, p.y + s * 4); ctx.lineTo(p.x - c * 3, p.y - s * 3); ctx.stroke();
  } else {
    // Artillery shells arc through the air: bigger at the top of the arc.
    const done = 1 - Math.hypot(p.tx - p.x, p.ty - p.y) / (p.total || 1);
    const h = Math.sin(done * Math.PI);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb040'; ctx.beginPath(); ctx.arc(p.x, p.y - h * 40, 3 + h * 3, 0, Math.PI * 2); ctx.fill();
  }
}

// An uplink: its capture circle (dashed, in the holder's colour), a ring
// showing how far capture has got, and the mast with a blinking light.
function drawUplink(ctx, u, time) {
  const R = CONFIG.UPLINK_RADIUS, col = u.owner ? TEAMS[u.owner].color : '#c8d0c0';
  ctx.save();
  ctx.fillStyle = u.owner ? col + '18' : 'rgba(200,208,192,0.06)';
  ctx.beginPath(); ctx.arc(u.x, u.y, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = u.contested ? '#ffd25a' : col; ctx.globalAlpha = 0.7; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -time * 12;
  ctx.beginPath(); ctx.arc(u.x, u.y, R, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  if (Math.abs(u.p) > 0.01) {
    ctx.strokeStyle = TEAMS[u.p > 0 ? 1 : 2].color; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(u.x, u.y, 34, -Math.PI / 2, -Math.PI / 2 + Math.abs(u.p) * Math.PI * 2); ctx.stroke();
  }
  // The mast: a plinth, a lattice tower and a dish.
  ctx.fillStyle = '#2a302a'; ctx.strokeStyle = '#0b0d0a'; ctx.lineWidth = 2;
  ctx.fillRect(u.x - 14, u.y - 14, 28, 28); ctx.strokeRect(u.x - 14, u.y - 14, 28, 28);
  ctx.strokeStyle = '#9aa496'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(u.x - 8, u.y + 8); ctx.lineTo(u.x, u.y - 22); ctx.lineTo(u.x + 8, u.y + 8);
  ctx.moveTo(u.x - 5, u.y - 2); ctx.lineTo(u.x + 5, u.y - 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(u.x + 3, u.y - 22, 9, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();
  const on = Math.sin(time * 5) > 0;
  ctx.fillStyle = on ? col : '#333';
  ctx.beginPath(); ctx.arc(u.x, u.y - 24, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawEffect(ctx, fx) {
  const k = fx.t / fx.life;
  switch (fx.kind) {
    case 'droppod': {
      // A call-in on its way: a target marker on the ground and a pod
      // falling out of the sky on a beam of light.
      const land = Math.min(1, fx.t / (fx.life - 0.6)), col = TEAMS[fx.team].color;
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 26 + 6 * Math.sin(fx.t * 8), 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fx.x - 34, fx.y); ctx.lineTo(fx.x - 18, fx.y); ctx.moveTo(fx.x + 18, fx.y); ctx.lineTo(fx.x + 34, fx.y);
      ctx.moveTo(fx.x, fx.y - 34); ctx.lineTo(fx.x, fx.y - 18); ctx.moveTo(fx.x, fx.y + 18); ctx.lineTo(fx.x, fx.y + 34); ctx.stroke();
      if (land < 1) {
        const py = fx.y - 520 * (1 - land) * (1 - land);
        const g = ctx.createLinearGradient(fx.x, py - 300, fx.x, py);
        g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(1, 'rgba(255,240,200,0.45)');
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(fx.x - 7, py - 300, 14, 300);
        ctx.fillStyle = '#c8ccc0'; ctx.strokeStyle = '#1a1c18'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(fx.x, py - 22); ctx.lineTo(fx.x + 11, py - 6); ctx.lineTo(fx.x + 11, py + 10); ctx.lineTo(fx.x - 11, py + 10); ctx.lineTo(fx.x - 11, py - 6); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,170,60,0.9)'; ctx.beginPath(); ctx.arc(fx.x, py + 14, 5 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'dust':
      // A shot that missed, kicking up dirt.
      ctx.fillStyle = `rgba(150,140,120,${0.5 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 3 + 8 * k, 0, Math.PI * 2); ctx.fill();
      break;
    case 'shieldhit':
      ctx.strokeStyle = `rgba(150,220,255,${0.9 * (1 - k)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 4 + 16 * k, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'shielddown': {
      // The wall breaks up into sparks.
      const dx = Math.cos(fx.a), dy = Math.sin(fx.a);
      ctx.fillStyle = `rgba(255,120,80,${1 - k})`;
      for (let i = -5; i <= 5; i++) {
        const along = i / 5 * fx.len / 2, out = 6 + 30 * k * (1 + (i * 7 % 3));
        ctx.fillRect(fx.x - dy * along + dx * out - 2, fx.y + dx * along + dy * out - 2, 4, 4);
      }
      break;
    }
    case 'beam': {
      // A laser: a thin, bright red line. The railgun's: a white-hot line of light.
      if (fx.laser) {
        ctx.strokeStyle = `rgba(255,80,70,${0.95 * (1 - k)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(fx.x, fx.y); ctx.lineTo(fx.x2, fx.y2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,200,190,${0.9 * (1 - k)})`; ctx.lineWidth = 0.8; ctx.stroke();
        break;
      }
      ctx.strokeStyle = `rgba(200,240,255,${0.9 * (1 - k)})`; ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.moveTo(fx.x, fx.y); ctx.lineTo(fx.x2, fx.y2); ctx.stroke();
      ctx.strokeStyle = `${TEAMS[fx.team].color}${Math.round(160 * (1 - k)).toString(16).padStart(2, '0')}`; ctx.lineWidth = 7 * (1 - k);
      ctx.beginPath(); ctx.moveTo(fx.x, fx.y); ctx.lineTo(fx.x2, fx.y2); ctx.stroke();
      break;
    }
    case 'emp': {
      // An electromagnetic ring rolling outwards.
      ctx.strokeStyle = `rgba(150,220,255,${0.9 * (1 - k)})`; ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * (0.3 + 0.7 * k), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(150,220,255,${0.15 * (1 - k)})`; ctx.fill();
      break;
    }
    case 'pulse':
      // A Sensor Pulse sweeping out (only its own side would notice, but it's pretty).
      ctx.strokeStyle = `${TEAMS[fx.team].color}${Math.round(140 * (1 - k)).toString(16).padStart(2, '0')}`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * k, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'burst':
      // Flak: a puff of dark smoke with sparks.
      ctx.fillStyle = `rgba(60,58,54,${0.55 * (1 - k)})`; ctx.beginPath(); ctx.arc(fx.x, fx.y, (fx.r || 20) * (0.4 + 0.6 * k), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,220,120,${1 - k})`; for (let i = 0; i < 5; i++) { const a = i * 1.3; ctx.fillRect(fx.x + Math.cos(a) * 12 * k - 1, fx.y + Math.sin(a) * 12 * k - 1, 2, 2); }
      break;
    case 'burn': {
      // Fire spreading round the hit.
      const r = Math.max(10, fx.r || 20) * (0.5 + k * 0.7);
      ctx.fillStyle = `rgba(255,${150 - k * 100 | 0},40,${0.55 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,230,120,${0.7 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r * 0.45, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'zap':
      ctx.strokeStyle = `rgba(140,228,255,${1 - k})`; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) { const a = i * 1.6 + k * 3; ctx.beginPath(); ctx.moveTo(fx.x, fx.y); ctx.lineTo(fx.x + Math.cos(a) * (6 + 12 * k), fx.y + Math.sin(a) * (6 + 12 * k)); ctx.stroke(); }
      break;
    case 'flash':
      if (fx.fx === 'flame') { ctx.fillStyle = `rgba(255,140,40,${0.8 * (1 - k)})`; ctx.beginPath(); ctx.arc(fx.x, fx.y, 6, 0, Math.PI * 2); ctx.fill(); break; }
      if (fx.fx === 'shock') { ctx.fillStyle = `rgba(140,228,255,${1 - k})`; ctx.beginPath(); ctx.arc(fx.x, fx.y, 5, 0, Math.PI * 2); ctx.fill(); break; }
      ctx.fillStyle = `rgba(255,230,150,${1 - k})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.big ? 7 : 4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'spark':
      ctx.fillStyle = `rgba(255,200,100,${1 - k})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, (fx.big ? 10 : 4) * (0.5 + k), 0, Math.PI * 2); ctx.fill();
      break;
    case 'boom': {
      if (!fx.scorched) { fx.scorched = true; scorch(fx.x, fx.y, fx.size * 0.9); }
      const r = fx.size * (0.4 + k * 0.8);
      ctx.fillStyle = `rgba(255,${160 - k * 120 | 0},60,${0.85 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(60,55,50,${0.5 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(fx.x + 4, fx.y - k * 20, r * 0.8, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'explode':
      // Death explosion from the unit sheet, sized to what blew up.
      if (!fx.scorched) { fx.scorched = true; scorch(fx.x, fx.y, fx.size * 0.9); }
      artFor(fx.faction).drawExplosion(ctx, artId(fx.faction, fx.type), fx.x, fx.y, k, teamName(fx.team));
      break;
    case 'recycle': {
      // The vehicle is taken apart: a ring closes in and scrap glints rise.
      const r = fx.r * 1.6 * (1 - k * 0.8);
      ctx.strokeStyle = `rgba(140,255,160,${0.9 * (1 - k)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(232,207,130,${1 - k})`;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + k * 2;
        ctx.fillRect(fx.x + Math.cos(a) * fx.r * 0.7 - 1.5, fx.y + Math.sin(a) * fx.r * 0.7 - k * 18 - 1.5, 3, 3);
      }
      break;
    }
    case 'dust':
      ctx.fillStyle = `rgba(200,180,120,${0.6 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y - k * 8, 3 + k * 3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'ping': {
      // Radar sweep: a ring racing outward to the edge of the ping.
      const r = fx.r * Math.min(1, k * 1.6);
      ctx.strokeStyle = `rgba(140,255,160,${0.7 * (1 - k)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(140,255,160,${0.06 * (1 - k)})`; ctx.fill();
      break;
    }
    case 'heal':
      // A green plus drifting up off a vehicle being repaired.
      ctx.fillStyle = `rgba(120,240,120,${1 - k})`;
      ctx.fillRect(fx.x - 1.5, fx.y - 12 - k * 16 - 5, 3, 10); ctx.fillRect(fx.x - 5, fx.y - 12 - k * 16 - 1.5, 10, 3);
      break;
    case 'weld':
      ctx.fillStyle = `rgba(180,230,255,${1 - k})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 2.5, 0, Math.PI * 2); ctx.fill();
      break;
  }
}

// -----------------------------------------------------------------------------
// Minimap
// -----------------------------------------------------------------------------

let minimapBase = null;
function drawMinimap(ctx, game, view) {
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const { W, H } = game.map, T = CONFIG.TILE;
  const sx = cw / (W * T), sy = ch / (H * T);
  if (!minimapBase) {
    minimapBase = document.createElement('canvas');
    minimapBase.width = cw; minimapBase.height = ch;
    const mg = minimapBase.getContext('2d');
    mg.imageSmoothingEnabled = true; mg.drawImage(Render.flat, 0, 0, cw, ch);
  }
  ctx.drawImage(minimapBase, 0, 0);
  if (!view.revealAll) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(Render.fog, 0, 0, cw, ch);
  }
  for (const g of game.geysers) {
    if (!view.revealAll && !game.teams[view.team].explored[Math.floor(g.y / T) * W + Math.floor(g.x / T)]) continue;
    ctx.strokeStyle = '#e8cf82'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(g.x * sx, g.y * sy, 3, 0, Math.PI * 2); ctx.stroke();
  }
  for (const e of game.entities) {
    if (e.team !== view.team && !view.revealAll) {
      if (e.kind === 'unit' && !isVisibleTo(game, view.team, e)) continue;
      if (e.kind === 'building' && !e.seen[view.team] && !isVisibleTo(game, view.team, e)) continue;
    }
    ctx.fillStyle = e.cmdId ? '#5ee06a' : TEAMS[e.team].color;   // green: under a commander
    if (e.kind === 'building') { const s = e.size * T * sx; ctx.fillRect(e.x * sx - s / 2, e.y * sy - s / 2, s, s); }
    else ctx.fillRect(e.x * sx - 1.5, e.y * sy - 1.5, 3, 3);
  }
  if (game.uplinks) for (const u of game.uplinks) {
    ctx.fillStyle = u.owner ? TEAMS[u.owner].color : '#c8d0c0'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(u.x * sx, u.y * sy - 5); ctx.lineTo(u.x * sx + 5, u.y * sy); ctx.lineTo(u.x * sx, u.y * sy + 5); ctx.lineTo(u.x * sx - 5, u.y * sy); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  for (const ev of view.alerts) {
    const k = (performance.now() - ev.at) / 2000;
    if (k > 1) continue;
    ctx.strokeStyle = `rgba(255,90,74,${1 - k})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ev.x * sx, ev.y * sy, 4 + k * 14, 0, Math.PI * 2); ctx.stroke();
  }
  const cam = view.cam, vw = view.screenW / cam.zoom, vh = view.screenH / cam.zoom;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
  ctx.strokeRect(cam.x * sx + 0.5, cam.y * sy + 0.5, vw * sx, vh * sy);
}
