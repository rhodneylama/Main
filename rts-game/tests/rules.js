// =============================================================================
// tests/rules.js — RULES TESTS
//
// Runs the game's rules without any graphics and checks they behave as
// designed. Run it from the project folder with:
//
//     node rts-game/tests/rules.js
//
// Each check prints PASS or FAIL. The last line says how many failed.
// =============================================================================

const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'js');
const code = ['config', 'map', 'sim', 'ai'].map(f => fs.readFileSync(path.join(dir, f + '.js'), 'utf8')).join('\n');

// A fresh copy of the game code for each test, so tests can't affect each other.
function load() {
  const ctx = { console, Math, performance: { now: () => Date.now() } };
  vm.createContext(ctx);
  vm.runInContext(code + '\n;Object.assign(globalThis, { CONFIG, UNIT_TYPES, BUILDING_TYPES, RESEARCH, TILE_ROCK, TILE_WATER, ' +
    'createGame, generateMap, stepGame, issueCommand, addUnit, addBuilding, findPath, canPlaceBuilding, scrapCapacity, bankScrap, ' +
    'aiUpdate, dist, isBlockedTile, padUnder, recycleValue, nameOf, FACTIONS, FORMATIONS, nearestOpenTile, formRole });', ctx);
  return ctx;
}

let fails = 0, passes = 0;
function check(name, ok, detail = '') {
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}
function section(name) { console.log(`\n== ${name}`); }

const run = (g, S, seconds) => { for (let i = 0; i < seconds * S.CONFIG.TICK_RATE; i++) S.stepGame(g); };
const mine = (g, team, type) => g.entities.filter(e => e.team === team && e.type === type);

// A game with no computer players, team 1's Recycler deployed on its home geyser.
function deployedGame(S, seed = 42) {
  const g = S.createGame({ seed, difficulty: 'normal', aiTeams: [] });
  for (const t of [1, 2]) {
    const m = mine(g, t, 'mobileRecycler')[0];
    const gy = g.geysers.slice().sort((a, b) => S.dist(a, m) - S.dist(b, m))[0];
    S.issueCommand(g, t, { type: 'deploy', ids: [m.id], geyserId: gy.id });
  }
  run(g, S, 25);
  return g;
}

// The first spot near (x, y) in world pixels where team can place this building.
function spotFor(S, g, team, type, x, y) {
  const T = S.CONFIG.TILE, cx = Math.floor(x / T), cy = Math.floor(y / T);
  for (let r = 0; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (S.canPlaceBuilding(g, team, type, cx + dx, cy + dy).ok) return { tx: cx + dx, ty: cy + dy };
  }
  return null;
}
function placeDone(S, g, team, type, near) {
  const s = spotFor(S, g, team, type, near.x, near.y);
  return s && S.addBuilding(g, type, team, s.tx, s.ty, true);
}

