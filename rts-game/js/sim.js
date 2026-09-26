// =============================================================================
// sim.js — THE RULES OF THE WORLD
//
// This file runs the battle: moving units, shooting, collecting scrap,
// and building. It never draws anything.
//
// Every player action arrives as a "command" (see issueCommand below). That
// matters for online play later: instead of sending the whole game over the
// internet, each player's computer only needs to send its commands.
// =============================================================================

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const wrapAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const turnToward = (cur, target, maxStep) => {
  const d = wrapAngle(target - cur);
  return Math.abs(d) <= maxStep ? target : cur + Math.sign(d) * maxStep;
};

function createGame({ seed = Date.now() % 100000, difficulty = 'normal', aiTeams = [2] } = {}) {
  const map = generateMap(seed);
  const game = {
    map, seed, difficulty, aiTeams,
    rng: makeRng(seed * 7 + 1),
    tick: 0, time: 0,
    entities: [], byId: new Map(), nextId: 1,
    projectiles: [], effects: [], events: [],
    occupied: new Uint8Array(map.W * map.H),
    scrap: map.scrap, geysers: map.geysers,
    packs: {}, nextPackId: 1,
    teams: {},
    winner: 0,
    ai: {},
  };
  for (const t of [1, 2]) {
    game.teams[t] = {
      id: t, scrap: CONFIG.START_SCRAP,
      vis: new Uint8Array(map.W * map.H), explored: new Uint8Array(map.W * map.H),
      incomeMult: aiTeams.includes(t) ? DIFFICULTY[difficulty].incomeMult : 1,
      stats: { built: 0, lost: 0, killed: 0, scrapGathered: 0 },
    };
    const b = map.bases[t];
    const rec = addBuilding(game, 'recycler', t, b.x - 1, b.y - 1, true);
    const dir = t === 1 ? 1 : -1;
    const spawn = (type, ox, oy) => addUnit(game, type, t, rec.x + ox * dir * CONFIG.TILE, rec.y + oy * dir * CONFIG.TILE);
    spawn('scavenger', 3, -1); spawn('scavenger', 3, 1);
    spawn('constructor', -1, -3);
    spawn('scout', 4, -3); spawn('scout', 5, -2); spawn('tank', 5, -4);
  }
  updateVisibility(game);
  for (const e of game.entities) if (e.kind === 'unit' && e.def.role === 'harvester') autoHarvest(game, e);
  return game;
}

// ---------------------------------------------------------------------------
// Creating things
// ---------------------------------------------------------------------------

function addUnit(game, type, team, x, y) {
  const def = UNIT_TYPES[type];
  const u = {
    id: game.nextId++, kind: 'unit', type, def, team, x, y,
    hp: def.hp, maxHp: def.hp, radius: def.radius,
    angle: team === 1 ? -Math.PI / 4 : Math.PI * 3 / 4, turret: 0,
    order: { type: 'idle', gx: x, gy: y }, path: [], target: null,
    cooldown: 0, carry: 0, stuck: 0, retarget: 0, lastHitBy: null, hitFlash: 0,
  };
  u.turret = u.angle;
  game.entities.push(u); game.byId.set(u.id, u);
  return u;
}

function addBuilding(game, type, team, tx, ty, complete) {
  const def = BUILDING_TYPES[type], T = CONFIG.TILE;
  const b = {
    id: game.nextId++, kind: 'building', type, def, team, tx, ty, size: def.size,
    x: (tx + def.size / 2) * T, y: (ty + def.size / 2) * T, radius: def.size * T / 2,
    hp: complete ? def.hp : def.hp * 0.1, maxHp: def.hp,
    built: complete ? 1 : 0, queue: [], prodTime: 0,
    rally: null, cooldown: 0, turret: team === 1 ? -Math.PI / 4 : Math.PI * 3 / 4,
    target: null, retarget: 0, hitFlash: 0, seen: {},
  };
  setOccupied(game, b, 1);
  game.entities.push(b); game.byId.set(b.id, b);
  return b;
}

function setOccupied(game, b, delta) {
  for (let y = b.ty; y < b.ty + b.size; y++)
    for (let x = b.tx; x < b.tx + b.size; x++) game.occupied[y * game.map.W + x] += delta;
}

function pushEvent(game, team, text, kind = 'info', x, y) {
  game.events.push({ team, text, kind, x, y, time: game.time });
}

// ---------------------------------------------------------------------------
// Building placement rules
// ---------------------------------------------------------------------------

function canPlaceBuilding(game, team, type, tx, ty) {
  const def = BUILDING_TYPES[type], m = game.map;
  const tm = game.teams[team];
  for (let y = ty; y < ty + def.size; y++) for (let x = tx; x < tx + def.size; x++) {
    if (x < 1 || y < 1 || x >= m.W - 1 || y >= m.H - 1) return { ok: false, why: 'Off the map' };
    const i = y * m.W + x;
    if (!tm.explored[i]) return { ok: false, why: 'Unexplored ground' };
    if (isBlockedTile(game, x, y)) return { ok: false, why: 'Something is in the way' };
  }
  for (const g of game.geysers) {
    if (g.tx > tx - 1 && g.tx < tx + def.size + 1 && g.ty > ty - 1 && g.ty < ty + def.size + 1)
      return { ok: false, why: 'Leave scrap geysers free for Extractors' };
  }
  const cx = tx + def.size / 2, cy = ty + def.size / 2;
  for (const e of game.entities) {
    if (e.kind === 'unit' && e.team !== team && dist(e, { x: cx * CONFIG.TILE, y: cy * CONFIG.TILE }) < def.size * CONFIG.TILE)
      return { ok: false, why: 'Enemy units too close' };
  }
  if (!inTerritory(game, team, cx, cy)) return { ok: false, why: 'Outside your territory. Build a Scrap Silo near the edge to expand it.' };
  return { ok: true };
}

