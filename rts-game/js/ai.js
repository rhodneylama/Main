// =============================================================================
// ai.js — THE ENEMY COMMANDER
//
// The computer opponent plays by exactly the same rules as you. It can only
// act through issueCommand(), the same way your taps and clicks do. How hard
// it plays is set by DIFFICULTY in config.js.
//
// Its plan: gather scrap, build a base and defences, expand toward scrap
// by deploying Scavengers onto scrap geysers, then attack in waves until
// your Recycler falls.
// =============================================================================

function aiUpdate(game, team) {
  const diff = DIFFICULTY[game.difficulty];
  const ai = game.ai[team] || (game.ai[team] = { next: 0, nextWave: diff.firstAttack });
  if (game.time < ai.next) return;
  // A little jitter so the two commanders don't always think on the same tick
  // (whoever acts first on a shared tick would get a small, unfair edge).
  ai.next = game.time + diff.thinkEvery * (0.85 + game.rng() * 0.3);

  const mine = game.entities.filter(e => e.team === team);
  const units = mine.filter(e => e.kind === 'unit');
  const buildings = mine.filter(e => e.kind === 'building');
  const tm = game.teams[team];
  const enemy = 3 - team;
  const hq = buildings.find(b => b.type === 'recycler');
  if (!hq) return;
  const count = type => units.filter(u => u.type === type).length +
    buildings.reduce((n, b) => n + b.queue.filter(q => q === type).length, 0);
  const has = type => buildings.filter(b => b.type === type).length;
  const cmd = c => issueCommand(game, team, c);
  const toCenter = angleTo(hq, { x: game.map.W * CONFIG.TILE / 2, y: game.map.H * CONFIG.TILE / 2 });
  const rally = { x: hq.x + Math.cos(toCenter) * 220, y: hq.y + Math.sin(toCenter) * 220 };

  // --- Economy -------------------------------------------------------------
  const scavWanted = Math.min(diff.maxScavengers, 3 + Math.floor(game.time / 150));
  const extractors = buildings.filter(b => b.type === 'extractor' && b.built >= 1);
  if (!hq.queue.length) {
    if (count('constructor') < 1 && tm.scrap >= UNIT_TYPES.constructor.cost) cmd({ type: 'produce', buildingId: hq.id, unit: 'constructor' });
    // One Transport per Extractor to haul its scrap home.
    else if (count('transport') < extractors.length && tm.scrap >= UNIT_TYPES.transport.cost) cmd({ type: 'produce', buildingId: hq.id, unit: 'transport' });
    else if (count('scavenger') < scavWanted && tm.scrap >= UNIT_TYPES.scavenger.cost) cmd({ type: 'produce', buildingId: hq.id, unit: 'scavenger' });
  }

  // --- Expansion: turn a Scavenger into an Extractor on a free geyser --------
  const easy = game.difficulty === 'easy';
  const deploying = units.some(u => u.order.type === 'deploy');
  if (!deploying && has('extractor') < diff.maxExtractors && game.time > (easy ? 360 : 90) && game.time - (ai.lastDeploy || -99) > 30) {
    const geyser = expansionTarget(game, team, hq);
    const scavs = units.filter(u => u.type === 'scavenger');
    if (geyser && scavs.length >= 3) {
      const scav = scavs.sort((a, b) => dist(a, geyser) - dist(b, geyser))[0];
      cmd({ type: 'deploy', ids: [scav.id], geyserId: geyser.id });
      ai.lastDeploy = game.time;
    }
  }

  // --- Construction --------------------------------------------------------
  const builder = units.find(u => u.type === 'constructor' && u.order.type === 'idle');
  if (builder) {
    const damaged = buildings.find(b => b.built >= 1 && b.hp < b.maxHp * 0.6);
    const unfinished = buildings.find(b => b.built < 1);
    let want = null, near = null;
    if (unfinished) cmd({ type: 'repair', ids: [builder.id], targetId: unfinished.id });
    else if (damaged) cmd({ type: 'repair', ids: [builder.id], targetId: damaged.id });
    else if (!has('factory')) want = 'factory';
    else if (has('tower') < 1 && game.time > (easy ? 300 : 90)) want = 'tower';
    // Every Extractor gets an Outpost Silo to pump into.
    else if ((near = extractors.find(x => !buildings.some(s => s.type === 'outsilo' && dist(s, x) < 8 * CONFIG.TILE)))) want = 'outsilo';
    // More storage once the bank keeps filling up.
    else if (has('basesilo') < diff.maxBaseSilos && tm.scrap >= scrapCapacity(game, team) * 0.7 && game.time > 150) want = 'basesilo';
    else if (diff.secondFactory && has('factory') < 2 && game.time > 300) want = 'factory';
    else if (has('tower') < 1 + has('extractor') && game.time > 200) {
      // Guard the outpost that has the fewest towers nearby.
      want = 'tower';
      const outposts = buildings.filter(b => b.type === 'extractor' && b.built >= 1);
      near = outposts.find(s => !buildings.some(t => t.type === 'tower' && dist(t, s) < 260)) || null;
    }
    if (want === 'factory' || want === 'basesilo') near = null;  // these go around the Recycler
    ai.saving = want === 'basesilo' && tm.scrap < BUILDING_TYPES.basesilo.cost;
    if (want && tm.scrap >= BUILDING_TYPES[want].cost) {
      const spot = findBuildSpot(game, team, want, hq, toCenter, near);
      if (spot) cmd({ type: 'build', ids: [builder.id], building: want, tx: spot.x, ty: spot.y });
    }
  }

  // --- Army production -----------------------------------------------------
  const army = units.filter(u => u.def.role === 'combat');
  // Lower difficulties grow their army slowly, so you have time to prepare.
  const armyCap = diff.armyPerMinute ? Math.min(diff.maxArmy, 3 + Math.floor(game.time / 60 * diff.armyPerMinute)) : diff.maxArmy;
  for (const f of buildings.filter(b => b.type === 'factory' && b.built >= 1)) {
    if (f.queue.length >= 2 || count('scout') + count('tank') + count('artillery') >= armyCap) continue;
    if (units.length >= CONFIG.UNIT_CAP - 2) continue;
    const scouts = count('scout'), tanks = count('tank'), arty = count('artillery');
    let pick = 'tank';
    if (scouts < 2 || scouts * 4 < army.length) pick = 'scout';
    else if (arty * 4 < tanks && game.time > diff.artilleryAfter) pick = 'artillery';
    // Keep a reserve for the builder, and hold off while saving for a Base Silo.
    if (ai.saving) continue;
    if (tm.scrap >= UNIT_TYPES[pick].cost + (builder ? 60 : 0)) cmd({ type: 'produce', buildingId: f.id, unit: pick });
    if (!f.rally) cmd({ type: 'rally', buildingId: f.id, x: rally.x, y: rally.y });
  }

  // --- Defence -------------------------------------------------------------
  const intruder = game.entities.find(e => e.team === enemy && e.kind === 'unit' && e.def.role === 'combat' &&
    buildings.some(b => dist(b, e) < 380) && isVisibleTo(game, team, e));
  if (intruder) {
    const defenders = army.filter(u => dist(u, hq) < 1400 && u.order.type !== 'attack');
    if (defenders.length) cmd({ type: 'move', ids: defenders.map(u => u.id), x: intruder.x, y: intruder.y, attackMove: true });
    return;
  }

  // --- Attack --------------------------------------------------------------
  const idle = army.filter(u => u.order.type === 'idle' && !u.target);
  const atHome = idle.filter(u => dist(u, rally) < 300);
  const inField = idle.filter(u => dist(u, rally) >= 300);
  const objective = pickObjective(game, team, hq);

  // Units already out attacking keep pushing to the next target.
  if (inField.length && objective && game.time >= diff.firstAttack) {
    cmd({ type: 'move', ids: inField.map(u => u.id), x: objective.x, y: objective.y, attackMove: true });
  } else if (inField.length) {
    cmd({ type: 'move', ids: inField.map(u => u.id), x: rally.x, y: rally.y });
  }

  // Launch a wave once it's time and enough units have gathered.
  const waveSize = Math.min(diff.maxArmy, diff.waveBase + Math.floor(Math.max(0, game.time - diff.firstAttack) / 60 * diff.waveGrowth));
  if (objective && game.time >= ai.nextWave && atHome.length >= waveSize) {
    // Send the wave; anything extra stays home to defend.
    const wave = atHome.sort((a, b) => dist(a, objective) - dist(b, objective)).slice(0, waveSize);
    cmd({ type: 'move', ids: wave.map(u => u.id), x: objective.x, y: objective.y, attackMove: true });
    ai.nextWave = game.time + diff.waveEvery;
    pushEvent(game, enemy, 'Enemy attack force spotted, heading your way!', 'bad');
  }
}

