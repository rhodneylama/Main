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

  // Wrecks (burnt-out vehicles in their own shape) and craters where buildings stood
  for (const fx of game.effects) if ((fx.kind === 'wreck' || fx.kind === 'crater') && onScreen(fx.x, fx.y)) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (fx.life - fx.t) / 3);
    if (fx.kind === 'crater') UnitSprites.drawCrater(ctx, spriteId(fx.type), fx.x, fx.y);
    else if (fx.t > 0.36) {
      // Appears once the explosion has cleared, then smoulders for a while.
      UnitSprites.drawSprite(ctx, spriteId(fx.type), { x: fx.x, y: fx.y, heading: fx.a, team: teamName(fx.team), mk: fx.mk, wreck: true });
      if (fx.t < 8) UnitSprites.drawDamage(ctx, spriteId(fx.type), fx.x, fx.y, game.time);
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
    if (fx.kind === 'wreck' || fx.kind === 'crater' || !onScreen(fx.x, fx.y) || !visAt(fx.x, fx.y)) continue;
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
    const busy = e.kind === 'building' && e.team === team && (e.upgrading !== null || e.researching);
    if (sel || e.hp < e.maxHp || (e.kind === 'building' && e.built < 1) || showStore || hurtShield || busy) drawHealthBar(ctx, e, sel);
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

// Which design from the unit sheet (js/sprites.js) each game type uses.
// No prototype, so a type like "constructor" isn't mistaken for a built-in.
const SPRITE_ID = Object.assign(Object.create(null), { mobileRecycler: 'recyclerV', repairpad: 'repair', basesilo: 'silo', outsilo: 'exsilo' });
const spriteId = type => SPRITE_ID[type] || type;
const teamName = t => (t === 1 ? 'blue' : 'red');
// Seconds since a gun last fired, while its recoil and muzzle flash still show.
const sinceShot = (e, now) => (e.lastShot !== undefined && now - e.lastShot < 0.5 ? now - e.lastShot : null);

// A brief white flash over something that has just been hit.
function flashOver(ctx, x, y, r) {
  ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

function drawBuilding(ctx, b, selected, ghost, time) {
  const T = CONFIG.TILE, s = b.size * T, id = spriteId(b.type), team = teamName(b.team);
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.5;
  if (b.built < 1) {
    // Construction site: the design fades in as it is built, inside a dashed outline.
    ctx.globalAlpha *= 0.2 + 0.55 * b.built;
    UnitSprites.drawSprite(ctx, id, { x: b.x, y: b.y, team, turret: b.turret });
    ctx.globalAlpha = ghost ? 0.5 : 1;
    ctx.strokeStyle = TEAMS[b.team].color; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.strokeRect(b.x - s / 2 + 2, b.y - s / 2 + 2, s - 4, s - 4); ctx.setLineDash([]);
    ctx.restore();
    if (selected) drawSelection(ctx, b);
    return;
  }
  // The lab's dome only pulses while it is researching.
  const t = b.type === 'lab' && !b.researching ? 0 : time;
  UnitSprites.drawSprite(ctx, id, { x: b.x, y: b.y, team, mk: b.level > 1, t, turret: b.turret, fire: sinceShot(b, time) });
  if (b.hp < b.maxHp * 0.5) UnitSprites.drawDamage(ctx, id, b.x, b.y, time);
  if (b.hitFlash > 0) flashOver(ctx, b.x, b.y, s * 0.45);
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
  const r = u.radius, id = spriteId(baseType(u));
  if (selected) drawSelection(ctx, u);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(u.x + 3, u.y + 5, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  UnitSprites.drawSprite(ctx, id, {
    x: u.x, y: u.y, heading: u.angle, turret: wrapAngle(u.turret - u.angle), team: teamName(u.team),
    mk: !!u.def.base, t: time, legE: u.legE || 0, fire: sinceShot(u, time),
    shield: !!u.def.shield && u.shield > 1, shieldHit: u.shieldFlash > 0,
  });
  if (u.hp < u.maxHp * 0.5) UnitSprites.drawDamage(ctx, id, u.x, u.y, time);
  if (u.hitFlash > 0) flashOver(ctx, u.x, u.y, r);
  if (u.repairing > 0) {
    ctx.strokeStyle = `rgba(110,224,110,${0.5 + 0.4 * Math.sin(time * 10)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(u.x, u.y, r + 4, 0, Math.PI * 2); ctx.stroke();
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
  // Upgrade and research progress (amber), shown under the health bar.
  const work = e.kind === 'building' && (e.upgrading !== null && e.upgrading !== undefined ? e.upgrading / e.def.upgrade.time
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
    case 'explode':
      // Death explosion from the unit sheet, sized to what blew up.
      if (!fx.scorched) { fx.scorched = true; scorch(fx.x, fx.y, fx.size * 0.9); }
      UnitSprites.drawExplosion(ctx, spriteId(fx.type), fx.x, fx.y, k, teamName(fx.team));
      break;
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