// Territory: you can only build near your own finished buildings.
function inTerritory(game, team, cx, cy) {
  const T = CONFIG.TILE;
  for (const e of game.entities) {
    if (e.kind !== 'building' || e.team !== team || e.built < 1) continue;
    const r = e.def.buildRadius || 0;
    if (r && Math.hypot(e.x / T - cx, e.y / T - cy) <= r) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Commands — the ONLY way players (human or AI) change the game.
// ---------------------------------------------------------------------------

function issueCommand(game, team, cmd) {
  if (game.winner) return;
  const own = id => { const e = game.byId.get(id); return e && e.team === team && e.hp > 0 ? e : null; };
  const units = (cmd.ids || []).map(own).filter(e => e && e.kind === 'unit');

  switch (cmd.type) {
    case 'move': {
      const slots = formationSlots(game, cmd.x, cmd.y, units);
      units.forEach((u, i) => {
        u.order = { type: 'move', gx: slots[i].x, gy: slots[i].y, attackMove: !!cmd.attackMove };
        u.target = null;
        planPath(game, u, slots[i].x, slots[i].y);
      });
      break;
    }
    case 'attack': {
      const t = game.byId.get(cmd.targetId);
      if (!t || t.team === team) return;
      for (const u of units) if (u.def.weapon) { u.order = { type: 'attack', targetId: t.id }; u.target = t; u.path = []; u.repath = 0; }
      break;
    }
    case 'harvest': {
      const node = game.scrap.find(s => s.id === cmd.nodeId);
      if (!node) return;
      for (const u of units) if (u.def.role === 'harvester') { u.order = { type: 'harvest', nodeId: node.id, phase: 'toNode' }; planPath(game, u, node.x, node.y); }
      break;
    }
    case 'stop':
      for (const u of units) { u.order = { type: 'idle', gx: u.x, gy: u.y }; u.path = []; u.target = null; }
      break;
    case 'build': {
      const u = units.find(x => x.def.role === 'builder');
      const def = BUILDING_TYPES[cmd.building];
      if (!u || !def || def.buildable === false) return;
      const tm = game.teams[team];
      if (tm.scrap < def.cost) { pushEvent(game, team, 'Not enough scrap', 'warn'); return; }
      const check = canPlaceBuilding(game, team, cmd.building, cmd.tx, cmd.ty);
      if (!check.ok) { pushEvent(game, team, check.why, 'warn'); return; }
      tm.scrap -= def.cost;
      const b = addBuilding(game, cmd.building, team, cmd.tx, cmd.ty, false);
      u.order = { type: 'build', targetId: b.id };
      planPathNear(game, u, b);
      break;
    }
    case 'repair': {
      const b = own(cmd.targetId);
      if (!b || b.kind !== 'building') return;
      for (const u of units) if (u.def.role === 'builder') { u.order = { type: 'build', targetId: b.id }; planPathNear(game, u, b); }
      break;
    }
    case 'produce': {
      const b = own(cmd.buildingId);
      const def = UNIT_TYPES[cmd.unit];
      if (!b || b.kind !== 'building' || b.built < 1 || !def || !(b.def.produces || []).includes(cmd.unit)) return;
      const tm = game.teams[team];
      if (b.queue.length >= 5) { pushEvent(game, team, 'Build queue is full', 'warn'); return; }
      if (tm.scrap < def.cost) { pushEvent(game, team, 'Not enough scrap', 'warn'); return; }
      tm.scrap -= def.cost;
      b.queue.push(cmd.unit);
      break;
    }
    case 'cancel': {
      const b = own(cmd.buildingId);
      if (!b || b.kind !== 'building' || cmd.index >= b.queue.length) return;
      const [type] = b.queue.splice(cmd.index, 1);
      game.teams[team].scrap += UNIT_TYPES[type].cost;
      if (cmd.index === 0) b.prodTime = 0;
      break;
    }
    case 'scout': {
      // Several scouts together roam as one pack; otherwise each goes alone.
      const scouts = units.filter(u => u.def.weapon);
      if (cmd.pack && scouts.length > 1) {
        const id = game.nextPackId++;
        game.packs[id] = { target: null, chosenAt: 0, members: scouts.map(u => u.id) };
        scouts.forEach((u, i) => { u.order = { type: 'scout', packId: id, slot: i }; u.path = []; u.target = null; });
      } else {
        for (const u of scouts) { u.order = { type: 'scout', target: null, chosenAt: 0 }; u.path = []; u.target = null; }
      }
      break;
    }
    case 'patrol': {
      const route = patrolRoute(game, team);
      if (!route.length || !units.length) return;
      // Start everyone at the stop nearest the group, so they travel together.
      const cx = units.reduce((a, u) => a + u.x, 0) / units.length, cy = units.reduce((a, u) => a + u.y, 0) / units.length;
      let start = 0, bd = Infinity;
      route.forEach((p, i) => { const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; start = i; } });
      for (const u of units) if (u.def.weapon) { u.order = { type: 'patrol', stop: start }; u.path = []; u.target = null; }
      break;
    }
    case 'guard': {
      const b = own(cmd.targetId);
      if (!b || b.kind !== 'building') return;
      const guards = units.filter(u => u.def.weapon);
      const T = CONFIG.TILE;
      guards.forEach((u, i) => {
        // Spread the defenders evenly around the building.
        const a = angleTo(b, u) + (i - (guards.length - 1) / 2) * (Math.PI * 2 / Math.max(3, guards.length)) * 0.5;
        let px = b.x + Math.cos(a) * (b.radius + 60), py = b.y + Math.sin(a) * (b.radius + 60);
        const t = nearestOpenTile(game, Math.floor(px / T), Math.floor(py / T), 4);
        if (t) { px = (t.x + 0.5) * T; py = (t.y + 0.5) * T; }
        u.order = { type: 'guard', targetId: b.id, px, py }; u.target = null;
        planPath(game, u, px, py);
      });
      break;
    }
    case 'deploy': {
      const g = game.geysers.find(x => x.id === cmd.geyserId);
      const scav = units.filter(u => u.def.role === 'harvester').sort((a, b) => dist(a, g) - dist(b, g))[0];
      if (!g || !scav) return;
      if (geyserTaken(game, g)) { pushEvent(game, team, 'That geyser already has an Extractor', 'warn'); return; }
      scav.order = { type: 'deploy', geyserId: g.id }; scav.target = null;
      planPath(game, scav, g.x, g.y);
      break;
    }
    case 'rally': {
      const b = own(cmd.buildingId);
      if (b && b.kind === 'building') b.rally = { x: cmd.x, y: cmd.y };
      break;
    }
  }
}

// Spread a group out around the clicked point so they don't pile up.
function formationSlots(game, x, y, units) {
  if (units.length <= 1) return [{ x, y }];
  const spacing = 34, slots = [];
  const cols = Math.ceil(Math.sqrt(units.length));
  const rows = Math.ceil(units.length / cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let sx = x + (c - (cols - 1) / 2) * spacing, sy = y + (r - (rows - 1) / 2) * spacing;
    if (isBlockedAt(game, sx, sy)) {
      const t = nearestOpenTile(game, Math.floor(sx / CONFIG.TILE), Math.floor(sy / CONFIG.TILE), 4);
      if (t) { sx = (t.x + 0.5) * CONFIG.TILE; sy = (t.y + 0.5) * CONFIG.TILE; }
    }
    slots.push({ x: sx, y: sy });
  }
  // Give each unit the nearest remaining slot.
  const out = [];
  for (const u of units) {
    let bi = 0, bd = Infinity;
    slots.forEach((s, i) => { const d = dist(u, s); if (d < bd) { bd = d; bi = i; } });
    out.push(slots.splice(bi, 1)[0]);
  }
  return out;
}

function planPath(game, u, x, y) {
  u.path = findPath(game, u.x, u.y, x, y);
  u.stuck = 0;
}

function planPathNear(game, u, b) {
  const a = angleTo(b, u);
  const r = b.radius + u.radius + 12;
  planPath(game, u, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
}

// ---------------------------------------------------------------------------
// The main update, run TICK_RATE times per second.
// ---------------------------------------------------------------------------

function stepGame(game) {
  if (game.winner) return;
  const dt = 1 / CONFIG.TICK_RATE;
  game.tick++; game.time += dt;

  // Alternate the update order every tick so neither side always acts first.
  const order = game.tick % 2 ? game.entities.slice().reverse() : game.entities.slice();
  for (const e of order) {
    if (e.hp <= 0) continue;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.kind === 'building') updateBuilding(game, e, dt);
    else updateUnit(game, e, dt);
  }
  separateUnits(game);
  updateProjectiles(game, dt);
  removeDead(game);
  if (game.tick % 3 === 0) updateVisibility(game);
  for (const fx of game.effects) fx.t += dt;
  game.effects = game.effects.filter(fx => fx.t < fx.life);
  checkVictory(game);
}

function updateBuilding(game, b, dt) {
  if (b.built < 1) {
    // Extractors set themselves up after a Scavenger deploys.
    if (b.selfBuild) {
      b.built = Math.min(1, b.built + dt / b.def.buildTime);
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * dt / b.def.buildTime);
      if (b.built >= 1) pushEvent(game, b.team, `${b.def.name} online`, 'good', b.x, b.y);
    }
    return;
  }
  if (b.cooldown > 0) b.cooldown -= dt;  // reload the gun (towers, Recycler)
  if (b.def.income) {
    const tm = game.teams[b.team], amt = b.def.income * tm.incomeMult * dt;
    tm.scrap += amt; tm.stats.scrapGathered += amt;
  }
  if (b.queue.length) {
    const def = UNIT_TYPES[b.queue[0]];
    const count = game.entities.filter(e => e.kind === 'unit' && e.team === b.team).length;
    if (count >= CONFIG.UNIT_CAP) { b.blocked = true; }
    else {
      b.blocked = false;
      b.prodTime += dt;
      if (b.prodTime >= def.buildTime) {
        b.prodTime = 0;
        const type = b.queue.shift();
        spawnFromBuilding(game, b, type);
      }
    }
  }
  if (b.def.weapon) combatThink(game, b, dt);
}