// -----------------------------------------------------------------------------
section('Map');
{
  const S = load();
  const seeds = [1, 2, 3, 42, 777, 1234, 9001, 31337, 55555, 80808];
  let sym = true, edge = true, reach = true, spacing = Infinity, geyserCount = true, half = true, mirrorG = true, mirrorS = true, fields = true;
  for (const seed of seeds) {
    const m = S.generateMap(seed), { W, H, tiles } = m;
    for (let i = 0; i < W * H && sym; i++) if (tiles[i] !== tiles[W * H - 1 - i]) sym = false;
    for (let x = 0; x < W; x++) if (tiles[x] !== S.TILE_ROCK || tiles[(H - 1) * W + x] !== S.TILE_ROCK) edge = false;
    for (let y = 0; y < H; y++) if (tiles[y * W] !== S.TILE_ROCK || tiles[y * W + W - 1] !== S.TILE_ROCK) edge = false;
    const gs = m.geysers;
    if (gs.length !== 12) geyserCount = false;
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++)
      spacing = Math.min(spacing, Math.hypot(gs[i].tx - gs[j].tx, gs[i].ty - gs[j].ty));
    const b1 = m.bases[1], b2 = m.bases[2];
    if (gs.filter(p => Math.hypot(p.tx - b1.x, p.ty - b1.y) < Math.hypot(p.tx - b2.x, p.ty - b2.y)).length !== 6) half = false;
    for (const p of gs) if (!gs.some(q => q.tx === W - p.tx && q.ty === H - p.ty)) mirrorG = false;
    const T = S.CONFIG.TILE;
    for (const p of m.scrap) if (!m.scrap.some(q => Math.abs(q.x - (W * T - p.x)) < 1e-6 && Math.abs(q.y - (H * T - p.y)) < 1e-6)) { mirrorS = false; break; }
    if (m.fields.length < 20 || m.fields.length > 24) fields = false;
    for (const f of m.fields) if (!m.fields.some(q => q.x === W - 1 - f.x && q.y === H - 1 - f.y)) fields = false;
    // Drive-ability: flood fill from base 1 reaches the enemy base, every geyser and every pile.
    const open = i => tiles[i] !== S.TILE_ROCK && tiles[i] !== S.TILE_WATER;
    const seen = new Uint8Array(W * H), stack = [b1.y * W + b1.x]; seen[stack[0]] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i / W) | 0;
      for (const j of [i + 1, i - 1, i + W, i - W]) if (j >= 0 && j < W * H && !seen[j] && open(j) && Math.abs((j % W) - x) <= 1) { seen[j] = 1; stack.push(j); }
    }
    if (!seen[b2.y * W + b2.x]) reach = false;
    for (const p of gs) if (!seen[p.ty * W + p.tx] && !seen[(p.ty - 1) * W + p.tx - 1]) reach = false;
    for (const p of m.scrap) { const i = Math.floor(p.y / T) * W + Math.floor(p.x / T); if (open(i) && !seen[i]) reach = false; }
  }
  const m = S.generateMap(42);
  check('map is 182 x 137 squares', m.W === 182 && m.H === 137, `${m.W} x ${m.H}`);
  check('bases sit in opposite corners', m.bases[1].x <= 12 && m.bases[1].y >= m.H - 12 && m.bases[2].x >= m.W - 12 && m.bases[2].y <= 11);
  check('terrain is point-symmetric (10 seeds)', sym);
  check('map edge is rock (10 seeds)', edge);
  check('12 geysers (10 seeds)', geyserCount);
  check('geysers at least 20 squares apart', spacing >= 20, `closest pair ${spacing.toFixed(1)}`);
  check('6 geysers on each half', half);
  check('geysers mirrored exactly', mirrorG);
  check('scrap piles mirrored exactly', mirrorS);
  check('20 to 24 scrap fields, mirrored', fields, `${S.generateMap(42).fields.length} fields`);
  check('bases, geysers and scrap all reachable (10 seeds)', reach);
}

section('Route-finding at full size');
{
  const S = load();
  const g = S.createGame({ seed: 42, aiTeams: [] });
  const u = mine(g, 1, 'tank')[0], foe = mine(g, 2, 'mobileRecycler')[0];
  const t0 = Date.now(); let p;
  for (let i = 0; i < 20; i++) p = S.findPath(g, u.x, u.y, foe.x, foe.y);
  const ms = (Date.now() - t0) / 20;
  const end = p[p.length - 1];
  check('a route exists from one base to the other', p.length > 0 && Math.hypot(end.x - foe.x, end.y - foe.y) < 80);
  check('a cross-map route takes under 15 ms', ms < 15, `${ms.toFixed(1)} ms`);
}

section('Recycler and economy');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  check('the mobile Recycler deploys into a Recycler', !!rec && rec.built >= 1);
  check('the Recycler holds 300 scrap', S.scrapCapacity(g, 1) === 300);
  g.teams[1].scrap = 290; S.bankScrap(g, 1, 50, true);
  check('storage is capped', g.teams[1].scrap === 300);
  placeDone(S, g, 1, 'basesilo', rec);
  check('a Base Silo adds 300 storage', S.scrapCapacity(g, 1) === 600);
  // Take the Scavengers away so only the Recycler's own pump counts.
  for (const u of g.entities) if (u.team === 1 && u.def.role === 'harvester') u.hp = 0;
  run(g, S, 1);
  g.teams[1].scrap = 0; run(g, S, 60);
  const gain = g.teams[1].scrap;
  check('the Recycler pumps about 2 scrap a minute (a twentieth of an Extractor)', gain > 1.6 && gain < 2.6, gain.toFixed(2));
}

