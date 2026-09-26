// =============================================================================
// ai.js — THE ENEMY COMMANDER
//
// The computer opponent plays by exactly the same rules as you. It can only
// act through issueCommand(), the same way your mouse clicks do. The only
// advantage it gets is the difficulty's income bonus from config.js.
// =============================================================================

function aiUpdate(game, team) {
  const diff = DIFFICULTY[game.difficulty];
  const ai = game.ai[team] || (game.ai[team] = { next: 0, waveSize: diff.waveBase, lastWave: 0 });
  if (game.time < ai.next) return;
  ai.next = game.time + diff.thinkEvery;

  const mine = game.entities.filter(e => e.team === team);
  const units = mine.filter(e => e.kind === 'unit');
  const buildings = mine.filter(e => e.kind === 'building');
  const tm = game.teams[team];
  const enemy = 3 - team;
  const hq = buildings.find(b => b.type === 'recycler');
  if (!hq) return;
  const count = type => units.filter(u => u.type === type).length +
    buildings.reduce((n, b) => n + b.queue.filter(q => q === type).length, 0);
  const cmd = c => issueCommand(game, team, c);
  const toCenter = angleTo(hq, { x: game.map.W * CONFIG.TILE / 2, y: game.map.H * CONFIG.TILE / 2 });

  // --- Economy -------------------------------------------------------------
  const scavWanted = Math.min(7, 4 + Math.floor(game.time / 150));
  if (!hq.queue.length) {
    if (count('constructor') < 1 && tm.scrap >= UNIT_TYPES.constructor.cost) cmd({ type: 'produce', buildingId: hq.id, unit: 'constructor' });
    else if (count('scavenger') < scavWanted && tm.scrap >= UNIT_TYPES.scavenger.cost) cmd({ type: 'produce', buildingId: hq.id, unit: 'scavenger' });
  }

  // --- Construction --------------------------------------------------------
  const builder = units.find(u => u.type === 'constructor' && u.order.type === 'idle');
  if (builder) {
    const has = type => buildings.filter(b => b.type === type).length;
    const damaged = buildings.find(b => b.built >= 1 && b.hp < b.maxHp * 0.6);
    const unfinished = buildings.find(b => b.built < 1);
    let want = null;
    if (unfinished) cmd({ type: 'repair', ids: [builder.id], targetId: unfinished.id });
    else if (damaged) cmd({ type: 'repair', ids: [builder.id], targetId: damaged.id });
    else if (!has('factory')) want = 'factory';
    else if (has('tower') < 1 && game.time > 90) want = 'tower';
    else if (has('silo') < 1 && game.time > 150) want = 'silo';
    else if (has('factory') < 2 && game.time > 300) want = 'factory';
    else if (has('tower') < 2 + game.flags.filter(f => f.owner === team).length && game.time > 200) want = 'tower';
    if (want && tm.scrap >= BUILDING_TYPES[want].cost) {
      const spot = findBuildSpot(game, team, want, hq, toCenter, builder);
      if (spot) cmd({ type: 'build', ids: [builder.id], building: want, tx: spot.x, ty: spot.y });
    }
  }

  // --- Army production -----------------------------------------------------
  const army = units.filter(u => u.def.role === 'combat');
  for (const f of buildings.filter(b => b.type === 'factory' && b.built >= 1)) {
    if (f.queue.length >= 2 || units.length >= CONFIG.UNIT_CAP - 2) continue;
    const scouts = count('scout'), tanks = count('tank'), arty = count('artillery');
    let pick = 'tank';
    if (scouts < 2 || scouts * 4 < army.length) pick = 'scout';
    else if (arty * 4 < tanks && game.time > 180) pick = 'artillery';
    // Keep a reserve for the builder early on.
    if (tm.scrap >= UNIT_TYPES[pick].cost + (builder ? 60 : 0)) cmd({ type: 'produce', buildingId: f.id, unit: pick });
    if (!f.rally) cmd({ type: 'rally', buildingId: f.id, x: hq.x + Math.cos(toCenter) * 220, y: hq.y + Math.sin(toCenter) * 220 });
  }

  // --- Defence -------------------------------------------------------------
  const intruder = game.entities.find(e => e.team === enemy && e.kind === 'unit' && e.def.role === 'combat' &&
    buildings.some(b => dist(b, e) < 380) && isVisibleTo(game, team, e));
  if (intruder) {
    const defenders = army.filter(u => dist(u, hq) < 1100 && u.order.type !== 'attack');
    if (defenders.length) cmd({ type: 'move', ids: defenders.map(u => u.id), x: intruder.x, y: intruder.y, attackMove: true });
    return;
  }

  // --- Attack --------------------------------------------------------------
  const objective = pickObjective(game, team, hq);
  if (!objective) return;
  const rally = { x: hq.x + Math.cos(toCenter) * 220, y: hq.y + Math.sin(toCenter) * 220 };
  const idle = army.filter(u => u.order.type === 'idle' && !u.target);
  const atRally = idle.filter(u => dist(u, rally) < 260);
  const inField = idle.filter(u => dist(u, rally) >= 260);

  // Early game: scouts race to grab free flags.
  if (game.time < 120) {
    for (const s of idle.filter(u => u.type === 'scout')) {
      const flag = nearestFlag(game, s, f => f.owner !== team);
      if (flag) cmd({ type: 'move', ids: [s.id], x: flag.x, y: flag.y, attackMove: true });
    }
  }
  // Units already out on the battlefield keep pushing.
  if (inField.length) cmd({ type: 'move', ids: inField.map(u => u.id), x: objective.x, y: objective.y, attackMove: true });
  // Send a new wave once enough units have gathered.
  ai.waveSize = Math.min(20, diff.waveBase + Math.floor(game.time / 60 * diff.waveGrowth));
  if (atRally.length >= ai.waveSize) {
    cmd({ type: 'move', ids: atRally.map(u => u.id), x: objective.x, y: objective.y, attackMove: true });
    ai.lastWave = game.time;
    pushEvent(game, enemy, 'Enemy forces are on the move!', 'bad');
  }
}