function spawnFromBuilding(game, b, type) {
  const T = CONFIG.TILE;
  const exitY = b.team === 1 ? b.ty - 1 : b.ty + b.size;
  const exitX = b.team === 1 ? b.tx + b.size : b.tx - 1;
  const spot = nearestOpenTile(game, exitX, exitY, 6) || { x: b.tx, y: b.ty };
  const u = addUnit(game, type, b.team, (spot.x + 0.5) * T, (spot.y + 0.5) * T);
  game.teams[b.team].stats.built++;
  if (u.def.role === 'harvester') { autoHarvest(game, u); return; }
  if (b.rally) issueCommand(game, b.team, { type: 'move', ids: [u.id], x: b.rally.x, y: b.rally.y, attackMove: true });
  pushEvent(game, b.team, `${u.def.name} ready`, 'good', u.x, u.y);
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

function updateUnit(game, u, dt) {
  if (u.cooldown > 0) u.cooldown -= dt;
  const o = u.order;
  switch (o.type) {
    case 'idle': {
      if (u.def.weapon) {
        const engaged = combatThink(game, u, dt, true);
        if (!engaged && dist(u, { x: o.gx, y: o.gy }) > 40) {
          if (!u.path.length) planPath(game, u, o.gx, o.gy);
          followPath(game, u, dt);
        } else if (!engaged) u.path = [];
      } else if (u.def.role === 'harvester') {
        // Idle scavengers go back to work on any scrap nearby.
        if (!followPath(game, u, dt) || game.tick % 30 !== u.id % 30) break;
        const node = nearestScrap(game, u, 450);
        if (node) { u.order = { type: 'harvest', nodeId: node.id, phase: 'toNode' }; planPath(game, u, node.x, node.y); }
      }
      break;
    }
    case 'move': {
      let engaged = false;
      if (o.attackMove && u.def.weapon) engaged = combatThink(game, u, dt, true);
      if (!engaged) {
        if (followPath(game, u, dt)) u.order = { type: 'idle', gx: u.x, gy: u.y };
        else if (u.def.weapon) aimAtNearby(game, u, dt);
      }
      break;
    }
    case 'attack': {
      const t = game.byId.get(o.targetId);
      if (!t || t.hp <= 0 || !isVisibleTo(game, u.team, t)) { u.order = { type: 'idle', gx: u.x, gy: u.y }; u.target = null; u.path = []; break; }
      u.target = t;
      engageTarget(game, u, t, dt);
      break;
    }
    case 'harvest': updateHarvester(game, u, dt); break;
    case 'build': updateBuilder(game, u, dt); break;
    case 'scout': updateScout(game, u, dt); break;
    case 'patrol': updatePatrol(game, u, dt); break;
    case 'guard': updateGuard(game, u, dt); break;
    case 'deploy': updateDeploy(game, u, dt); break;
  }
}

const goIdle = u => { u.order = { type: 'idle', gx: u.x, gy: u.y }; u.path = []; };

// Shoot at anything in range without stopping or chasing.
function shootWhileMoving(game, u, dt) {
  const w = u.def.weapon;
  u.retarget -= dt;
  if (u.target && (u.target.hp <= 0 || edgeDist(u, u.target) > w.range || !isVisibleTo(game, u.team, u.target))) u.target = null;
  if (!u.target && u.retarget <= 0) { u.retarget = 0.4; u.target = findTarget(game, u, w.range); }
  if (u.target) aimAndFire(game, u, u.target, dt);
  else u.turret = turnToward(u.turret, u.angle, 3 * dt);
}

// --- Scouting ---------------------------------------------------------------
// Pick somewhere worth looking at: unexplored ground first, then places
// under fog that we can't currently see.
function pickScoutTarget(game, team, from) {
  const { W, H } = game.map, T = CONFIG.TILE, tm = game.teams[team];
  let best = null, bestScore = -Infinity;
  for (let k = 0; k < 40; k++) {
    const tx = 1 + Math.floor(game.rng() * (W - 2)), ty = 1 + Math.floor(game.rng() * (H - 2));
    if (isBlockedTile(game, tx, ty)) continue;
    const i = ty * W + tx, x = (tx + 0.5) * T, y = (ty + 0.5) * T;
    const d = Math.hypot(x - from.x, y - from.y);
    const score = (tm.explored[i] ? 0 : 1000) + (tm.vis[i] ? -600 : 0) - Math.abs(d - 1100) * 0.3 + game.rng() * 150;
    if (score > bestScore) { bestScore = score; best = { x, y }; }
  }
  return best;
}

function updateScout(game, u, dt) {
  const o = u.order;
  shootWhileMoving(game, u, dt);
  if (o.packId) {
    const pack = game.packs[o.packId];
    const alive = pack.members.map(id => game.byId.get(id)).filter(m => m && m.hp > 0 && m.order.packId === o.packId);
    // The pack picks a new destination once anyone arrives, or after a while.
    const arrived = pack.target && alive.some(m => dist(m, pack.target) < 110);
    if (!pack.target || arrived || game.time - pack.chosenAt > 40) {
      pack.target = pickScoutTarget(game, u.team, u); pack.chosenAt = game.time;
    }
    if (!pack.target) return;
    if (o.goal !== pack.target) {
      o.goal = pack.target;
      const a = (o.slot % 6) * Math.PI / 3, r = o.slot ? 34 : 0;
      planPath(game, u, pack.target.x + Math.cos(a) * r, pack.target.y + Math.sin(a) * r);
    }
    followPath(game, u, dt, 20);
    return;
  }
  if (!o.target || game.time - o.chosenAt > 45) {
    o.target = pickScoutTarget(game, u.team, u); o.chosenAt = game.time;
    if (o.target) planPath(game, u, o.target.x, o.target.y);
  }
  if (!o.target) return;
  if (followPath(game, u, dt, 30)) o.target = null;
}

// --- Patrolling ---------------------------------------------------------------
// A loop around all of this team's finished buildings, just outside each one.
function patrolRoute(game, team) {
  const bs = game.entities.filter(e => e.kind === 'building' && e.team === team && e.built >= 1);
  if (!bs.length) return [];
  const cx = bs.reduce((a, b) => a + b.x, 0) / bs.length, cy = bs.reduce((a, b) => a + b.y, 0) / bs.length;
  let stops = bs.map(b => {
    const a = Math.atan2(b.y - cy, b.x - cx) || 0;
    return { x: b.x + Math.cos(a) * (b.radius + 70), y: b.y + Math.sin(a) * (b.radius + 70), a };
  });
  if (stops.length === 1) {
    const b = bs[0];
    stops = [0, 1, 2, 3].map(k => ({ x: b.x + Math.cos(k * Math.PI / 2) * (b.radius + 110), y: b.y + Math.sin(k * Math.PI / 2) * (b.radius + 110), a: k }));
  }
  return stops.sort((p, q) => p.a - q.a);
}

function updatePatrol(game, u, dt) {
  const o = u.order;
  if (combatThink(game, u, dt, true)) { o.moving = false; return; }
  const route = patrolRoute(game, u.team);
  if (!route.length) { goIdle(u); return; }
  const stop = route[o.stop % route.length];
  if (!o.moving || !u.path.length) { planPath(game, u, stop.x, stop.y); o.moving = true; }
  if (followPath(game, u, dt, 24)) { o.stop = (o.stop + 1) % route.length; o.moving = false; }
  else aimAtNearby(game, u, dt);
}

// --- Defending a building -------------------------------------------------------
// Hold a post beside the building and fire at anything in range. No chasing.
function updateGuard(game, u, dt) {
  const o = u.order, b = game.byId.get(o.targetId);
  if (!b || b.hp <= 0) { goIdle(u); return; }
  const w = u.def.weapon;
  u.retarget -= dt;
  if (u.target && (u.target.hp <= 0 || !isVisibleTo(game, u.team, u.target) || edgeDist(u, u.target) > w.range ||
      (w.minRange && edgeDist(u, u.target) < w.minRange))) u.target = null;
  if (!u.target && u.retarget <= 0) { u.retarget = 0.4 + game.rng() * 0.2; u.target = findTarget(game, u, w.range); }
  if (Math.hypot(u.x - o.px, u.y - o.py) > 30) {
    if (!u.path.length) planPath(game, u, o.px, o.py);
    followPath(game, u, dt, 12);
    if (u.target) aimAndFire(game, u, u.target, dt);
    return;
  }
  u.path = [];
  if (u.target) aimAndFire(game, u, u.target, dt);
  else u.turret = turnToward(u.turret, angleTo(b, u), 2 * dt);
}

// --- Scavenger deploying onto a geyser -------------------------------------------
function geyserTaken(game, g) {
  const b = g.extractorId && game.byId.get(g.extractorId);
  return !!(b && b.hp > 0);
}

function updateDeploy(game, u, dt) {
  const g = game.geysers.find(x => x.id === u.order.geyserId);
  if (!g || geyserTaken(game, g)) { pushEvent(game, u.team, 'Geyser already taken', 'warn', u.x, u.y); goIdle(u); return; }
  if (dist(u, g) > 28) {
    if (followPath(game, u, dt, 10) && dist(u, g) > 60) planPath(game, u, g.x, g.y);
    return;
  }
  const tx = g.tx - 1, ty = g.ty - 1;
  for (let y = ty; y < ty + 2; y++) for (let x = tx; x < tx + 2; x++) {
    if (isBlockedTile(game, x, y)) { pushEvent(game, u.team, 'Something is blocking the geyser', 'warn', u.x, u.y); goIdle(u); return; }
  }
  const b = addBuilding(game, 'extractor', u.team, tx, ty, false);
  b.selfBuild = true; b.geyserId = g.id;
  g.extractorId = b.id;
  u.hp = 0; u.deployed = true;  // the Scavenger becomes the Extractor
  pushEvent(game, u.team, 'Scavenger deploying as an Extractor', 'good', b.x, b.y);
}

// Move along the current path. Returns true once the end is reached.
function followPath(game, u, dt, stopDist = 6) {
  if (!u.path.length) return true;
  const wp = u.path[0];
  const d = dist(u, wp);
  const last = u.path.length === 1;
  if (d < (last ? stopDist : 14)) { u.path.shift(); return u.path.length === 0; }
  const want = angleTo(u, wp);
  u.angle = turnToward(u.angle, want, 5 * dt);
  const facing = Math.cos(wrapAngle(want - u.angle));
  const step = Math.min(d, u.def.speed * dt * Math.max(0.25, facing));
  const ox = u.x, oy = u.y;
  moveWithCollision(game, u, Math.cos(want) * step, Math.sin(want) * step);
  const moved = Math.hypot(u.x - ox, u.y - oy);
  if (moved < step * 0.3) u.stuck += dt; else u.stuck = Math.max(0, u.stuck - dt);
  if (u.stuck > 1.2) {
    const goal = u.path[u.path.length - 1];
    if (u.stuck > 3.5 || dist(u, goal) < 50) { u.path = []; u.stuck = 0; return true; }
    u.path = findPath(game, u.x, u.y, goal.x, goal.y);
    u.stuck = 1.21 + (u.stuck - 1.2) * 0.5;
  }
  return false;
}

function moveWithCollision(game, u, dx, dy) {
  const wasBlocked = isBlockedAt(game, u.x, u.y);
  const nx = u.x + dx, ny = u.y + dy;
  if (wasBlocked || !isBlockedAt(game, nx, ny)) { u.x = nx; u.y = ny; return; }
  if (!isBlockedAt(game, nx, u.y)) { u.x = nx; return; }
  if (!isBlockedAt(game, u.x, ny)) { u.y = ny; }
}

// Keep units from overlapping each other or driving inside buildings.
function separateUnits(game) {
  const units = game.entities.filter(e => e.kind === 'unit' && e.hp > 0);
  if (game.tick % 2) units.reverse();
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = a.radius + b.radius;
      if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d < min) {
        const push = (min - d) * 0.3, px = dx / d * push, py = dy / d * push;
        moveWithCollision(game, a, -px, -py);
        moveWithCollision(game, b, px, py);
      }
    }
  }
  // Nudge units that ended up inside a building's footprint back out.
  for (const u of units) {
    if (!isBlockedAt(game, u.x, u.y)) continue;
    const T = CONFIG.TILE;
    const t = nearestOpenTile(game, Math.floor(u.x / T), Math.floor(u.y / T), 5);
    if (t) {
      const a = angleTo(u, { x: (t.x + 0.5) * T, y: (t.y + 0.5) * T });
      u.x += Math.cos(a) * 3; u.y += Math.sin(a) * 3;
    }
  }
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