// Attack the enemy building closest to our base: outposts first, then the HQ.
function pickObjective(game, team, hq) {
  let best = null, bd = Infinity;
  for (const b of game.entities) {
    if (b.team === team || b.kind !== 'building') continue;
    if (b.type !== 'recycler' && !b.seen[team]) continue;  // everyone knows where the HQ is
    const d = dist(hq, b);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// The nearest free scrap geyser on our side of the map.
function expansionTarget(game, team, hq) {
  const foe = game.entities.find(e => e.team !== team && e.type === 'recycler');
  let best = null, bd = Infinity;
  for (const g of game.geysers) {
    if (geyserTaken(game, g)) continue;
    if (foe && dist(foe, g) < dist(hq, g)) continue;
    const d = dist(hq, g);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

// Find a legal spot for a building. With `near`, try to get as close to that
// point as the rules allow; otherwise place it around the base.
// The search runs as if we were Blue, bottom-left, and the answer is mirrored
// for Red, so both sides place buildings in exactly the same way.
function findBuildSpot(game, team, type, hq, towardAngle, near) {
  const T = CONFIG.TILE, size = BUILDING_TYPES[type].size, W = game.map.W, H = game.map.H;
  const flip = team !== 1;
  const local = p => flip ? { x: W * T - p.x, y: H * T - p.y } : { x: p.x, y: p.y };
  const world = (tx, ty) => flip ? { x: W - size - tx, y: H - size - ty } : { x: tx, y: ty };
  const ok = (tx, ty) => { const w = world(tx, ty); return canPlaceBuilding(game, team, type, w.x, w.y).ok; };
  // Leave a gap around buildings so units can drive between them.
  const fits = (tx, ty) => ok(tx - 1, ty - 1) && ok(tx, ty) && ok(tx + 1, ty + 1);
  const home = local(hq);
  if (near) {
    const goal = local(near);
    // Walk from the target back toward home until a spot is allowed.
    const steps = Math.ceil(dist(home, goal) / T);
    for (let i = 0; i <= steps; i++) {
      const x = goal.x + (home.x - goal.x) * i / steps, y = goal.y + (home.y - goal.y) * i / steps;
      for (const [ox, oy] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const tx = Math.round(x / T - size / 2) + ox, ty = Math.round(y / T - size / 2) + oy;
        if (fits(tx, ty)) return world(tx, ty);
      }
    }
    return null;
  }
  const toward = angleTo(home, { x: W * T / 2, y: H * T / 2 });
  const baseDist = type === 'tower' ? 8 : 5;
  const htx = home.x / T, hty = home.y / T;
  for (let ring = 0; ring < 6; ring++) {
    for (let k = 0; k < 12; k++) {
      const a = toward + ((k % 2 ? 1 : -1) * Math.ceil(k / 2)) * 0.28 + (game.rng() - 0.5) * 0.2;
      const r = baseDist + ring * 1.5;
      const tx = Math.round(htx + Math.cos(a) * r - size / 2), ty = Math.round(hty + Math.sin(a) * r - size / 2);
      if (fits(tx, ty)) return world(tx, ty);
    }
  }
  return null;
}