section('Workers and tech');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  const free = g.geysers.filter(x => !x.extractorId).sort((a, b) => S.dist(a, rec) - S.dist(b, rec))[0];
  const scav = mine(g, 1, 'scavenger')[0];
  g.events.length = 0;
  S.issueCommand(g, 1, { type: 'deploy', ids: [scav.id], geyserId: free.id });
  check('a basic Scavenger cannot deploy', scav.order.type !== 'deploy');
  g.teams[1].scrap = 300;
  S.issueCommand(g, 1, { type: 'upgrade', buildingId: rec.id });
  run(g, S, 41);
  check('the Recycler upgrades to Recycler II', rec.level === 2);
  const s2 = S.addUnit(g, 'scavenger2', 1, rec.x + 60, rec.y);
  S.issueCommand(g, 1, { type: 'deploy', ids: [s2.id], geyserId: free.id });
  run(g, S, 90);
  check('a Scavenger II deploys as an Extractor', mine(g, 1, 'extractor').length === 1);
  const ex = mine(g, 1, 'extractor')[0];
  // Only the Extractor and the Recycler's trickle pay in: no Scavengers.
  for (const u of g.entities) if (u.team === 1 && u.def.role === 'harvester') u.hp = 0;
  run(g, S, 1);
  g.teams[1].scrap = 0; ex.stored = 0; run(g, S, 60);
  check('an Extractor pays about 42 scrap a minute straight into storage', Math.abs(g.teams[1].scrap - 42 - 2.1) < 2, g.teams[1].scrap.toFixed(1));
  g.teams[1].scrap = S.scrapCapacity(g, 1); run(g, S, 200);
  check('with storage full, an Extractor holds up to 120', Math.abs(ex.stored - 120) < 0.01, ex.stored.toFixed(1));
  g.teams[1].scrap = 0; run(g, S, 1);
  check('the held scrap flows in once there is room', ex.stored < 1 && g.teams[1].scrap >= 120, `${Math.round(g.teams[1].scrap)} banked`);
  check('no Transports or Extractor Silos exist', !S.UNIT_TYPES.transport && !S.BUILDING_TYPES.outsilo);
  const lab = placeDone(S, g, 1, 'lab', rec);
  g.teams[1].scrap = 300;
  S.issueCommand(g, 1, { type: 'research', buildingId: lab.id, key: 'tank2' });
  run(g, S, 61);
  check('research completes', !!g.teams[1].research.tank2);
}

section('Production queue');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  placeDone(S, g, 1, 'basesilo', rec);
  const fac = placeDone(S, g, 1, 'factory', { x: rec.x + 200, y: rec.y - 150 });
  for (const u of g.entities) if (u.team === 1 && u.def.role === 'harvester') u.hp = 0;
  run(g, S, 0.1);
  g.teams[1].scrap = 250;
  S.issueCommand(g, 1, { type: 'produce', buildingId: fac.id, unit: 'tank', count: 12 });
  S.issueCommand(g, 1, { type: 'produce', buildingId: fac.id, unit: 'scout' });
  check('more than 5 vehicles can be queued', fac.queue.length === 13, `${fac.queue.length} queued`);
  S.stepGame(g);
  check('only the vehicle being built is paid for', Math.round(g.teams[1].scrap) === 150, `${Math.round(g.teams[1].scrap)} left`);
  const tanks0 = mine(g, 1, 'tank').length;
  run(g, S, 31);
  check('the queue keeps building while scrap lasts', mine(g, 1, 'tank').length === tanks0 + 2, `${mine(g, 1, 'tank').length - tanks0} built`);
  g.teams[1].scrap = 0; run(g, S, 20);
  check('with no scrap, the queue waits', fac.waiting && mine(g, 1, 'tank').length === tanks0 + 2);
  g.teams[1].scrap = 100; S.stepGame(g);
  const paidBefore = g.teams[1].scrap;
  S.issueCommand(g, 1, { type: 'cancel', buildingId: fac.id, unit: 'scout' });
  check('removing a waiting vehicle refunds nothing (it was never paid for)', g.teams[1].scrap === paidBefore && !fac.queue.includes('scout'));
  while (fac.queue.length > 1) S.issueCommand(g, 1, { type: 'cancel', buildingId: fac.id, unit: 'tank' });
  S.issueCommand(g, 1, { type: 'cancel', buildingId: fac.id, unit: 'tank' });
  check('cancelling the vehicle being built refunds its cost', g.teams[1].scrap === paidBefore + 100 && fac.queue.length === 0, `${g.teams[1].scrap}`);
}