function isVisibleTo(game, team, e) {
  if (e.team === team) return true;
  const T = CONFIG.TILE, W = game.map.W;
  if (e.kind === 'building') {
    for (let y = e.ty; y < e.ty + e.size; y++) for (let x = e.tx; x < e.tx + e.size; x++)
      if (game.teams[team].vis[y * W + x]) return true;
    return false;
  }
  const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T);
  return game.teams[team].vis[ty * W + tx] === 1;
}

// Distance between the edges of two things, so a gun on a big building
// reaches as far past its walls as a vehicle's gun does.
function edgeDist(a, b) {
  const edge = e => e.kind === 'building' ? e.radius * 0.8 : 0;
  return Math.max(0, dist(a, b) - edge(a) - edge(b));
}

// Pick the best nearby enemy. Prefers things that can shoot back.
function findTarget(game, e, radius) {
  let best = null, bestScore = Infinity;
  const w = e.def.weapon;
  for (const o of game.entities) {
    if (o.team === e.team || o.hp <= 0) continue;
    const d = edgeDist(e, o);
    if (d > radius || (w.minRange && d < w.minRange)) continue;
    if (!isVisibleTo(game, e.team, o)) continue;
    let score = d;
    if (o.kind === 'building') score += o.def.weapon ? 40 : 200;
    else if (!o.def.weapon) score += 120;
    if (o === e.lastHitBy) score -= 150;
    if (score < bestScore) { bestScore = score; best = o; }
  }
  return best;
}