function nearestFlag(game, from, filter) {
  let best = null, bd = Infinity;
  for (const f of game.flags) if (filter(f)) { const d = dist(from, f); if (d < bd) { bd = d; best = f; } }
  return best;
}

function pickObjective(game, team, hq) {
  const flag = nearestFlag(game, hq, f => f.owner !== team);
  if (flag) return flag;
  // Every flag is ours: go for the enemy base, once the grace period is over.
  if (game.time < DIFFICULTY[game.difficulty].baseAttackAfter) return null;
  const enemyBuildings = game.entities.filter(e => e.team !== team && e.kind === 'building');
  let best = null, bd = Infinity;
  for (const b of enemyBuildings) { const d = dist(hq, b); if (d < bd) { bd = d; best = b; } }
  return best;
}

function findBuildSpot(game, team, type, hq, towardAngle, builder) {
  const T = CONFIG.TILE, size = BUILDING_TYPES[type].size;
  const baseDist = type === 'tower' ? 8 : type === 'silo' ? 9 : 5;
  const htx = hq.x / T, hty = hq.y / T;
  for (let ring = 0; ring < 6; ring++) {
    for (let k = 0; k < 12; k++) {
      const a = towardAngle + ((k % 2 ? 1 : -1) * Math.ceil(k / 2)) * 0.28 + (game.rng() - 0.5) * 0.2;
      const r = baseDist + ring * 1.5;
      const tx = Math.round(htx + Math.cos(a) * r - size / 2), ty = Math.round(hty + Math.sin(a) * r - size / 2);
      // Leave a gap so units can drive between buildings.
      if (!canPlaceBuilding(game, team, type, tx - 1, ty - 1).ok) continue;
      if (canPlaceBuilding(game, team, type, tx, ty).ok && canPlaceBuilding(game, team, type, tx + 1, ty + 1).ok) return { x: tx, y: ty };
    }
  }
  return null;
}