section('Combat, demolish and the Repair Pad');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  const tower = placeDone(S, g, 1, 'tower', { x: rec.x + 200, y: rec.y - 100 });
  const foe = S.addUnit(g, 'tank', 2, tower.x + 150, tower.y);
  const hp0 = foe.hp; run(g, S, 3);
  check('a Gun Tower shoots enemies in range', foe.hp < hp0);
  foe.hp = 0; run(g, S, 1);

  const fac = placeDone(S, g, 1, 'factory', { x: rec.x + 100, y: rec.y - 200 });
  const before = g.scrap.reduce((a, s) => a + s.amount, 0);
  S.issueCommand(g, 1, { type: 'demolish', buildingId: fac.id });
  run(g, S, 1);
  const after = g.scrap.reduce((a, s) => a + s.amount, 0);
  check('demolishing leaves half the cost as scrap', after - before === 75, `${after - before}`);

  const pad = placeDone(S, g, 1, 'repairpad', { x: rec.x + 100, y: rec.y - 200 });
  check('vehicles can drive over a Repair Pad', !S.isBlockedTile(g, pad.tx + 1, pad.ty + 1));
  const kinds = ['scout', 'tank', 'artillery', 'scavenger', 'constructor', 'scout2', 'tank2', 'artillery2', 'scavenger2', 'constructor2'];
  const hurt = kinds.map((k, i) => { const u = S.addUnit(g, k, 1, pad.x - 30 + (i % 4) * 20, pad.y - 30 + Math.floor(i / 4) * 20); u.hp = u.maxHp / 2; if (u.def.shield) u.shield = 0; return u; });
  run(g, S, 20);
  const healed = hurt.filter(u => u.hp >= u.maxHp - 1 || u.hp > u.maxHp * 0.5 + 300);
  check('every kind of vehicle is repaired on the pad', healed.length === kinds.length,
    hurt.filter(u => !healed.includes(u)).map(u => u.type).join(',') || 'all repaired');
}