// Look for, chase and shoot enemies. Returns true if busy fighting.
function combatThink(game, e, dt, canChase = false) {
  const w = e.def.weapon;
  e.retarget -= dt;
  if (e.target && (e.target.hp <= 0 || !isVisibleTo(game, e.team, e.target))) e.target = null;
  if (e.target && edgeDist(e, e.target) > (canChase ? e.def.sight : w.range)) e.target = null;
  if (e.retarget <= 0) {
    e.retarget = 0.4 + game.rng() * 0.2;
    const radius = canChase ? e.def.sight : w.range;
    const t = findTarget(game, e, radius);
    if (t && (!e.target || edgeDist(e, t) < edgeDist(e, e.target) - 60)) e.target = t;
  }
  if (!e.target) return false;
  if (e.kind === 'building') { aimAndFire(game, e, e.target, dt); return true; }
  // Idle units only chase a limited distance from where they were told to stand.
  if (e.order.type === 'idle' && dist(e.target, { x: e.order.gx, y: e.order.gy }) > w.range + 220) { e.target = null; return false; }
  engageTarget(game, e, e.target, dt);
  return true;
}

function engageTarget(game, u, t, dt) {
  const w = u.def.weapon, d = edgeDist(u, t);
  if (d > w.range * 0.92) {
    u.repath = (u.repath || 0) - dt;
    if (!u.path.length || u.repath <= 0) { u.repath = 0.8; planPath(game, u, t.x, t.y); }
    followPath(game, u, dt, w.range * 0.8);
    aimAtNearby(game, u, dt);
  } else {
    u.path = [];
    aimAndFire(game, u, t, dt);
  }
}

