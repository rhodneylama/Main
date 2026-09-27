// =============================================================================
// render.js — DRAWS EVERYTHING YOU SEE
//
// Nothing in here changes the game; it only paints the current state onto
// the screen. All the vehicles are drawn with simple shapes, so there are no
// image files to manage. Colours come from TEAMS in config.js.
// =============================================================================

const Render = {
  terrain: null,   // the map painted once, reused every frame
  fog: null,       // a tiny image of the fog, stretched over the map
  fogData: null,
};

function buildTerrain(game) {
  const { W, H, tiles } = game.map, T = CONFIG.TILE;
  const c = document.createElement('canvas');
  c.width = W * T; c.height = H * T;
  const g = c.getContext('2d');
  const rng = makeRng(game.seed + 99);
  const colors = {
    [TILE_GRASS]: [[58, 74, 44], [62, 79, 46], [55, 70, 42]],
    [TILE_DIRT]:  [[92, 80, 58], [86, 75, 54], [97, 85, 62]],
    [TILE_ROCK]:  [[74, 72, 70], [68, 66, 64], [80, 78, 75]],
    [TILE_WATER]: [[34, 58, 78], [32, 55, 74], [36, 61, 82]],
  };
  const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = tiles[y * W + x], pal = colors[t];
    g.fillStyle = rgb(pal[Math.floor(rng() * pal.length)]);
    g.fillRect(x * T, y * T, T, T);
  }
  // Soft speckles so the ground doesn't look like a chessboard.
  for (let i = 0; i < W * H * 3; i++) {
    const x = rng() * W * T, y = rng() * H * T;
    const t = tiles[Math.floor(y / T) * W + Math.floor(x / T)];
    const pal = colors[t][Math.floor(rng() * 3)];
    const k = rng() < 0.5 ? 0.85 : 1.15;
    g.fillStyle = `rgba(${pal[0] * k | 0},${pal[1] * k | 0},${pal[2] * k | 0},0.7)`;
    const r = 2 + rng() * 7;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // Raised rock with a lit top edge and a shadow below.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = tiles[y * W + x];
    if (t === TILE_ROCK) {
      const below = y + 1 < H ? tiles[(y + 1) * W + x] : TILE_ROCK;
      const above = y > 0 ? tiles[(y - 1) * W + x] : TILE_ROCK;
      if (below !== TILE_ROCK) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x * T, (y + 1) * T, T, 8); }
      if (above !== TILE_ROCK) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x * T, y * T, T, 4); }
      for (let k = 0; k < 3; k++) {
        g.fillStyle = `rgba(${rng() < 0.5 ? '40,40,40' : '120,118,112'},0.35)`;
        g.beginPath(); g.arc(x * T + rng() * T, y * T + rng() * T, 3 + rng() * 6, 0, Math.PI * 2); g.fill();
      }
    } else if (t === TILE_WATER) {
      const above = y > 0 ? tiles[(y - 1) * W + x] : TILE_WATER;
      if (above !== TILE_WATER) { g.fillStyle = 'rgba(160,190,200,0.25)'; g.fillRect(x * T, y * T, T, 3); }
      g.strokeStyle = 'rgba(150,190,220,0.15)'; g.lineWidth = 1.5;
      g.beginPath(); const wy = y * T + 8 + rng() * 16, wx = x * T + rng() * 10;
      g.moveTo(wx, wy); g.quadraticCurveTo(wx + 6, wy - 3, wx + 12, wy); g.stroke();
    }
  }
  // Tactical grid, like a military map.
  g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
  for (let x = 0; x <= W; x += 4) { g.beginPath(); g.moveTo(x * T, 0); g.lineTo(x * T, H * T); g.stroke(); }
  for (let y = 0; y <= H; y += 4) { g.beginPath(); g.moveTo(0, y * T); g.lineTo(W * T, y * T); g.stroke(); }
  Render.terrain = c;

  const f = document.createElement('canvas');
  f.width = W; f.height = H;
  Render.fog = f;
  Render.fogData = f.getContext('2d').createImageData(W, H);
}