section('Repair Pad: workers wait, and Recycle');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  const pad = placeDone(S, g, 1, 'repairpad', { x: rec.x + 150, y: rec.y - 200 });
  // Hurt workers sent to the pad stay until repaired instead of going back to work.
  const scav = mine(g, 1, 'scavenger')[0];
  scav.hp = scav.maxHp * 0.3;
  S.issueCommand(g, 1, { type: 'gorepair', ids: [scav.id] });
  run(g, S, 60);
  check('a hurt Scavenger waits on the pad until fully repaired', scav.hp >= scav.maxHp - 1, `${Math.round(scav.hp)}/${scav.maxHp}`);
  run(g, S, 10);
  check('repaired workers then go back to work', !S.padUnder(g, scav) || scav.order.type !== 'idle');

  // Vehicles sent by Go repair drive off once fixed: beside the pad, or to its waypoint.
  const t1 = S.addUnit(g, 'tank', 1, rec.x + 80, rec.y - 60), t2b = S.addUnit(g, 'constructor', 1, rec.x + 100, rec.y - 60);
  t1.hp = 100; t2b.hp = 40;
  S.issueCommand(g, 1, { type: 'gorepair', ids: [t1.id, t2b.id] });
  run(g, S, 60);
  check('a repaired Tank leaves the pad by itself', t1.hp >= t1.maxHp - 1 && !S.padUnder(g, t1), `hp ${Math.round(t1.hp)}, on pad ${!!S.padUnder(g, t1)}`);
  check('a Constructor can Go repair and leaves once fixed', t2b.hp >= t2b.maxHp - 1 && !S.padUnder(g, t2b));
  const wp = { x: pad.x + 260, y: pad.y - 120 };
  S.issueCommand(g, 1, { type: 'rally', buildingId: pad.id, x: wp.x, y: wp.y });
  t1.hp = 100;
  S.issueCommand(g, 1, { type: 'gorepair', ids: [t1.id] });
  run(g, S, 60);
  check("a repaired vehicle drives to the pad's waypoint", S.dist(t1, wp) < 90, `${Math.round(S.dist(t1, wp))} px away`);
  S.issueCommand(g, 1, { type: 'rally', buildingId: pad.id, clear: true });
  t1.hp = 0; t2b.hp = 0; run(g, S, 0.1);

  // Recycle: half the cost back, only on the pad, never the Recycler.
  const T = S.CONFIG.TILE;
  const onPad = (k, i) => S.addUnit(g, k, 1, (pad.tx + 0.6 + i * 0.9) * T, (pad.ty + 1.5) * T);
  const tank = onPad('tank', 0), art2 = onPad('artillery2', 1), cons = onPad('constructor', 2);
  const away = S.addUnit(g, 'tank', 1, rec.x + 400, rec.y - 400);
  placeDone(S, g, 1, 'basesilo', rec);                     // room to bank the refund
  for (const u of g.entities) if (u.team === 1 && u.def.role === 'harvester') u.hp = 0;  // no deliveries meanwhile
  run(g, S, 0.1);
  g.teams[1].scrap = 0;
  S.issueCommand(g, 1, { type: 'recycle', ids: [tank.id, art2.id, cons.id, away.id] });
  run(g, S, 0.2);
  const want = 50 + 105 + 40;
  check('recycling on the pad refunds half the cost', Math.round(g.teams[1].scrap) === want, `${g.teams[1].scrap} of ${want}`);
  check('recycled vehicles are removed', ![tank, art2, cons].some(u => g.entities.includes(u)));
  check('recycled vehicles leave no wreck or salvage', !g.scrap.some(p => p.id === 100000 + tank.id) && !g.effects.some(e => e.kind === 'wreck' && Math.hypot(e.x - tank.x, e.y - tank.y) < 1));
  check('a vehicle off the pad cannot be recycled', g.entities.includes(away) && away.hp > 0);
  const mobile = S.addUnit(g, 'mobileRecycler', 1, pad.x, pad.y);
  S.issueCommand(g, 1, { type: 'recycle', ids: [mobile.id] });
  run(g, S, 0.2);
  check('the mobile Recycler cannot be recycled', g.entities.includes(mobile) && mobile.hp > 0);
  mobile.hp = 0; run(g, S, 0.1);
  const enemy = S.addUnit(g, 'scout', 2, pad.x, pad.y);
  S.issueCommand(g, 1, { type: 'recycle', ids: [enemy.id] });
  S.issueCommand(g, 2, { type: 'recycle', ids: [enemy.id] });
  run(g, S, 0.2);
  check("nobody can recycle on the other side's pad", g.entities.includes(enemy));
  // Storage full: the refund that doesn't fit is left on the pad as loose scrap.
  g.teams[1].scrap = S.scrapCapacity(g, 1) - 10;
  const t2 = onPad('tank', 0);
  const before = g.scrap.reduce((a, p) => a + p.amount, 0);
  S.issueCommand(g, 1, { type: 'recycle', ids: [t2.id] });
  const after = g.scrap.reduce((a, p) => a + p.amount, 0);
  check('with storage full, the rest of the refund is left on the pad', g.teams[1].scrap === S.scrapCapacity(g, 1) && after - before === 40, `banked 10, ground ${after - before}`);
}

section('Guard');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  // Escort: two Tanks guard a Scavenger that drives off; an enemy attacks it.
  const scav = S.addUnit(g, 'scavenger', 1, rec.x + 120, rec.y - 120);
  const g1 = S.addUnit(g, 'tank', 1, rec.x + 60, rec.y - 60), g2 = S.addUnit(g, 'tank', 1, rec.x + 80, rec.y - 40);
  S.issueCommand(g, 1, { type: 'guard', ids: [g1.id, g2.id], targetId: scav.id });
  const dest = { x: rec.x + 500, y: rec.y - 350 };
  S.issueCommand(g, 1, { type: 'move', ids: [scav.id], x: dest.x, y: dest.y });
  run(g, S, 25);
  check('guards follow the vehicle they guard', S.dist(g1, scav) < 130 && S.dist(g2, scav) < 130, `${Math.round(S.dist(g1, scav))} and ${Math.round(S.dist(g2, scav))} px away`);
  const foe = S.addUnit(g, 'scout', 2, scav.x + 150, scav.y);
  const hp0 = foe.hp; run(g, S, 4);
  check('guards attack an enemy near the guarded vehicle', foe.hp < hp0 || foe.hp <= 0 || !g.entities.includes(foe));
  scav.hp = 0; run(g, S, 0.2);
  check('guards stand down when the guarded vehicle is gone', g1.order.type === 'idle' && g2.order.type === 'idle');
  // Guard a building: any armed vehicle, not just Artillery.
  const tower = placeDone(S, g, 1, 'tower', { x: rec.x + 220, y: rec.y - 150 });
  S.issueCommand(g, 1, { type: 'guard', ids: [g1.id], targetId: tower.id });
  run(g, S, 15);
  check('a Tank can guard a building', g1.order.type === 'guard' && S.dist(g1, tower) < 140, `${Math.round(S.dist(g1, tower))} px`);
}