// While driving, point the gun at anything in range and shoot it.
function aimAtNearby(game, u, dt) {
  const t = u.target && edgeDist(u, u.target) <= u.def.weapon.range ? u.target : null;
  if (t) aimAndFire(game, u, t, dt);
  else u.turret = turnToward(u.turret, u.angle, 3 * dt);
}

function aimAndFire(game, e, t, dt) {
  const w = e.def.weapon;
  const d = edgeDist(e, t);
  const want = angleTo(e, t);
  e.turret = turnToward(e.turret, want, 4 * dt);
  if (e.cooldown > 0 || d > w.range || (w.minRange && d < w.minRange)) return;
  if (Math.abs(wrapAngle(want - e.turret)) > 0.25) return;
  e.cooldown = w.cooldown;
  const mx = e.x + Math.cos(e.turret) * (e.radius + 4), my = e.y + Math.sin(e.turret) * (e.radius + 4);
  const p = { kind: w.projectile, team: e.team, owner: e.id, x: mx, y: my, sx: mx, sy: my, damage: w.damage, splash: w.splash || 0, vsBuilding: w.vsBuilding };
  if (w.projectile === 'artillery') {
    const spread = 20 + d * 0.06;
    p.tx = t.x + (game.rng() - 0.5) * spread; p.ty = t.y + (game.rng() - 0.5) * spread;
    p.speed = 260; p.total = Math.hypot(p.tx - mx, p.ty - my);
  } else {
    p.targetId = t.id; p.tx = t.x; p.ty = t.y;
    p.speed = w.projectile === 'bullet' ? 900 : 620;
  }
  game.projectiles.push(p);
  game.effects.push({ kind: 'flash', x: mx, y: my, a: e.turret, t: 0, life: 0.08, big: w.projectile !== 'bullet' });
  game.events.push({ sound: w.projectile, x: mx, y: my });
}