// Scorch marks are painted straight onto the terrain so they stay forever.
function scorch(x, y, r) {
  const g = Render.terrain.getContext('2d');
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, 'rgba(20,16,12,0.45)'); grad.addColorStop(1, 'rgba(20,16,12,0)');
  g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
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

  ctx.drawImage(Render.terrain, 0, 0);

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

  // Wrecks
  for (const fx of game.effects) if (fx.kind === 'wreck' && onScreen(fx.x, fx.y)) {
    ctx.save(); ctx.translate(fx.x, fx.y); ctx.rotate(fx.a);
    ctx.globalAlpha = Math.min(1, (fx.life - fx.t) / 3) * 0.8;
    ctx.fillStyle = '#2a2622'; ctx.fillRect(-fx.r, -fx.r * 0.7, fx.r * 2, fx.r * 1.4);
    ctx.fillStyle = '#16130f'; ctx.beginPath(); ctx.arc(0, 0, fx.r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Rally points for selected buildings
  for (const e of view.selected) if (e.kind === 'building' && e.rally) {
    ctx.strokeStyle = 'rgba(140,255,160,0.5)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.rally.x, e.rally.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#8cffa0'; ctx.beginPath(); ctx.arc(e.rally.x, e.rally.y, 4, 0, Math.PI * 2); ctx.fill();
  }

  const selectedIds = new Set(view.selected.map(e => e.id));
  const buildings = game.entities.filter(e => e.kind === 'building');
  const units = game.entities.filter(e => e.kind === 'unit');
  for (const b of buildings) {
    if (!onScreen(b.x, b.y, 120)) continue;
    const seen = view.revealAll || b.team === team || isVisibleTo(game, team, b);
    if (!seen && !b.seen[team]) continue;
    drawBuilding(ctx, b, selectedIds.has(b.id), !seen);
  }

  // Move-order lines for selected units
  for (const u of view.selected) if (u.kind === 'unit' && u.path.length && u.team === team) {
    ctx.strokeStyle = 'rgba(140,255,160,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(u.x, u.y);
    for (const p of u.path) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  for (const u of units) {
    if (!onScreen(u.x, u.y)) continue;
    if (u.team !== team && !visAt(u.x, u.y)) continue;
    drawUnit(ctx, u, selectedIds.has(u.id), game.time);
  }

  for (const p of game.projectiles) {
    if (!onScreen(p.x, p.y) || !visAt(p.x, p.y)) continue;
    drawProjectile(ctx, p);
  }

  for (const fx of game.effects) {
    if (fx.kind === 'wreck' || !onScreen(fx.x, fx.y) || !visAt(fx.x, fx.y)) continue;
    drawEffect(ctx, fx);
  }

  if (!view.revealAll) drawFog(ctx, game, tm);

  // Health bars on top of the fog so they're always readable.
  for (const e of game.entities) {
    if (!onScreen(e.x, e.y)) continue;
    if (e.team !== team && !view.revealAll && !isVisibleTo(game, team, e)) continue;
    const sel = selectedIds.has(e.id);
    const showStore = e.team === team && e.kind === 'building' && e.def.store && e.stored > 0.5;
    const hurtShield = e.kind === 'unit' && e.def.shield && e.shield < e.def.shield - 0.5;
    if (sel || e.hp < e.maxHp || (e.kind === 'building' && e.built < 1) || showStore || hurtShield) drawHealthBar(ctx, e, sel);
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
    // Silos have their own rule: right next to the Recycler, or an Extractor.
    ctx.fillStyle = 'rgba(232,207,130,0.10)'; ctx.strokeStyle = 'rgba(232,207,130,0.6)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 2;
    for (const e of game.entities) if (e.team === team && e.type === def.placeNear && e.built >= 1) {
      ctx.beginPath(); ctx.arc(e.x, e.y, (def.placeRange + e.size / 2) * T, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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
  const { tx, ty } = placementTile(view.placeAt || view.mouseWorld, def.size);
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

function drawBuilding(ctx, b, selected, ghost) {
  const T = CONFIG.TILE, s = b.size * T, tc = TEAMS[b.team];
  ctx.save(); ctx.translate(b.x, b.y);
  if (ghost) ctx.globalAlpha = 0.5;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-s / 2 + 5, -s / 2 + 7, s, s);
  if (b.built < 1) {
    // Construction site
    ctx.strokeStyle = tc.color; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.strokeRect(-s / 2 + 2, -s / 2 + 2, s - 4, s - 4); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(40,40,40,0.8)';
    const h = (s - 8) * b.built;
    ctx.fillRect(-s / 2 + 4, s / 2 - 4 - h, s - 8, h);
    ctx.strokeStyle = 'rgba(255,210,80,0.6)'; ctx.lineWidth = 1;
    for (let i = -s; i < s; i += 12) { ctx.beginPath(); ctx.moveTo(i, -s / 2 + 4); ctx.lineTo(i + s / 2, s / 2 - 4); ctx.stroke(); }
    ctx.restore();
    if (selected) drawSelection(ctx, b);
    return;
  }
  const base = b.hitFlash > 0 ? '#ffffff' : '#3b3f3a';
  ctx.fillStyle = base; ctx.fillRect(-s / 2 + 2, -s / 2 + 2, s - 4, s - 4);
  ctx.fillStyle = tc.dark; ctx.fillRect(-s / 2 + 6, -s / 2 + 6, s - 12, s - 12);
  ctx.strokeStyle = tc.color; ctx.lineWidth = 2; ctx.strokeRect(-s / 2 + 2, -s / 2 + 2, s - 4, s - 4);

  switch (b.type) {
    case 'recycler': {
      ctx.fillStyle = '#2b2e2a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = tc.color; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3 + (b.queue.length ? performance.now() / 600 : 0);
        ctx.beginPath(); ctx.arc(0, 0, s * 0.2, a, a + 1.5); ctx.stroke();
      }
      ctx.fillStyle = tc.light; ctx.fillRect(-s / 2 + 8, -s / 2 + 8, 10, 10);
      break;
    }
    case 'factory': {
      ctx.fillStyle = '#2b2e2a'; ctx.fillRect(-s * 0.32, -s * 0.2, s * 0.64, s * 0.5);
      ctx.fillStyle = tc.color;
      for (let i = 0; i < 4; i++) ctx.fillRect(-s * 0.3 + i * s * 0.16, -s * 0.36, s * 0.1, s * 0.12);
      ctx.fillStyle = '#555'; ctx.fillRect(s * 0.18, -s * 0.44, s * 0.12, s * 0.2);
      break;
    }
    case 'extractor': {
      // A pump over the geyser: a turning drill head and scrap-coloured glow.
      const spin = performance.now() / 500;
      ctx.fillStyle = 'rgba(232,190,90,0.35)'; ctx.beginPath(); ctx.arc(0, 0, s * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b2e2a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e8cf82'; ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        const a = spin + k * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * s * 0.22, Math.sin(a) * s * 0.22); ctx.stroke();
      }
      ctx.fillStyle = tc.color; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'basesilo':
    case 'outsilo': {
      // A round tank; the gold fill shows how much it holds.
      const big = b.type === 'basesilo';
      ctx.fillStyle = '#4a4636'; ctx.beginPath(); ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2); ctx.fill();
      const k = big ? 1 : b.stored / b.def.store;
      if (k > 0.01) { ctx.fillStyle = 'rgba(232,207,130,0.85)'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3 * Math.sqrt(k), 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = tc.color; ctx.lineWidth = big ? 4 : 2; ctx.beginPath(); ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2); ctx.stroke();
      if (big) { ctx.fillStyle = tc.light; ctx.fillRect(-4, -s * 0.46, 8, 8); }
      break;
    }
    case 'tower': {
      ctx.fillStyle = '#2b2e2a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(b.turret);
      ctx.fillStyle = '#1d1f1c'; ctx.fillRect(0, -3.5, s * 0.55, 7);
      ctx.fillStyle = tc.color; ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
  ctx.restore();
  if (selected) drawSelection(ctx, b);
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
  const tc = TEAMS[u.team], r = u.radius;
  if (selected) drawSelection(ctx, u);
  ctx.save(); ctx.translate(u.x, u.y);
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(3, 5, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(u.angle);
  const hull = u.hitFlash > 0 ? '#ffffff' : tc.color;
  const dark = '#1d201c';
  switch (u.type) {
    case 'scout': {
      // Hover-craft: a sleek arrowhead with a glow underneath
      ctx.fillStyle = 'rgba(160,220,255,0.25)'; ctx.beginPath(); ctx.arc(-2, 0, r + 1 + Math.sin(time * 12 + u.id) * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hull; ctx.beginPath(); ctx.moveTo(r + 3, 0); ctx.lineTo(-r, -r * 0.85); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r, r * 0.85); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(r * 0.5, 0); ctx.lineTo(-r * 0.3, -r * 0.3); ctx.lineTo(-r * 0.3, r * 0.3); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(u.turret);
      ctx.fillStyle = '#ddd'; ctx.fillRect(2, -1, r, 2);
      break;
    }
    case 'tank': {
      ctx.fillStyle = dark; ctx.fillRect(-r, -r * 0.85, r * 2, r * 0.45); ctx.fillRect(-r, r * 0.4, r * 2, r * 0.45);
      ctx.fillStyle = hull; ctx.fillRect(-r * 0.85, -r * 0.55, r * 1.7, r * 1.1);
      ctx.restore();
      ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(u.turret);
      ctx.fillStyle = dark; ctx.fillRect(0, -2.5, r * 1.5, 5);
      ctx.fillStyle = tc.dark; ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = tc.light; ctx.lineWidth = 1; ctx.stroke();
      break;
    }
    case 'artillery': {
      ctx.fillStyle = dark; ctx.fillRect(-r, -r * 0.8, r * 1.8, r * 0.4); ctx.fillRect(-r, r * 0.4, r * 1.8, r * 0.4);
      ctx.fillStyle = hull; ctx.fillRect(-r * 0.9, -r * 0.5, r * 1.6, r);
      ctx.restore();
      ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(u.turret);
      ctx.fillStyle = dark; ctx.fillRect(-4, -3, r * 2.4, 6);
      ctx.fillStyle = tc.dark; ctx.fillRect(-r * 0.5, -r * 0.4, r * 0.9, r * 0.8);
      break;
    }
    case 'scavenger': {
      ctx.fillStyle = dark; ctx.fillRect(-r, -r * 0.8, r * 1.8, r * 1.6);
      ctx.fillStyle = hull; ctx.fillRect(-r * 0.8, -r * 0.65, r * 1.2, r * 1.3);
      ctx.fillStyle = '#9a9a8a'; ctx.fillRect(r * 0.5, -r * 0.8, r * 0.6, r * 1.6);  // scoop
      if (u.carry > 0) { ctx.fillStyle = '#b8a36a'; ctx.fillRect(-r * 0.6, -r * 0.45, r * 0.9 * u.carry / u.def.carryMax, r * 0.9); }
      break;
    }
    case 'transport': {
      ctx.fillStyle = dark; ctx.fillRect(-r, -r * 0.7, r * 2, r * 1.4);
      ctx.fillStyle = hull; ctx.fillRect(-r * 0.2, -r * 0.6, r * 1.1, r * 1.2);
      ctx.fillStyle = '#6b6450'; ctx.fillRect(-r * 0.95, -r * 0.6, r * 0.7, r * 1.2);  // cargo bed
      if (u.carry > 0) { ctx.fillStyle = '#e8cf82'; ctx.fillRect(-r * 0.9, -r * 0.5, r * 0.6, r * 1.0 * u.carry / u.def.carryMax); }
      break;
    }
    case 'constructor': {
      ctx.fillStyle = dark; ctx.fillRect(-r, -r * 0.8, r * 2, r * 1.6);
      ctx.fillStyle = hull; ctx.fillRect(-r * 0.8, -r * 0.65, r * 1.6, r * 1.3);
      ctx.fillStyle = '#f0c040'; ctx.fillRect(-r * 0.2, -2, r * 1.5, 4);  // crane arm
      ctx.fillStyle = '#f0c040'; ctx.beginPath(); ctx.arc(-r * 0.2, 0, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
  ctx.restore();
  // Shield bubble: brighter when it has just absorbed a hit.
  if (u.def.shield && u.shield > 1) {
    const k = u.shield / u.def.shield;
    ctx.strokeStyle = `rgba(140,210,255,${(u.shieldFlash > 0 ? 0.9 : 0.35) * (0.4 + 0.6 * k)})`;
    ctx.lineWidth = u.shieldFlash > 0 ? 3 : 1.5;
    ctx.beginPath(); ctx.arc(u.x, u.y, r + 6, 0, Math.PI * 2); ctx.stroke();
  }
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
  if (e.kind === 'building' && e.queue && e.queue.length && e.built >= 1) {
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
  } else {
    // Artillery shells arc through the air: bigger at the top of the arc.
    const done = 1 - Math.hypot(p.tx - p.x, p.ty - p.y) / (p.total || 1);
    const h = Math.sin(done * Math.PI);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb040'; ctx.beginPath(); ctx.arc(p.x, p.y - h * 40, 3 + h * 3, 0, Math.PI * 2); ctx.fill();
  }
}

function drawEffect(ctx, fx) {
  const k = fx.t / fx.life;
  switch (fx.kind) {
    case 'flash':
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
    case 'dust':
      ctx.fillStyle = `rgba(200,180,120,${0.6 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y - k * 8, 3 + k * 3, 0, Math.PI * 2); ctx.fill();
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
    minimapBase.getContext('2d').drawImage(Render.terrain, 0, 0, cw, ch);
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
    ctx.fillStyle = TEAMS[e.team].color;
    if (e.kind === 'building') { const s = e.size * T * sx; ctx.fillRect(e.x * sx - s / 2, e.y * sy - s / 2, s, s); }
    else ctx.fillRect(e.x * sx - 1.5, e.y * sy - 1.5, 3, 3);
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