section('Gun Tower upgrades');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  const t1 = placeDone(S, g, 1, 'tower', { x: rec.x + 220, y: rec.y - 160 });
  const t2 = placeDone(S, g, 1, 'tower', { x: rec.x + 120, y: rec.y - 300 });
  g.teams[1].scrap = 300;
  S.issueCommand(g, 1, { type: 'upgrade', buildingId: t1.id, option: 'arttower' });
  check('an upgrade costs scrap (Artillery Tower 180)', g.teams[1].scrap === 120);
  S.issueCommand(g, 1, { type: 'upgrade', buildingId: t1.id, option: 'heavytower' });
  check('a tower can only upgrade one way', g.teams[1].scrap === 120);
  run(g, S, 31);
  check('a Gun Tower becomes an Artillery Tower', t1.variant === 'arttower' && t1.def.weapon.range === 520 && t1.def.name === 'Artillery Tower' && t1.maxHp === 1200);
  check('the base Gun Tower type is unchanged', S.BUILDING_TYPES.tower.weapon.range === 250 && t2.def.weapon.range === 250);
  // An enemy far beyond a Gun Tower's range, spotted by a friendly Scout.
  const ang = Math.atan2(-1, 1), d = 460;
  const foe = S.addUnit(g, 'tank', 2, t1.x + Math.cos(ang) * d, t1.y + Math.sin(ang) * d);
  foe.hp = foe.maxHp = 1e6; foe.def = Object.assign({}, foe.def, { weapon: undefined });
  S.addUnit(g, 'scout', 1, foe.x - 120, foe.y + 60);
  run(g, S, 8);
  check('an Artillery Tower shells a spotted enemy at long range', foe.hp < 1e6, `${Math.round(1e6 - foe.hp)} damage at ${d} px`);
  g.teams[1].scrap = 300;
  S.issueCommand(g, 1, { type: 'upgrade', buildingId: t2.id, option: 'heavytower' });
  run(g, S, 26);
  check('a Gun Tower becomes a Heavy Gun Tower', t2.variant === 'heavytower' && t2.maxHp === 1600 && t2.def.weapon.cooldown === 0.6);
}

section('Artillery stabilisers');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  const T = S.CONFIG.TILE;
  // An open stretch of ground near the base, with room for a target 200 px east.
  let P = null;
  for (let k = 0; k < 2000 && !P; k += 8) {
    const x = rec.x + 150 + (k % 400), y = rec.y - 200 - Math.floor(k / 400) * 40;
    if (!S.isBlockedTile(g, Math.floor(x / T), Math.floor(y / T)) && !S.isBlockedTile(g, Math.floor((x + 200) / T), Math.floor(y / T))) P = { x, y };
  }
  const art = S.addUnit(g, 'artillery', 1, P.x, P.y);
  // A target inside the artillery's own sight that can't shoot back or die.
  const foe = S.addUnit(g, 'tank', 2, P.x + 200, P.y);
  foe.hp = foe.maxHp = 1e6; foe.def = Object.assign({}, foe.def, { weapon: undefined });
  let first = null;
  for (let i = 0; i < 90; i++) { S.stepGame(g); if (first === null && art.lastShot !== undefined) first = (i + 1) / 30; }
  check('artillery fires only after lowering its legs (about 0.6 s)', first !== null && first >= 0.55 && art.legE === 1, first && `${first.toFixed(2)} s`);
  const x0 = art.x, y0 = art.y;
  S.issueCommand(g, 1, { type: 'move', ids: [art.id], x: art.x, y: art.y - 200 });
  let moved = null;
  for (let i = 0; i < 60; i++) { S.stepGame(g); if (moved === null && Math.hypot(art.x - x0, art.y - y0) > 1) moved = (i + 1) / 30; }
  check('artillery raises its legs before driving off (about 0.6 s)', moved !== null && moved >= 0.55, moved && `${moved.toFixed(2)} s`);
  S.issueCommand(g, 1, { type: 'move', ids: [art.id], x: P.x + 100, y: P.y + 400 });
  let firedMoving = false;
  for (let i = 0; i < 120; i++) { const shot = art.lastShot, px = art.x, py = art.y; S.stepGame(g); if (art.lastShot !== shot && Math.hypot(art.x - px, art.y - py) > 0.01) firedMoving = true; }
  check('artillery never fires while moving', !firedMoving);
}