function updateProjectiles(game, dt) {
  for (const p of game.projectiles) {
    if (p.targetId) {
      const t = game.byId.get(p.targetId);
      if (t && t.hp > 0) { p.tx = t.x; p.ty = t.y; }
    }
    const d = Math.hypot(p.tx - p.x, p.ty - p.y), step = p.speed * dt;
    if (d <= step) {
      p.done = true;
      if (p.kind === 'artillery') {
        for (const o of game.entities) {
          if (o.hp <= 0 || o.team === p.team) continue;
          const od = Math.max(0, Math.hypot(o.x - p.tx, o.y - p.ty) - o.radius * 0.5);
          if (od < p.splash) damage(game, o, p.damage * (1 - 0.6 * od / p.splash), p);
        }
        game.effects.push({ kind: 'boom', x: p.tx, y: p.ty, t: 0, life: 0.6, size: p.splash });
        game.events.push({ sound: 'boom', x: p.tx, y: p.ty });
      } else {
        const t = game.byId.get(p.targetId);
        if (t && t.hp > 0) damage(game, t, p.damage, p);
        game.effects.push({ kind: 'spark', x: p.tx, y: p.ty, t: 0, life: 0.25, big: p.kind === 'shell' });
      }
    } else {
      p.x += (p.tx - p.x) / d * step; p.y += (p.ty - p.y) / d * step;
    }
  }
  game.projectiles = game.projectiles.filter(p => !p.done);
}

function damage(game, e, amount, p) {
  if (e.kind === 'building') amount *= p.vsBuilding || 1;
  e.hp -= amount;
  e.hitFlash = 0.1;
  const shooter = game.byId.get(p.owner);
  if (shooter && shooter.hp > 0) e.lastHitBy = shooter;
  // Fight back if we were just standing around.
  if (e.kind === 'unit' && e.def.weapon && shooter && e.order.type === 'idle' && !e.target) e.target = shooter;
  if (e.kind === 'unit' && !e.def.weapon && shooter && e.hp > 0) warnUnderAttack(game, e);
  if (e.kind === 'building' && e.hp > 0) warnUnderAttack(game, e);
}

function warnUnderAttack(game, e) {
  const tm = game.teams[e.team];
  if (game.time - (tm.lastAlarm || -99) < 12) return;
  tm.lastAlarm = game.time;
  pushEvent(game, e.team, `${e.def.name} under attack!`, 'bad', e.x, e.y);
}

function removeDead(game) {
  const dead = game.entities.filter(e => e.hp <= 0);
  if (!dead.length) return;
  for (const e of dead) {
    game.byId.delete(e.id);
    if (e.deployed) continue;
    if (e.kind === 'building') {
      if (e.geyserId) { const g = game.geysers.find(x => x.id === e.geyserId); if (g) g.extractorId = 0; }
      setOccupied(game, e, -1);
      game.effects.push({ kind: 'boom', x: e.x, y: e.y, t: 0, life: 1.2, size: e.radius * 1.6 });
      pushEvent(game, e.team, `${e.def.name} destroyed`, 'bad', e.x, e.y);
      pushEvent(game, 3 - e.team, `Enemy ${e.def.name} destroyed`, 'good', e.x, e.y);
    } else {
      game.effects.push({ kind: 'boom', x: e.x, y: e.y, t: 0, life: 0.7, size: e.radius * 2.2 });
      game.effects.push({ kind: 'wreck', x: e.x, y: e.y, a: e.angle, t: 0, life: 20, r: e.radius });
      const salvage = Math.round(e.def.cost * CONFIG.WRECK_SCRAP_FRACTION);
      if (salvage > 0) game.scrap.push({ id: 100000 + e.id, x: e.x, y: e.y, amount: salvage, max: salvage, wreck: true });
      game.teams[e.team].stats.lost++;
      game.teams[3 - e.team].stats.killed++;
    }
    game.events.push({ sound: 'boom', x: e.x, y: e.y, big: e.kind === 'building' });
  }
  game.entities = game.entities.filter(e => e.hp > 0);
  for (const e of game.entities) {
    if (e.target && e.target.hp <= 0) e.target = null;
    if (e.lastHitBy && e.lastHitBy.hp <= 0) e.lastHitBy = null;
  }
}

// ---------------------------------------------------------------------------
// Scavengers and constructors
// ---------------------------------------------------------------------------

