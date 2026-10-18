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

// The basic kind of a unit: a Tank Mk II is still a 'tank', a Scavenger II a 'scavenger'.
const baseType = e => (e.def && e.def.base) || e.type;
// A building's name, including its upgrade (e.g. 'Factory II').
const nameOf = e => (e.level > 1 && e.def.upgrade) ? e.def.upgrade.name : e.def.name;
// What a building can make right now (upgraded buildings make more).
const producesOf = b => (b.level > 1 && b.def.upgrade && b.def.upgrade.produces) || b.def.produces || [];

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
  // Which corner each side starts in is decided at random for every game,
  // so neither side can count on a favourable spot.
  const swap = makeRng(seed * 31 + 7)() < 0.5;
  game.corner = { 1: swap ? 2 : 1, 2: swap ? 1 : 2 };
  for (const t of [1, 2]) {
    game.teams[t] = {
      id: t, scrap: CONFIG.START_SCRAP,
      vis: new Uint8Array(map.W * map.H), explored: new Uint8Array(map.W * map.H),
      incomeMult: aiTeams.includes(t) ? DIFFICULTY[difficulty].incomeMult : 1,
      stats: { built: 0, lost: 0, killed: 0, scrapGathered: 0 },
      research: {},  // key -> true once researched
      pings: [],     // active radar reveals: { x, y, r, until }
    };
    // Everyone starts on wheels: the Recycler must be deployed on a geyser.
    const b = map.bases[game.corner[t]];
    const home = { x: (b.x + 0.5) * CONFIG.TILE, y: (b.y + 0.5) * CONFIG.TILE };
    const dir = game.corner[t] === 1 ? 1 : -1;
    const spawn = (type, ox, oy) => addUnit(game, type, t, home.x + ox * dir * CONFIG.TILE, home.y + oy * dir * CONFIG.TILE);
    spawn('mobileRecycler', 0, -1.5);
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

// New things face the middle of the map, whichever corner they're in.
function faceCentre(game, x, y) {
  return Math.atan2(game.map.H * CONFIG.TILE / 2 - y, game.map.W * CONFIG.TILE / 2 - x);
}

function addUnit(game, type, team, x, y) {
  const def = UNIT_TYPES[type];
  const u = {
    id: game.nextId++, kind: 'unit', type, def, team, x, y,
    hp: def.hp, maxHp: def.hp, radius: def.radius,
    angle: faceCentre(game, x, y), turret: 0,
    order: { type: 'idle', gx: x, gy: y }, path: [], target: null,
    cooldown: 0, carry: 0, stuck: 0, retarget: 0, lastHitBy: null, hitFlash: 0,
    shield: def.shield || 0, shieldWait: 0, shieldFlash: 0,
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
    built: complete ? 1 : 0, queue: [], prodTime: 0, stored: 0, level: 1,
    upgrading: null, researching: null, pingTimer: 0,
    rally: null, cooldown: 0, turret: faceCentre(game, (tx + def.size / 2) * T, (ty + def.size / 2) * T),
    target: null, retarget: 0, hitFlash: 0, seen: {},
  };
  setOccupied(game, b, 1);
  game.entities.push(b); game.byId.set(b.id, b);
  return b;
}

function setOccupied(game, b, delta) {
  if (b.def.walkable) return;  // vehicles drive over repair pads
  for (let y = b.ty; y < b.ty + b.size; y++)
    for (let x = b.tx; x < b.tx + b.size; x++) game.occupied[y * game.map.W + x] += delta;
}

function pushEvent(game, team, text, kind = 'info', x, y) {
  game.events.push({ team, text, kind, x, y, time: game.time });
}

// ---------------------------------------------------------------------------
// Scrap storage. A team can only hold as much scrap as its Recycler and Base
// Silos have room for. Anything that would go over the limit waits outside.
// ---------------------------------------------------------------------------

function scrapCapacity(game, team) {
  let cap = 0;
  for (const e of game.entities) {
    if (e.team !== team || !e.def.capacity) continue;
    // A Recycler holds your scrap even while driving or deploying.
    if (e.kind === 'unit' || e.type === 'recycler' || e.built >= 1) cap += e.def.capacity;
  }
  return cap;
}

// Adds up to `amount` scrap to the team's bank. Returns how much fitted.
function bankScrap(game, team, amount, quiet = false) {
  const tm = game.teams[team];
  const room = Math.max(0, scrapCapacity(game, team) - tm.scrap);
  const added = Math.min(room, amount);
  tm.scrap += added; tm.stats.scrapGathered += added;
  if (!quiet && added < amount && game.time - (tm.lastFullWarn || -99) > 20) {
    tm.lastFullWarn = game.time;
    pushEvent(game, team, 'Scrap storage full. Build a Base Silo next to your Recycler.', 'warn');
  }
  return added;
}

// What recycling a vehicle on a Repair Pad gives back: half its cost.
const recycleValue = u => Math.round(u.def.cost * 0.5);

const isBank = b => b.kind === 'building' && b.built >= 1 && !!b.def.capacity;

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
  // Repair pads don't block vehicles, but nothing can be built on top of one.
  for (const e of game.entities) {
    if (e.kind === 'building' && e.def.walkable &&
        tx < e.tx + e.size && e.tx < tx + def.size && ty < e.ty + e.size && e.ty < ty + def.size)
      return { ok: false, why: 'Something is in the way' };
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
  if (def.adjacent) {
    // Must touch one of your finished Extractors (a gap of at most one square).
    const touching = game.entities.some(e => e.team === team && e.type === def.placeNear && e.built >= 1 && footprintGap(e, tx, ty, def.size) <= 1);
    if (!touching) return { ok: false, why: `${def.name}s must be joined right onto one of your Extractors` };
  } else if (def.placeNear) {
    const T = CONFIG.TILE;
    const near = game.entities.some(e => e.team === team && e.type === def.placeNear && e.built >= 1 &&
      Math.hypot(e.x / T - cx, e.y / T - cy) <= def.placeRange + e.size / 2);
    if (!near) return { ok: false, why: `${def.name}s must be built next to ${def.placeNear === 'recycler' ? 'your Recycler' : 'one of your Extractors'}` };
  }
  if (!inTerritory(game, team, cx, cy)) return { ok: false, why: 'Outside your territory. Build a Scrap Silo near the edge to expand it.' };
  return { ok: true };
}

// Squares of empty ground between a building and a footprint (0 = touching).
function footprintGap(b, tx, ty, size) {
  const gx = Math.max(0, b.tx - (tx + size), tx - (b.tx + b.size));
  const gy = Math.max(0, b.ty - (ty + size), ty - (b.ty + b.size));
  return Math.max(gx, gy);
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
  // Any new order ends a trip to the Repair Pad (Go repair sets it again below).
  for (const u of units) u.repairTrip = 0;

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
      // Finishing construction is any Constructor's job; repairing needs a Constructor II.
      const able = units.filter(u => u.def.role === 'builder' && (b.built < 1 || u.def.canRepair));
      if (!able.length && units.some(u => u.def.role === 'builder')) { pushEvent(game, team, 'Only a Constructor II can repair buildings', 'warn'); return; }
      for (const u of able) { u.order = { type: 'build', targetId: b.id }; planPathNear(game, u, b); }
      break;
    }
    case 'produce': {
      const b = own(cmd.buildingId);
      const def = UNIT_TYPES[cmd.unit];
      if (!b || b.kind !== 'building' || b.built < 1 || !def || !producesOf(b).includes(cmd.unit)) return;
      const tm = game.teams[team];
      if (def.requires && !tm.research[def.requires]) { pushEvent(game, team, `Research ${RESEARCH[def.requires].name} at a Research Lab first`, 'warn'); return; }
      // Queues can be as long as you like. Each vehicle is paid for when its
      // turn comes (see updateBuilding), so a long queue just waits for scrap.
      if (b.queue.length >= CONFIG.QUEUE_MAX) { pushEvent(game, team, 'Build queue is full', 'warn'); return; }
      const n = Math.max(1, Math.min(cmd.count || 1, CONFIG.QUEUE_MAX - b.queue.length));
      for (let i = 0; i < n; i++) b.queue.push(cmd.unit);
      break;
    }
    case 'cancel': {
      // Removes one vehicle from the queue: the last one of `unit` if given
      // (so the one already being built goes last), otherwise the one at
      // `index`. Only the one being built has been paid for, and only it is
      // refunded.
      const b = own(cmd.buildingId);
      if (!b || b.kind !== 'building' || !b.queue.length) return;
      const index = cmd.unit ? b.queue.lastIndexOf(cmd.unit) : cmd.index;
      if (index < 0 || index >= b.queue.length) return;
      const [type] = b.queue.splice(index, 1);
      if (index === 0) {
        if (b.paid) bankScrap(game, team, UNIT_TYPES[type].cost);
        b.paid = false; b.prodTime = 0;
      }
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
      // The mobile Recycler takes priority; otherwise the nearest Scavenger goes.
      const hqs = units.filter(u => u.def.role === 'hq');
      const deployers = hqs.length ? hqs : units.filter(u => u.def.canDeploy);
      if (!deployers.length && units.some(u => u.def.role === 'harvester')) {
        pushEvent(game, team, 'Only a Scavenger II can deploy on a geyser. Upgrade your Recycler to build them.', 'warn'); return;
      }
      const scav = deployers.sort((a, b) => dist(a, g) - dist(b, g))[0];
      if (!g || !scav) return;
      if (geyserTaken(game, g)) { pushEvent(game, team, 'That geyser already has an Extractor', 'warn'); return; }
      scav.order = { type: 'deploy', geyserId: g.id }; scav.target = null;
      planPath(game, scav, g.x, g.y);
      break;
    }
    case 'upgrade': {
      const b = own(cmd.buildingId);
      if (!b || b.kind !== 'building' || b.built < 1 || !b.def.upgrade || b.level > 1 || b.upgrading !== null) return;
      const tm = game.teams[team], up = b.def.upgrade;
      if (tm.scrap < up.cost) { pushEvent(game, team, 'Not enough scrap', 'warn'); return; }
      tm.scrap -= up.cost;
      b.upgrading = 0;
      pushEvent(game, team, `Upgrading to ${up.name}`, 'info', b.x, b.y);
      break;
    }
    case 'research': {
      const b = own(cmd.buildingId), r = RESEARCH[cmd.key];
      if (!b || b.kind !== 'building' || b.built < 1 || !r || !(b.def.researches || []).includes(cmd.key)) return;
      const tm = game.teams[team];
      if (b.researching) { pushEvent(game, team, 'This lab is already researching', 'warn'); return; }
      const busy = game.entities.some(e => e.team === team && e.researching && e.researching.key === cmd.key);
      if (tm.research[cmd.key] || busy) return;
      if (tm.scrap < r.cost) { pushEvent(game, team, 'Not enough scrap', 'warn'); return; }
      tm.scrap -= r.cost;
      b.researching = { key: cmd.key, t: 0 };
      break;
    }
    case 'gorepair': {
      // Drive to the nearest Repair Pad and park on it.
      const pads = game.entities.filter(e => e.team === team && e.type === 'repairpad' && e.built >= 1);
      if (!pads.length) { pushEvent(game, team, 'Build a Repair Pad first', 'warn'); return; }
      if (!units.length) return;
      const cx = units.reduce((a, u) => a + u.x, 0) / units.length, cy = units.reduce((a, u) => a + u.y, 0) / units.length;
      const pad = pads.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
      issueCommand(game, team, { type: 'move', ids: units.map(u => u.id), x: pad.x, y: pad.y });
      // Remember the trip, so they drive off again once repaired.
      for (const u of units) u.repairTrip = pad.id;
      break;
    }
    case 'rally': {
      const b = own(cmd.buildingId);
      if (b && b.kind === 'building') b.rally = cmd.clear ? null : { x: cmd.x, y: cmd.y };
      break;
    }
    case 'recycle': {
      // Only vehicles parked on one of your Repair Pads can be recycled, and
      // never the Recycler. Half the cost goes back into storage (the same
      // share as demolishing); anything that doesn't fit is left on the pad
      // as loose scrap.
      let value = 0, count = 0, at = null;
      for (const u of units) {
        if (u.def.role === 'hq' || !(u.def.cost > 0)) continue;
        const pad = padUnder(game, u);
        if (!pad) continue;
        const refund = recycleValue(u);
        const banked = bankScrap(game, team, refund, true);
        if (refund - banked > 0) game.scrap.push({ id: 300000 + u.id, x: u.x, y: u.y, amount: refund - banked, max: refund - banked, wreck: true });
        u.recycled = true; u.hp = 0;
        value += refund; count++; at = pad;
      }
      if (!count) { pushEvent(game, team, 'Only vehicles parked on a Repair Pad can be recycled', 'warn'); return; }
      pushEvent(game, team, `${count > 1 ? count + ' vehicles' : 'Vehicle'} recycled for ${value} scrap`, 'good', at.x, at.y);
      break;
    }
    case 'demolish': {
      const b = own(cmd.buildingId);
      if (!b || b.kind !== 'building' || b.def.demolishable === false) return;
      b.demolished = true; b.hp = 0;
      break;
    }
  }
}