section('Artillery fires on what its side can see');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  const T = S.CONFIG.TILE, open = (x, y) => !S.isBlockedTile(g, Math.floor(x / T), Math.floor(y / T));
  let P = null;
  for (let k = 0; k < 4000 && !P; k += 8) {
    const x = rec.x + 150 + (k % 400), y = rec.y - 200 - Math.floor(k / 400) * 40;
    if (open(x, y) && open(x + 380, y) && open(x + 330, y + 60)) P = { x, y };
  }
  const art = S.addUnit(g, 'artillery', 1, P.x, P.y);
  // A harmless target past the artillery's own sight (220) but inside its range (440).
  const foe = S.addUnit(g, 'tank', 2, P.x + 380, P.y);
  foe.hp = foe.maxHp = 1e6; foe.def = Object.assign({}, foe.def, { weapon: undefined });
  run(g, S, 3);
  check('on its own, artillery does not fire at what it cannot see', art.lastShot === undefined);
  // A friendly Scout (unarmed for the test) spots the target.
  const spotter = S.addUnit(g, 'scout', 1, P.x + 330, P.y + 60);
  spotter.def = Object.assign({}, spotter.def, { weapon: undefined });
  run(g, S, 3);
  check('artillery fires at a target a friendly vehicle spots, out to its full range', art.lastShot !== undefined);
}

section('Hornet and Sentry');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  const T = S.CONFIG.TILE, open = (x, y) => !S.isBlockedTile(g, Math.floor(x / T), Math.floor(y / T));
  const f = placeDone(S, g, 1, 'factory', { x: rec.x + 200, y: rec.y });
  check('a Factory builds Hornets and Sentries', ['hornet', 'sentry'].every(t => f.def.produces.includes(t)));
  const H = S.UNIT_TYPES.hornet, Tk = S.UNIT_TYPES.tank;
  check('the Hornet is quicker and cheaper than a Tank, with less armour', H.speed > Tk.speed && H.cost < Tk.cost && H.hp < Tk.hp);
  let P = null;
  for (let k = 0; k < 4000 && !P; k += 8) {
    const x = rec.x + 150 + (k % 400), y = rec.y - 200 - Math.floor(k / 400) * 40;
    if (open(x, y) && open(x + 180, y)) P = { x, y };
  }
  // A Sentry with a harmless target in range: legs first, then a rapid stream.
  const sen = S.addUnit(g, 'sentry', 1, P.x, P.y);
  const foe = S.addUnit(g, 'tank', 2, P.x + 180, P.y);
  foe.hp = foe.maxHp = 1e6; foe.def = Object.assign({}, foe.def, { weapon: undefined });
  let first = null, shots = 0, last;
  for (let i = 0; i < 90; i++) { S.stepGame(g); if (sen.lastShot !== last) { last = sen.lastShot; if (last !== undefined) { shots++; if (first === null) first = (i + 1) / 30; } } }
  check('a Sentry lowers its legs before it fires (about 0.6 s)', first !== null && first >= 0.55, first && `${first.toFixed(2)} s`);
  check('then fires a rapid stream (several shots a second)', shots >= 8, `${shots} shots in 3 s`);
  const hor = S.addUnit(g, 'hornet', 1, P.x, P.y + 40);
  let rocket = false;
  for (let i = 0; i < 60; i++) { S.stepGame(g); if (g.projectiles.some(p => p.owner === hor.id && p.kind === 'rocket')) rocket = true; }
  check('a Hornet fires rockets', rocket);
}