function nearestScrap(game, u, maxDist = Infinity) {
  let best = null, bd = maxDist;
  for (const s of game.scrap) {
    if (s.amount <= 0) continue;
    if (!game.teams[u.team].explored[Math.floor(s.y / CONFIG.TILE) * game.map.W + Math.floor(s.x / CONFIG.TILE)]) continue;
    // Stay away from scrap that enemy combat units are sitting on.
    const d = dist(u, s);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function nearestDropoff(game, u) {
  let best = null, bd = Infinity;
  for (const e of game.entities) {
    if (e.kind !== 'building' || e.team !== u.team || !e.def.dropoff || e.built < 1) continue;
    const d = dist(u, e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function autoHarvest(game, u) {
  const node = nearestScrap(game, u);
  if (node) { u.order = { type: 'harvest', nodeId: node.id, phase: 'toNode' }; planPath(game, u, node.x, node.y); }
  else u.order = { type: 'idle', gx: u.x, gy: u.y };
}

function updateHarvester(game, u, dt) {
  const o = u.order;
  if (o.phase === 'toNode' || o.phase === 'gather') {
    let node = game.scrap.find(s => s.id === o.nodeId && s.amount > 0);
    if (!node) {
      if (u.carry > 0 && u.carry >= u.def.carryMax * 0.5) { o.phase = 'return'; u.path = []; return; }
      node = nearestScrap(game, u, 900);
      if (!node) { o.phase = u.carry > 0 ? 'return' : 'wait'; u.path = []; return; }
      o.nodeId = node.id; o.phase = 'toNode'; planPath(game, u, node.x, node.y);
    }
    if (o.phase === 'toNode') {
      if (dist(u, node) < 22 || followPath(game, u, dt, 16)) {
        if (dist(u, node) < 40) o.phase = 'gather';
        else planPath(game, u, node.x, node.y);
      }
    } else {
      const take = Math.min(u.def.gatherRate * dt, node.amount, u.def.carryMax - u.carry);
      node.amount -= take; u.carry += take;
      if (game.tick % 8 === 0) game.effects.push({ kind: 'dust', x: node.x + (Math.random() - 0.5) * 16, y: node.y + (Math.random() - 0.5) * 16, t: 0, life: 0.5 });
      if (node.amount <= 0) game.scrap = game.scrap.filter(s => s !== node);
      if (u.carry >= u.def.carryMax - 0.01) { o.phase = 'return'; u.path = []; }
    }
  } else if (o.phase === 'return') {
    const drop = nearestDropoff(game, u);
    if (!drop) { o.phase = 'wait'; return; }
    if (!u.path.length) planPathNear(game, u, drop);
    const arrived = followPath(game, u, dt, 12);
    if (edgeDist(u, drop) < drop.radius * 0.4 + u.radius + 20 || (arrived && edgeDist(u, drop) < 70)) {
      const tm = game.teams[u.team];
      const amt = u.carry * tm.incomeMult;
      tm.scrap += amt; tm.stats.scrapGathered += amt;
      u.carry = 0;
      o.phase = 'toNode';
      const node = game.scrap.find(s => s.id === o.nodeId && s.amount > 0) || nearestScrap(game, u);
      if (node) { o.nodeId = node.id; planPath(game, u, node.x, node.y); } else o.phase = 'wait';
    } else if (arrived) planPathNear(game, u, drop);
  } else if (o.phase === 'wait') {
    if (game.tick % 30 === u.id % 30) {
      const node = nearestScrap(game, u);
      if (node) { o.nodeId = node.id; o.phase = 'toNode'; planPath(game, u, node.x, node.y); }
      else if (u.carry > 0) o.phase = 'return';
    }
  }
}

function updateBuilder(game, u, dt) {
  const b = game.byId.get(u.order.targetId);
  if (!b || b.hp <= 0 || (b.built >= 1 && b.hp >= b.maxHp)) { u.order = { type: 'idle', gx: u.x, gy: u.y }; u.path = []; return; }
  const close = edgeDist(u, b) < b.radius * 0.2 + u.radius + 30;
  if (!close) {
    if (followPath(game, u, dt, 10)) planPathNear(game, u, b);
    return;
  }
  u.path = [];
  u.angle = turnToward(u.angle, angleTo(u, b), 4 * dt);
  if (game.tick % 5 === 0) game.effects.push({ kind: 'weld', x: b.x + (Math.random() - 0.5) * b.radius * 1.4, y: b.y + (Math.random() - 0.5) * b.radius * 1.4, t: 0, life: 0.3 });
  if (b.built < 1) {
    const step = dt / b.def.buildTime;
    b.built = Math.min(1, b.built + step);
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * step);
    if (b.built >= 1) {
      pushEvent(game, b.team, `${b.def.name} complete`, 'good', b.x, b.y);
      if (!b.rally && b.def.produces) b.rally = { x: b.x + (b.team === 1 ? 80 : -80), y: b.y + (b.team === 1 ? -80 : 80) };
    }
  } else {
    b.hp = Math.min(b.maxHp, b.hp + u.def.repairRate * dt);
  }
}

// ---------------------------------------------------------------------------
// Vision and victory
// ---------------------------------------------------------------------------

function updateVisibility(game) {
  const T = CONFIG.TILE, W = game.map.W, H = game.map.H;
  for (const t of [1, 2]) game.teams[t].vis.fill(0);
  for (const e of game.entities) {
    if (e.kind === 'building' && e.built < 1 && e.built < 0.05) continue;
    const tm = game.teams[e.team];
    const r = e.def.sight / T, cx = e.x / T, cy = e.y / T;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.floor(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.floor(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) {
        tm.vis[y * W + x] = 1; tm.explored[y * W + x] = 1;
      }
    }
  }
  // Remember enemy buildings once you've seen them.
  for (const e of game.entities) if (e.kind === 'building') for (const t of [1, 2]) if (t !== e.team && isVisibleTo(game, t, e)) e.seen[t] = true;
}

function checkVictory(game) {
  for (const t of [1, 2]) {
    // The one rule of victory: destroy the enemy Recycler.
    if (!game.entities.some(e => e.team === t && e.type === 'recycler')) {
      game.winner = 3 - t; game.endReason = `${TEAMS[t].name} lost their Recycler.`; return;
    }
  }
}