// Spread a group out around the clicked point so they don't pile up.
// Like route-finding, this always works from the same half of the map so
// both sides get mirror-image results.
function formationSlots(game, x, y, units) {
  if (units.length <= 1) return [{ x, y }];
  const cx = units.reduce((a, u) => a + u.x, 0) / units.length, cy = units.reduce((a, u) => a + u.y, 0) / units.length;
  if (inMirroredHalf(game, cx, cy)) {
    const WW = game.map.W * CONFIG.TILE, HH = game.map.H * CONFIG.TILE;
    const flipped = units.map(u => ({ x: WW - u.x, y: HH - u.y }));
    return formationSlotsOn(mirroredView(game), WW - x, HH - y, flipped).map(p => ({ x: WW - p.x, y: HH - p.y }));
  }
  return formationSlotsOn(game, x, y, units);
}

function formationSlotsOn(game, x, y, units) {
  const spacing = 34, slots = [], used = new Set();
  const T = CONFIG.TILE;
  const cols = Math.ceil(Math.sqrt(units.length));
  const rows = Math.ceil(units.length / cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let sx = x + (c - (cols - 1) / 2) * spacing, sy = y + (r - (rows - 1) / 2) * spacing;
    if (isBlockedAt(game, sx, sy)) {
      // Move the slot to the nearest open square no other slot has taken.
      const tx = Math.floor(sx / T), ty = Math.floor(sy / T);
      let best = null, bd = Infinity;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const nx = tx + dx, ny = ty + dy, d = dx * dx + dy * dy;
        if (d < bd && !isBlockedTile(game, nx, ny) && !used.has(nx + ',' + ny)) { bd = d; best = { x: nx, y: ny }; }
      }
      if (best) { used.add(best.x + ',' + best.y); sx = (best.x + 0.5) * T; sy = (best.y + 0.5) * T; }
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
  // Don't search again straight away for the same spot: many orders ask for a
  // new route every tick while they have none, and on the big map a route
  // that can't be found costs a whole-map search. A failed search waits 2 s
  // before retrying; any other repeat waits half a second.
  const last = u.lastPlan;
  if (last && Math.abs(last.x - x) < 16 && Math.abs(last.y - y) < 16 && game.time - last.t < (last.failed ? 2 : 0.5)) {
    u.path = []; u.stuck = 0;
    return;
  }
  u.path = findPath(game, u.x, u.y, x, y);
  u.lastPlan = { x, y, t: game.time, failed: !u.path.length };
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
  // Losing a Base Silo loses whatever no longer fits.
  if (game.tick % 15 === 0) for (const t of [1, 2]) game.teams[t].scrap = Math.min(game.teams[t].scrap, scrapCapacity(game, t));

  // Shuffle the update order every tick so neither side can get a steady
  // head start from always acting first (or last) on some kind of tick.
  const order = shuffled(game, game.entities);
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

// A copy of the list in random order, using the game's seeded randomness so a
// replay (or the other player's computer, online) gets the same order.
function shuffled(game, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(game.rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function updateBuilding(game, b, dt) {
  if (b.built < 1) {
    // Extractors set themselves up after a Scavenger deploys.
    if (b.selfBuild) {
      b.built = Math.min(1, b.built + dt / b.def.buildTime);
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * dt / b.def.buildTime);
      if (b.built >= 1) pushEvent(game, b.team, `${nameOf(b)} online`, 'good', b.x, b.y);
    }
    return;
  }
  if (b.cooldown > 0) b.cooldown -= dt;  // reload the gun (towers, Recycler)
  if (b.upgrading !== null) {
    // Upgrading: production waits until it's done.
    const up = b.def.upgrade;
    b.upgrading += dt;
    if (b.upgrading >= up.time) {
      b.upgrading = null; b.level = 2;
      b.hp += up.hp - b.maxHp; b.maxHp = up.hp;
      pushEvent(game, b.team, `${up.name} ready`, 'good', b.x, b.y);
    }
  }
  if (b.researching) {
    const r = RESEARCH[b.researching.key];
    b.researching.t += dt;
    if (b.researching.t >= r.time) {
      game.teams[b.team].research[b.researching.key] = true;
      pushEvent(game, b.team, `${r.name} researched. Build them at a Factory II.`, 'good', b.x, b.y);
      b.researching = null;
    }
  }
  if (b.def.ping) {
    b.pingTimer -= dt;
    if (b.pingTimer <= 0) {
      const p = b.def.ping;
      b.pingTimer = p.every;
      game.teams[b.team].pings.push({ x: b.x, y: b.y, r: p.radius, until: game.time + p.lasts });
      game.effects.push({ kind: 'ping', team: b.team, x: b.x, y: b.y, r: p.radius, t: 0, life: 1.6 });
      updateVisibility(game);
    }
  }
  if (b.def.repairRate) repairOnPad(game, b, dt);
  if (b.type === 'recycler') bankScrap(game, b.team, b.def.income * game.teams[b.team].incomeMult * dt, true);
  else if (b.def.income) pumpExtractor(game, b, dt);
  if (b.queue.length && b.upgrading === null) {
    const def = UNIT_TYPES[b.queue[0]];
    const count = game.entities.filter(e => e.kind === 'unit' && e.team === b.team).length;
    const tm = game.teams[b.team];
    // Pay for the next vehicle when its turn comes; wait until there's enough.
    if (!b.paid) {
      if (tm.scrap >= def.cost) { tm.scrap -= def.cost; b.paid = true; b.waiting = false; }
      else b.waiting = true;
    }
    if (!b.paid) { /* waiting for scrap */ }
    else if (count >= CONFIG.UNIT_CAP) { b.blocked = true; }
    else {
      b.blocked = false;
      b.prodTime += dt;
      if (b.prodTime >= def.buildTime) {
        b.prodTime = 0; b.paid = false;
        const type = b.queue.shift();
        spawnFromBuilding(game, b, type);
      }
    }
  }
  if (b.def.weapon) combatThink(game, b, dt);
}

// Vehicles of the pad's side parked on it are repaired, shields too.
// Is this vehicle parked on (inside the footprint of) this Repair Pad?
function onPad(b, u) {
  const T = CONFIG.TILE;
  return u.x >= b.tx * T && u.x <= (b.tx + b.size) * T && u.y >= b.ty * T && u.y <= (b.ty + b.size) * T;
}

// The finished Repair Pad of its own side that a vehicle is parked on, if any.
function padUnder(game, u) {
  for (const b of game.entities) if (b.type === 'repairpad' && b.team === u.team && b.built >= 1 && b.hp > 0 && onPad(b, u)) return b;
  return null;
}

const needsRepair = u => u.hp < u.maxHp || (u.def.shield && u.shield < u.def.shield);

// A repaired vehicle drives off the pad so it doesn't block the next one:
// to the pad's waypoint if it has one, otherwise to a spot just beside the pad
// on the side facing the middle of the map. Each vehicle gets its own spot
// around that point (a spiral by its id), so they don't pile up there either.
// Workers simply go back to work.
function leavePad(game, u, pad) {
  u.repairTrip = 0;
  if (u.def.role === 'harvester') return;
  let x, y;
  if (pad.rally) { x = pad.rally.x; y = pad.rally.y; }
  else {
    const a = faceCentre(game, pad.x, pad.y);
    x = pad.x + Math.cos(a) * (pad.radius + 70); y = pad.y + Math.sin(a) * (pad.radius + 70);
  }
  const k = u.id % 12, r = 26 * Math.sqrt(k), t = k * 2.4;
  issueCommand(game, u.team, { type: 'move', ids: [u.id], x: x + Math.cos(t) * r, y: y + Math.sin(t) * r, attackMove: !!u.def.weapon });
}

// Every kind of vehicle parked on the pad is repaired, workers included.
function repairOnPad(game, b, dt) {
  for (const u of game.entities) {
    // Never "repair" something already destroyed or recycled this tick.
    if (u.kind !== 'unit' || u.team !== b.team || u.hp <= 0 || !onPad(b, u)) continue;
    if (!needsRepair(u)) {
      // Sent here by Go repair and now fixed: clear the pad.
      if (u.repairTrip === b.id && u.order.type === 'idle') leavePad(game, u, b);
      continue;
    }
    u.hp = Math.min(u.maxHp, u.hp + b.def.repairRate * dt);
    if (u.def.shield) u.shield = Math.min(u.def.shield, u.shield + b.def.repairRate * dt);
    u.repairing = 0.3;  // lets the renderer show the repair glow
    if ((game.tick + u.id) % 6 === 0) game.effects.push({ kind: 'heal', x: u.x + (game.rng() - 0.5) * 20, y: u.y, t: 0, life: 0.8 });
  }
}

// An Extractor sends its scrap straight into the team's total. When storage
// is full, the scrap waits in the Extractor (up to its `store`) and flows in
// as soon as there is room.
function pumpExtractor(game, b, dt) {
  const tm = game.teams[b.team];
  let amt = b.def.income * dt + b.stored;
  amt -= bankScrap(game, b.team, amt * tm.incomeMult, true) / tm.incomeMult;
  b.stored = Math.min(b.def.store, Math.max(0, amt));
}

function spawnFromBuilding(game, b, type) {
  const T = CONFIG.TILE;
  // Vehicles roll out of the corner facing the middle of the map.
  const lowerLeft = inMirroredHalf(game, b.x, b.y);
  const exitY = lowerLeft ? b.ty - 1 : b.ty + b.size;
  const exitX = lowerLeft ? b.tx + b.size : b.tx - 1;
  const spot = nearestOpenTile(game, exitX, exitY, 6) || { x: b.tx, y: b.ty };
  const u = addUnit(game, type, b.team, (spot.x + 0.5) * T, (spot.y + 0.5) * T);
  game.teams[b.team].stats.built++;
  // With a waypoint set, every new vehicle drives straight to it. Workers
  // then get back to work on their own from there.
  if (b.rally) {
    issueCommand(game, b.team, { type: 'move', ids: [u.id], x: b.rally.x, y: b.rally.y, attackMove: !!u.def.weapon });
  } else if (u.def.role === 'harvester') { autoHarvest(game, u); return; }
  pushEvent(game, b.team, `${u.def.name} ready`, 'good', u.x, u.y);
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

function updateUnit(game, u, dt) {
  if (u.cooldown > 0) u.cooldown -= dt;
  if (u.repairing > 0) u.repairing -= dt;
  if (u.def.shield) {
    if (u.shieldFlash > 0) u.shieldFlash -= dt;
    if (u.shieldWait > 0) u.shieldWait -= dt;
    else u.shield = Math.min(u.def.shield, u.shield + u.def.shieldRegen * dt);
  }
  const o = u.order;
  switch (o.type) {
    case 'idle': {
      if (u.def.weapon) {
        const engaged = combatThink(game, u, dt, true);
        if (!engaged && dist(u, { x: o.gx, y: o.gy }) > 40) {
          if (!u.path.length) planPath(game, u, o.gx, o.gy);
          followPath(game, u, dt);
        } else if (!engaged) u.path = [];
      } else if (needsRepair(u) && padUnder(game, u)) {
        // Workers parked on a Repair Pad wait there until they're fixed,
        // instead of driving straight back to work.
        followPath(game, u, dt);
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
  const type = u.def.role === 'hq' ? 'recycler' : 'extractor';
  const size = BUILDING_TYPES[type].size;
  // A 3x3 Recycler can't be centred on a grid corner, so it sits one square
  // off; mirror that choice on the far half so both sides are identical.
  const off = size === 3 && inMirroredHalf(game, g.x, g.y) ? 2 : 1;
  const tx = g.tx - off, ty = g.ty - off;
  for (let y = ty; y < ty + size; y++) for (let x = tx; x < tx + size; x++) {
    if (isBlockedTile(game, x, y)) { pushEvent(game, u.team, 'Something is blocking the geyser', 'warn', u.x, u.y); goIdle(u); return; }
  }
  const b = addBuilding(game, type, u.team, tx, ty, false);
  b.selfBuild = true; b.geyserId = g.id;
  g.extractorId = b.id;
  u.hp = 0; u.deployed = true;  // the vehicle becomes the building
  pushEvent(game, u.team, type === 'recycler' ? 'Recycler deploying. Your base is being set up.' : 'Scavenger deploying as an Extractor', 'good', b.x, b.y);
}

// Move along the current path. Returns true once the end is reached.
function followPath(game, u, dt, stopDist = 6) {
  if (!u.path.length) return true;
  // Deployed artillery must fold its legs away before it can drive.
  if (u.legE > 0) {
    u.legE = Math.max(0, u.legE - dt / CONFIG.ARTILLERY_RETRACT);
    u.movingTick = game.tick;
    return false;
  }
  const wp = u.path[0];
  const d = dist(u, wp);
  const last = u.path.length === 1;
  if (d < (last ? stopDist : 14)) { u.path.shift(); return u.path.length === 0; }
  if (last) {
    // Crowded destination: if we're close but haven't got any closer for a
    // couple of seconds (other vehicles are in the way), call it arrived.
    if (wp !== u.nearWp) { u.nearWp = wp; u.bestD = d; u.noGain = 0; }
    if (d < u.bestD - 1) { u.bestD = d; u.noGain = 0; } else u.noGain += dt;
    if (u.noGain > 2 && d < 120) { u.path = []; return true; }
  }
  const want = avoidSteer(game, u, angleTo(u, wp));
  u.movingTick = game.tick;
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

// Look a little way ahead for another vehicle in the way and steer round it.
// Something dead ahead is passed on the right, so two vehicles meeting head-on
// both turn the same way and slide past each other instead of shoving.
function avoidSteer(game, u, want) {
  const look = u.radius * 2 + u.def.speed * 0.7;
  const fx = Math.cos(want), fy = Math.sin(want);
  let ahead = Infinity, lat = 0, clear = 0;
  for (const o of game.entities) {
    if (o === u || o.kind !== 'unit' || o.hp <= 0) continue;
    const rx = o.x - u.x, ry = o.y - u.y;
    if (rx > look + 40 || rx < -look - 40 || ry > look + 40 || ry < -look - 40) continue;
    const a = rx * fx + ry * fy;
    if (a <= 0 || a > look || a >= ahead) continue;
    const l = -rx * fy + ry * fx;               // how far to our right it is
    const c = u.radius + o.radius + 4;
    if (Math.abs(l) >= c) continue;
    ahead = a; lat = l; clear = c;
  }
  if (ahead === Infinity) return want;
  // The closer and more central the obstacle, the harder the turn.
  const turn = 0.95 * (1 - Math.abs(lat) / clear) * (1 - 0.5 * ahead / look) + 0.25;
  return want + (lat > 3 ? -turn : turn);
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
  const units = shuffled(game, game.entities.filter(e => e.kind === 'unit' && e.hp > 0));
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      // Two Scavengers of the same side may squeeze closer, so they can
      // slip past each other on busy runs between a field and the base.
      const workers = a.team === b.team && a.def.role === 'harvester' && b.def.role === 'harvester';
      const min = (a.radius + b.radius) * (workers ? 0.6 : 1);
      if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d < min) {
        // A moving vehicle shoulders a parked one aside rather than both
        // stopping: the parked one takes most of the push.
        const am = a.movingTick === game.tick, bm = b.movingTick === game.tick;
        const ka = am === bm ? 0.3 : am ? 0.1 : 0.5, kb = am === bm ? 0.3 : bm ? 0.1 : 0.5;
        const over = min - d, ux = dx / d, uy = dy / d;
        moveWithCollision(game, a, -ux * over * ka, -uy * over * ka);
        moveWithCollision(game, b, ux * over * kb, uy * over * kb);
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
  if (d > w.range || (w.minRange && d < w.minRange)) return;
  if (e.kind === 'unit' && w.projectile === 'artillery') {
    // Artillery fires only when stopped with its stabiliser legs down.
    if (e.movingTick === game.tick) return;
    if ((e.legE || 0) < 1) {
      e.legE = Math.min(1, (e.legE || 0) + dt / CONFIG.ARTILLERY_DEPLOY);
      if (e.legE < 1) return;
    }
  }
  if (e.cooldown > 0) return;
  if (Math.abs(wrapAngle(want - e.turret)) > 0.25) return;
  e.cooldown = w.cooldown;
  e.lastShot = game.time;  // drives barrel recoil and the muzzle flash
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
  if (e.shield > 0) {
    const soak = Math.min(e.shield, amount);
    e.shield -= soak; amount -= soak; e.shieldFlash = 0.15;
  }
  if (e.def.shield) e.shieldWait = e.def.shieldDelay;
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
  pushEvent(game, e.team, `${e.kind === 'building' ? nameOf(e) : e.def.name} under attack!`, 'bad', e.x, e.y);
}

function removeDead(game) {
  const dead = game.entities.filter(e => e.hp <= 0);
  if (!dead.length) return;
  for (const e of dead) {
    game.byId.delete(e.id);
    if (e.deployed) continue;
    if (e.kind === 'building' && e.geyserId) { const g = game.geysers.find(x => x.id === e.geyserId); if (g) g.extractorId = 0; }
    if (e.demolished) { demolishInto(game, e); continue; }
    if (e.recycled) { game.effects.push({ kind: 'recycle', team: e.team, x: e.x, y: e.y, t: 0, life: 0.9, r: e.radius }); continue; }
    if (e.kind === 'building') {
      setOccupied(game, e, -1);
      // Explosion, then a crater where the building stood.
      game.effects.push({ kind: 'explode', type: e.type, team: e.team, x: e.x, y: e.y, t: 0, life: 1.2, size: e.radius * 1.6 });
      game.effects.push({ kind: 'crater', type: e.type, x: e.x, y: e.y, t: 0, life: 90 });
      pushEvent(game, e.team, `${nameOf(e)} destroyed`, 'bad', e.x, e.y);
      pushEvent(game, 3 - e.team, `Enemy ${nameOf(e)} destroyed`, 'good', e.x, e.y);
    } else {
      // Explosion, then a burnt-out wreck in the vehicle's own shape.
      game.effects.push({ kind: 'explode', type: baseType(e), team: e.team, x: e.x, y: e.y, t: 0, life: 1.2, size: e.radius * 2.2 });
      game.effects.push({ kind: 'wreck', type: baseType(e), team: e.team, mk: !!e.def.base, x: e.x, y: e.y, a: e.angle, t: 0, life: 20, r: e.radius });
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

// Taking a building down returns half of what it cost, as loose scrap piles
// on the ground where it stood. Scavengers can collect them.
function demolishInto(game, b) {
  setOccupied(game, b, -1);
  const value = Math.round((b.def.salvageValue ?? b.def.cost) * 0.5);
  const piles = Math.max(1, Math.ceil(value / 40));
  for (let i = 0; i < piles && value > 0; i++) {
    const a = i / piles * Math.PI * 2, r = piles > 1 ? b.radius * 0.5 : 0;
    const amt = i < piles - 1 ? Math.floor(value / piles) : value - Math.floor(value / piles) * (piles - 1);
    game.scrap.push({ id: 200000 + game.nextId++, x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r, amount: amt, max: amt, wreck: true });
  }
  game.effects.push({ kind: 'dust', x: b.x, y: b.y, t: 0, life: 0.8 });
  pushEvent(game, b.team, `${nameOf(b)} demolished: ${value} scrap left on the ground`, 'info', b.x, b.y);
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
    if (o.dropId !== drop.id) { o.dropId = drop.id; u.path = []; }
    if (!u.path.length) planPathNear(game, u, drop);
    const arrived = followPath(game, u, dt, 12);
    if (edgeDist(u, drop) < drop.radius * 0.4 + u.radius + 20 || (arrived && edgeDist(u, drop) < 70)) {
      u.path = [];
      // If storage is full, wait at the base and retry once a second.
      if (o.fullWait && game.tick % 30 !== u.id % 30) return;
      const tm = game.teams[u.team];
      u.carry -= bankScrap(game, u.team, u.carry * tm.incomeMult) / tm.incomeMult;
      o.fullWait = u.carry > 0.5;
      if (u.carry > 0.5) return;
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
  if (!b || b.hp <= 0 || (b.built >= 1 && (b.hp >= b.maxHp || !u.def.canRepair))) { u.order = { type: 'idle', gx: u.x, gy: u.y }; u.path = []; return; }
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
      pushEvent(game, b.team, `${nameOf(b)} complete`, 'good', b.x, b.y);
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
  // Radar pings light up a wide circle for a few seconds.
  for (const t of [1, 2]) {
    const tm = game.teams[t];
    tm.pings = tm.pings.filter(p => p.until > game.time);
    for (const p of tm.pings) {
      const r = p.r / T, cx = p.x / T, cy = p.y / T;
      for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.floor(cy + r)); y++)
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.floor(cx + r)); x++)
          if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) { tm.vis[y * W + x] = 1; tm.explored[y * W + x] = 1; }
    }
  }
  // Remember enemy buildings once you've seen them.
  for (const e of game.entities) if (e.kind === 'building') for (const t of [1, 2]) if (t !== e.team && isVisibleTo(game, t, e)) e.seen[t] = true;
}

function checkVictory(game) {
  for (const t of [1, 2]) {
    // The one rule of victory: destroy the enemy Recycler.
    if (!game.entities.some(e => e.team === t && (e.type === 'recycler' || e.type === 'mobileRecycler'))) {
      game.winner = 3 - t; game.endReason = `${TEAMS[t].name} lost their Recycler.`; return;
    }
  }
}