section('Factions');
{
  const S = load();
  const g = S.createGame({ seed: 42, difficulty: 'normal', aiTeams: [], factions: { 1: 'kethra', 2: 'scrapline' } });
  check('each side gets the faction it chose', g.teams[1].faction === 'kethra' && g.teams[2].faction === 'scrapline');
  const k = mine(g, 1, 'mobileRecycler')[0], sc = mine(g, 2, 'mobileRecycler')[0];
  check('vehicles carry their side\'s faction', k.faction === 'kethra' && sc.faction === 'scrapline');
  const t1 = S.addUnit(g, 'tank2', 1, k.x, k.y), t2 = S.addUnit(g, 'tank', 2, sc.x, sc.y);
  check('names are in each faction\'s words (Bulwark Mk II, Tank)', S.nameOf(t1) === 'Bulwark Mk II' && S.nameOf(t2) === 'Tank', `${S.nameOf(t1)}, ${S.nameOf(t2)}`);
  const gy = g.geysers.slice().sort((a, b) => S.dist(a, k) - S.dist(b, k))[0];
  S.issueCommand(g, 1, { type: 'deploy', ids: [k.id], geyserId: gy.id });
  run(g, S, 25);
  const nexus = mine(g, 1, 'recycler')[0];
  const said = g.events.filter(e => e.team === 1 && e.text).map(e => e.text);
  check('the Kethra Recycler is a Nexus, and its messages say so', S.nameOf(nexus) === 'Nexus' && said.some(t => /Nexus deploying/.test(t)) && !said.some(t => /Recycler/.test(t)), said.slice(0, 2).join(' / '));
  const same = Object.keys(S.UNIT_TYPES).every(t => S.UNIT_TYPES[t].hp > 0);
  check('both factions use the same unit numbers (only names differ)', same && t1.def === S.UNIT_TYPES.tank2);
  const g2 = S.createGame({ seed: 5, difficulty: 'normal', aiTeams: [] });
  check('a side with no faction chosen is Scrapline', g2.teams[1].faction === 'scrapline' && g2.teams[2].faction === 'scrapline');
}

section('Formations');
{
  const S = load();
  const march = key => {
    const g = S.createGame({ seed: 42, difficulty: 'normal', aiTeams: [] });
    const m = mine(g, 1, 'mobileRecycler')[0], T = S.CONFIG.TILE, base = { x: m.x + 200, y: m.y - 200 };
    const us = ['tank', 'tank', 'tank', 'sentry', 'scout', 'scout', 'hornet', 'artillery', 'artillery', 'scavenger'].map((t, i) => {
      const o = S.nearestOpenTile(g, Math.floor((base.x + (i % 4) * 40) / T), Math.floor((base.y + Math.floor(i / 4) * 40) / T), 8);
      return S.addUnit(g, t, 1, (o.x + 0.5) * T, (o.y + 0.5) * T);
    });
    const dest = { x: base.x + 1600, y: base.y - 900 };
    S.issueCommand(g, 1, { type: 'move', ids: us.map(u => u.id), x: dest.x, y: dest.y, formation: key });
    let spread = 0, done = false;
    for (let i = 0; i < 30 * 240 && !done; i++) {
      S.stepGame(g);
      if (i % 30 === 0 && i > 30 * 15) { const c = centre(us); spread = Math.max(spread, ...us.map(u => S.dist(u, c))); }
      done = us.every(u => u.order.type === 'idle' && !u.path.length);
    }
    const c = centre(us), a = Math.atan2(dest.y - base.y, dest.x - base.x);
    const avg = (role, f) => { const l = us.filter(u => S.formRole(u) === role).map(f); return l.reduce((x, y) => x + y, 0) / l.length; };
    const fwd = u => (u.x - c.x) * Math.cos(a) + (u.y - c.y) * Math.sin(a);
    return { done, spread, toDest: S.dist(c, dest), fwd: role => avg(role, fwd), out: role => avg(role, u => S.dist(u, c)) };
  };
  const centre = us => ({ x: us.reduce((a, u) => a + u.x, 0) / us.length, y: us.reduce((a, u) => a + u.y, 0) / us.length });
  check('six formations to choose from, plus Free', S.FORMATIONS.length === 7 && S.FORMATIONS[0].key === 'free');
  const free = march('free'), box = march('box'), col = march('column');
  check('a group in formation arrives where it was sent', box.done && box.toDest < 40 && col.done, `${Math.round(box.toDest)} px off`);
  check('and stays together on the way (free movement strings out)', box.spread < 220 && col.spread < 220 && free.spread > box.spread * 2,
    `formation ${Math.round(box.spread)} px, free ${Math.round(free.spread)} px`);
  check('Testudo keeps Artillery and workers inside the ring of armour', box.out('soft') < box.out('heavy'),
    `${Math.round(box.out('soft'))} vs ${Math.round(box.out('heavy'))} px from the centre`);
  check('Column puts fast units in front and Artillery at the back', col.fwd('light') > col.fwd('heavy') && col.fwd('heavy') > col.fwd('soft'));
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
