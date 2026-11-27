/* Iron Dominion and Vex Swarm — unit & building sprites (vector, canvas).
 * Load after sprites.js:  <script src="js/sprites_factions.js"></script>
 *   → window.DominionSprites, window.VexSprites
 * Same conventions and design ids as UnitSprites (sprites.js): game pixels,
 * centred, facing +x, the same sizes, so each design fits its unit exactly.
 *
 * Iron Dominion: riveted iron and brass. Wide, heavy treads, slab armour with
 * bevelled corners, brass rivets, twin barrels and smokestacks glowing with
 * furnace light. Everything reads as heavy and slow.
 * Vex Swarm: living chitin. Segmented oval bodies on scuttling legs (they
 * walk while moving), mandibles, spines, and acid-green glands where guns
 * would be. Everything reads as quick, organic and many. */
(function (root) {
'use strict';
const SW = 0.6, RAD = Math.PI / 180;
const f1 = v => +v.toFixed(1);
function poly(n, r, rot, cx, cy) { cx = cx || 0; cy = cy || 0; let d = ''; for (let i = 0; i < n; i++) { const a = (rot + i * 360 / n) * RAD; d += (i ? 'L' : 'M') + f1(cx + Math.cos(a) * r) + ' ' + f1(cy + Math.sin(a) * r); } return d + 'Z'; }
// A rectangle with its corners cut off (Dominion armour).
function slab(x, y, w, h, c) { return `M${x + c} ${y}H${x + w - c}L${x + w} ${y + c}V${y + h - c}L${x + w - c} ${y + h}H${x + c}L${x} ${y + h - c}V${y + c}Z`; }
// An oval (Vex bodies).
function oval(cx, cy, rx, ry) { return `M${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}Z`; }
const TEAM_COLOURS = {
  blue: { t: '#4aa3ff', td: '#1f6fc2' }, red: { t: '#ff5a4a', td: '#b8352a' }, green: { t: '#5ee06a', td: '#2f9a3a' },
  amber: { t: '#ffb22e', td: '#b8740c' }, violet: { t: '#c77dff', td: '#7d3bb0' },
};
const MASK = { h: '#4a4e55', l: '#5a5f66', m: '#3c4046', d: '#2d3035', k: '#15171a', g: '#6a6f76', gold: '#6a6f76', f: '#6a6f76', t: '#ffffff', td: '#d0d0d0', tr: '#15171a', tc: '#2d3035' };
const WRECK = { h: '#55585c', l: '#62656a', m: '#43464a', d: '#303235', k: '#15171a', g: '#62656a', gold: '#55585c', f: '#55585c', t: '#4a4d51', td: '#3c3f43', tr: '#1e2023', tc: '#303235' };

// -----------------------------------------------------------------------------
// The drawing engine (shared by both sets). Shape lists use the same short
// codes as the other sprite files: r rect, c circle, e ellipse, o ring,
// p filled path, s stroked path; the last values name palette colours.
// Extra for these sets: `legs` (Vex: [x, y, length, side] pairs that scuttle
// while moving) and `stacks` (Dominion: smokestacks that puff while moving).
// -----------------------------------------------------------------------------
// `mark(def)`: extra team-colour markings for a design, painted over its body,
// so the side shows clearly with four colours on the field.
function makeArt(BASE, VEH, BLD, flash, mark) {
  const ALL = [...VEH, ...BLD], BY = Object.create(null); ALL.forEach(d => { BY[d.id] = d; d.marks = mark ? mark(d) : []; });
  const PATHS = new Map();
  const path = d => { let p = PATHS.get(d); if (!p) { p = new Path2D(d); PATHS.set(d, p); } return p; };
  function paint(ctx, list, P) {
    for (const s of list) {
      ctx.lineWidth = SW; ctx.strokeStyle = P.k; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
      switch (s[0]) {
        case 'r': ctx.beginPath(); if (s[6] && ctx.roundRect) ctx.roundRect(s[1], s[2], s[3], s[4], s[6]); else ctx.rect(s[1], s[2], s[3], s[4]); ctx.fillStyle = P[s[5]]; ctx.fill(); ctx.stroke(); break;
        case 'c': ctx.beginPath(); ctx.arc(s[1], s[2], s[3], 0, Math.PI * 2); ctx.fillStyle = P[s[4]]; ctx.fill(); ctx.stroke(); break;
        case 'e': ctx.beginPath(); ctx.ellipse(s[1], s[2], s[3], s[4], (s[6] || 0) * RAD, 0, Math.PI * 2); ctx.fillStyle = P[s[5]]; ctx.fill(); ctx.stroke(); break;
        case 'o': ctx.beginPath(); ctx.arc(s[1], s[2], s[3], 0, Math.PI * 2); ctx.strokeStyle = P[s[4]]; ctx.lineWidth = s[5]; ctx.stroke(); break;
        case 'p': { const p = path(s[1]); ctx.fillStyle = P[s[2]]; ctx.fill(p); ctx.stroke(p); break; }
        case 's': ctx.strokeStyle = P[s[2]]; ctx.lineWidth = s[3]; ctx.lineCap = 'round'; ctx.stroke(path(s[1])); break;
      }
    }
  }
  const palette = (team, o) => (o.mask ? MASK : o.wreck ? WRECK : Object.assign({}, BASE, TEAM_COLOURS[team] || TEAM_COLOURS.blue));
  function drawLegs(ctx, def, o, P) {
    const t = o.t || 0, moving = !!o.thrust && !o.wreck;
    ctx.lineCap = 'round';
    def.legs.forEach(([x, y, len, side], i) => {
      const ph = moving ? Math.sin(t * 16 + i * 2.1) : 0, sway = o.wreck ? 0.6 : 0;
      const kx = x + ph * 2.2, ky = y + side * len * 0.55, fx = x + ph * 3.5 - side * sway, fy = y + side * len;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(kx, ky); ctx.lineTo(fx + (i % 2 ? 1.5 : -1.5), fy);
      ctx.strokeStyle = P.k; ctx.lineWidth = 2.6; ctx.stroke(); ctx.strokeStyle = P.m; ctx.lineWidth = 1.4; ctx.stroke();
    });
  }
  function drawSprite(ctx, id, o) {
    const def = BY[id]; if (!def) return; o = o || {};
    const t = o.t || 0, P = palette(o.team, o), bld = !!def.S;
    ctx.save(); ctx.translate(o.x || 0, o.y || 0); if (o.scale) ctx.scale(o.scale, o.scale);
    if (!bld && o.heading) ctx.rotate(o.heading);
    if (def.legs) drawLegs(ctx, def, o, P);
    const e = o.wreck ? 0 : (o.legE || 0);
    if (def.anch && e > 0) for (const [bx, by, dx, dy] of def.anch) {
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + dx * e, by + dy * e); ctx.lineCap = 'round';
      ctx.strokeStyle = P.k; ctx.lineWidth = 3.4; ctx.stroke(); ctx.strokeStyle = P.l; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(bx + dx * e, by + dy * e, 1.6, 0, Math.PI * 2); ctx.fillStyle = P.gold || P.t; ctx.fill(); ctx.lineWidth = SW; ctx.strokeStyle = P.k; ctx.stroke();
    }
    // Vex bodies breathe; Dominion hulls sit still.
    ctx.save(); const br = bld || !def.breathe ? 1 : 1 + .02 * Math.sin(t * 3 + (o.x || 0)); ctx.scale(br, br);
    paint(ctx, def.s, P); paint(ctx, def.marks, P); if (o.mk && def.mk) paint(ctx, def.mk, P); ctx.restore();
    if (def.pulse && !o.wreck) { ctx.save(); ctx.globalAlpha *= .4 + .6 * (.5 + .5 * Math.sin(t * 3)); paint(ctx, def.pulse, P); ctx.restore(); }
    if (def.spin) { ctx.save(); ctx.rotate(o.wreck ? 20 * RAD : (t * def.spin.rate % 360) * RAD); paint(ctx, def.spin.s, P); ctx.restore(); }
    if (def.tur) turret(ctx, def, def.tur, o.turret, o.fire, o, P, 35);
    if (def.tur2) turret(ctx, def, def.tur2, o.turret2 !== undefined ? o.turret2 : o.turret, o.fire2, o, P, -25);
    if (def.stacks && !o.wreck && (o.thrust || bld)) {
      for (const [sx, sy] of def.stacks) for (let k = 0; k < 2; k++) {
        const q = (t * .9 + k * .5 + sx * .01) % 1;
        ctx.globalAlpha = (1 - q) * .45; ctx.fillStyle = '#9a948a';
        ctx.beginPath(); ctx.arc(sx - q * 8, sy - q * 3, 1.5 + q * 3.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function turret(ctx, def, tur, angle, fire, o, P, wreckAngle) {
    const m = tur.m, f = o.wreck ? null : fire, kick = tur.rapid ? 1 : 3, rc = f != null && f < .35 ? -kick * (1 - f / .35) : 0;
    ctx.save(); ctx.translate(m[0], m[1]); ctx.rotate(o.wreck ? wreckAngle * RAD : (angle || 0));
    ctx.save(); ctx.translate(rc, 0); paint(ctx, o.mk && tur.mkS ? tur.mkS : tur.s, P); if (o.mk && def.tmk && tur === def.tur) paint(ctx, def.tmk, P); ctx.restore();
    if (f != null && f < .16) {
      ctx.translate((tur.reach || def.reach) + 2, 0); const k = (1 - f / .3) * (tur.rapid ? .6 : 1);
      ctx.globalAlpha = .95; ctx.fillStyle = flash[0]; ctx.beginPath(); ctx.arc(0, 0, 5 * k, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = .55; ctx.fillStyle = flash[1]; ctx.beginPath(); ctx.arc(0, 0, 8.5 * k, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawDamage(ctx, id, x, y, t) {
    const R = (BY[id] || { R: 15 }).R; ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(17,16,13,.4)';
    ctx.beginPath(); ctx.arc(-R * .35, -R * .2, R * .2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(R * .3, R * .35, R * .14, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) { const q = ((t * .5) + i / 3) % 1; ctx.beginPath(); ctx.arc(-R * .2 + q * R * .5 + Math.sin(q * 6 + i) * R * .08, -R * .1 - q * R * 1.1, R * (.1 + .25 * q), 0, Math.PI * 2); ctx.fillStyle = 'rgba(90,86,78,' + ((1 - q) * .45) + ')'; ctx.fill(); }
    ctx.restore();
  }
  function drawExplosion(ctx, id, x, y, p, team) {
    const R = (BY[id] || { R: 15 }).R, tc = (TEAM_COLOURS[team] || TEAM_COLOURS.blue).t; ctx.save(); ctx.translate(x, y);
    ctx.globalAlpha = Math.max(0, 1 - p * 1.5); ctx.fillStyle = flash[0]; ctx.beginPath(); ctx.arc(0, 0, R * (.4 + 1.4 * p), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = Math.max(0, .8 - p); ctx.fillStyle = flash[1]; ctx.beginPath(); ctx.arc(0, 0, R * (.3 + .9 * p), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1 - p * .8;
    for (let i = 0; i < 10; i++) { const a = i * 2.3 + .5, d = R * (.3 + 1.4 * Math.pow(p, .6)); ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate((p * 500 + i * 36) * RAD); ctx.fillStyle = i % 2 ? WRECK.l : tc; ctx.fillRect(-R * .1, -R * .04, R * .2, R * .08); ctx.restore(); }
    ctx.restore();
  }
  function drawCrater(ctx, id, x, y) {
    const R = (BY[id] || { R: 15 }).R; ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(17,16,13,.28)'; ctx.beginPath(); ctx.arc(0, 0, R * .8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = WRECK.m;
    for (let i = 0; i < 8; i++) { const a = i * 2.1 + .4, d = R * (.2 + .55 * ((i * 37 % 10) / 10)); ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(i * 47 * RAD); ctx.fillRect(-R * .07, -R * .035, R * .14, R * .07); ctx.restore(); }
    ctx.restore();
  }
  const rapidFire = sec => (sec % 0.2) * 1.4;
  return { DEFS: BY, VEHICLES: VEH.map(d => d.id), BUILDINGS: BLD.map(d => d.id), TEAM: TEAM_COLOURS, drawSprite, drawDamage, drawExplosion, drawCrater, ARTILLERY: { deploy: 0.6, retract: 0.6 }, SENTRY: { deploy: 0.6, retract: 0.6, shotInterval: 0.2 }, rapidFire };
}

// =============================================================================
// IRON DOMINION
// =============================================================================
{
  const BASE = { h: '#6b6455', l: '#9a9180', m: '#4a453b', d: '#2c2924', k: '#11100d', g: '#ffb04a', gold: '#c9963b', f: '#ff7a2a', tr: '#1c1a17', tc: '#55504a' };
  // Wide treads with cleats.
  const tread = (x, y, w, h) => { let d = ''; for (let q = x + 1.5; q < x + w - 1; q += 3) d += `M${f1(q)} ${y}v${h}`; return [['r', x, y, w, h, 'tr', 1.5], ['s', d, 'tc', .7]]; };
  const rivets = pts => pts.map(([x, y]) => ['c', x, y, .8, 'gold']);
  const VEH = [
    { id: 'tank', D: 30, R: 15, reach: 23,
      s: [...tread(-15, -16, 30, 7), ...tread(-15, 9, 30, 7), ['p', slab(-13, -10, 26, 20, 4), 'h'], ['p', slab(-11, -8, 22, 16, 3), 'l'], ['r', -13, -3, 3, 6, 't'], ...rivets([[-9, -8.5], [9, -8.5], [-9, 8.5], [9, 8.5]])],
      mk: [['r', 8, -10, 5, 20, 'm', 1], ...rivets([[10.5, -6], [10.5, 6]])],
      tur: { m: [-1, 0], s: [['r', 5, -3.6, 17, 2.4, 'd'], ['r', 5, 1.2, 17, 2.4, 'd'], ['r', 20, -4, 3, 7.9, 'k'], ['p', slab(-8, -7, 15, 14, 3), 'h'], ['r', -6, -4.5, 6, 9, 'm'], ['r', -8.5, -2, 2, 4, 't'], ['c', 2.5, 0, 1.4, 'gold']] },
      tmk: [['s', 'M-4 -6V6', 'gold', 1]] },
    { id: 'scout', D: 22, R: 11, reach: 12,
      s: [...tread(-11, -11, 18, 4.5), ...tread(-11, 6.5, 18, 4.5), ['p', 'M12 0L6 -7H-10L-12 -4V4L-10 7H6Z', 'h'], ['p', 'M9 0L5 -4H-6V4H5Z', 'l'], ['r', -11, -2, 3, 4, 't'], ['r', 4, -5.5, 9, 1.6, 'd'], ['r', 4, 3.9, 9, 1.6, 'd'], ...rivets([[-6, -5.5], [-6, 5.5]])],
      mk: [['p', 'M-4 -7L-1 -10H3L5 -7Z', 'gold'], ['p', 'M-4 7L-1 10H3L5 7Z', 'gold']] },
    { id: 'artillery', D: 30, R: 15, reach: 37, anch: [[-9, -10, -5, -6], [-9, 10, -5, 6], [8, -10, 4, -6], [8, 10, 4, 6]], stacks: [[-12, -5]],
      s: [...tread(-15, -15, 28, 6), ...tread(-15, 9, 28, 6), ['p', slab(-14, -9, 27, 18, 3), 'h'], ['r', -13, -3, 3, 6, 't'], ['r', -14, -7, 4, 3, 'd'], ['c', -12, -5.5, 1.2, 'f'], ...rivets([[-6, -8], [6, -8], [-6, 8], [6, 8]])],
      mk: [['s', 'M-2 -8.5V8.5', 'gold', 1]],
      tur: { m: [0, 0], s: [['r', 4, -2.2, 30, 4.4, 'd'], ['r', 4, -3.2, 10, 6.4, 'm', .5], ['r', 32, -3.6, 5, 7.2, 'k'], ['r', 18, -3, 2, 6, 'gold'], ['p', slab(-8, -7, 14, 14, 3), 'h'], ['r', -6, -4, 7, 8, 'l']] } },
    { id: 'constructor', D: 26, R: 13, reach: 14, stacks: [[-10, -6]],
      s: [...tread(-13, -13, 26, 5), ...tread(-13, 8, 26, 5), ['p', slab(-12, -8, 24, 16, 3), 'h'], ['r', 3, -6, 8, 12, 'l', 1], ['r', -12, -3, 3, 6, 't'], ['c', -10, -5.5, 1.6, 'd'], ['s', 'M-4 0L9 -9', 'd', 2.6], ['s', 'M9 -9L12 -9M9 -9L10 -12', 'gold', 1.2], ['c', -4, 0, 3.2, 'm'], ['c', -4, 0, 1.2, 'gold']],
      mk: [['p', 'M-8 8L-4 11H4L8 8Z', 'gold']] },
    { id: 'scavenger', D: 26, R: 13, reach: 14,
      s: [...tread(-13, -13, 26, 5), ...tread(-13, 8, 26, 5), ['p', slab(-13, -8, 18, 16, 2), 'h'], ['r', -11, -6, 13, 12, 'd', 1], ['r', -9, -4, 3, 2.5, 'gold'], ['r', -5, 0, 3.5, 3, 'l'], ['r', -8, 2, 2.5, 2, 'l'],
         ['p', 'M5 -8H10L13 -5V5L10 8H5Z', 'l'], ['s', 'M13 -4H15M13 0H15.5M13 4H15', 'k', 1.2], ['r', -13, -2, 2.5, 4, 't']],
      mk: [['r', 6, -9.5, 6, 1.6, 'gold'], ['r', 6, 7.9, 6, 1.6, 'gold']] },
    { id: 'recyclerV', D: 44, R: 22, reach: 22, stacks: [[-16, -10], [-16, 10]],
      s: [...tread(-22, -23, 44, 8), ...tread(-22, 15, 44, 8), ['p', slab(-20, -15, 40, 30, 6), 'h'], ['p', slab(-16, -11, 32, 22, 4), 'm'], ['r', -12, -8, 20, 16, 'd', 2], ['c', -2, 0, 6, 'k'], ['c', -2, 0, 4, 'f'], ['c', -2, 0, 1.8, 'g'],
         ['r', -20, -5, 4, 10, 't'], ['r', 14, -12, 5, 24, 'l', 1], ['r', -18, -12, 4, 4, 'd'], ['r', -18, 8, 4, 4, 'd'], ...rivets([[-14, -13], [0, -13], [12, -13], [-14, 13], [0, 13], [12, 13]])] },
    { id: 'hornet', D: 26, R: 13, reach: 18,
      s: [...tread(-13, -13, 24, 5), ...tread(-13, 8, 24, 5), ['p', 'M13 0L8 -8H-11L-13 -5V5L-11 8H8Z', 'h'], ['p', 'M9 0L6 -5H-7V5H6Z', 'l'], ['r', -13, -2, 3, 4, 't'], ...rivets([[-8, -6.5], [-8, 6.5], [4, -6.5], [4, 6.5]])],
      tur: { m: [-1, 0], s: [['r', 1, -6, 15, 4.5, 'm', 1], ['r', 1, 1.5, 15, 4.5, 'm', 1], ['c', 16, -3.8, 1.2, 'f'], ['c', 16, 3.8, 1.2, 'f'], ['p', slab(-6, -5, 11, 10, 2), 'h'], ['c', 0, 0, 1.5, 'gold']] } },
    { id: 'sentry', D: 24, R: 12, reach: 20, anch: [[-6, -9, -4, -5], [-6, 9, -4, 5], [6, -9, 4, -5], [6, 9, 4, 5]],
      s: [['p', poly(8, 12, 22.5), 'h'], ['p', poly(8, 9, 22.5), 'd'], ['r', -12, -2, 3, 4, 't'], ...rivets([[0, -10.5], [0, 10.5], [-10.5, 0], [8, -7], [8, 7]])],
      tur: { m: [0, 0], rapid: true, s: [['r', 3, -4, 16, 2, 'd'], ['r', 3, 2, 16, 2, 'd'], ['r', 8, -5, 3, 10, 'gold', .5], ['p', slab(-6, -6, 11, 12, 3), 'h'], ['c', -1, 0, 2, 'f']] } },
    { id: 'juggernaut', D: 46, R: 18, reach: 26, stacks: [[-18, -7], [-18, 7]],
      s: [...tread(-22, -19, 44, 8), ...tread(-22, 11, 44, 8), ['p', slab(-21, -12, 43, 24, 5), 'h'], ['p', slab(-18, -9, 37, 18, 3), 'm'], ['r', -21, -4, 3, 8, 't'], ['r', -20, -9, 4, 4, 'd'], ['r', -20, 5, 4, 4, 'd'],
         ...rivets([[-14, -10.5], [-4, -10.5], [6, -10.5], [16, -10.5], [-14, 10.5], [-4, 10.5], [6, 10.5], [16, 10.5]])],
      mk: [['s', 'M2 -12V12M-8 -12V12', 'gold', 1.2]],
      tur: { m: [9, 0], reach: 26, s: [['r', 5, -4, 20, 3, 'd'], ['r', 5, 1, 20, 3, 'd'], ['r', 23, -4.5, 3, 9, 'k'], ['p', slab(-8, -7.5, 16, 15, 3), 'h'], ['r', -5, -5, 7, 10, 'l'], ['c', 3, 0, 1.6, 'gold']],
        mkS: [['r', 5, -5.5, 20, 3, 'd'], ['r', 5, -1.5, 21, 3, 'd'], ['r', 5, 2.5, 20, 3, 'd'], ['r', 23, -6, 3, 12, 'k'], ['p', slab(-8, -8.5, 16, 17, 3), 'h'], ['r', -5, -5.5, 7, 11, 'l'], ['o', 0, 0, 5, 'gold', .8]] },
      tur2: { m: [-11, 0], reach: 13, rapid: true, s: [['r', 3, -3, 10, 1.6, 'd'], ['r', 3, 1.4, 10, 1.6, 'd'], ['c', 0, 0, 5, 'h'], ['c', 0, 0, 2.2, 'f']],
        mkS: [['r', 3, -4, 10, 1.4, 'd'], ['r', 3, -.7, 11, 1.4, 'd'], ['r', 3, 2.6, 10, 1.4, 'd'], ['c', 0, 0, 5.5, 'h'], ['o', 0, 0, 4.4, 'gold', .7], ['c', 0, 0, 2.2, 'f']] } },
  ];
  // Buildings: iron foundations, brass trim, furnace glow.
  const plinth = (S, c) => ['p', slab(-S / 2 + 1, -S / 2 + 1, S - 2, S - 2, c), 'd'];
  const BLD = [
    { id: 'recycler', S: 96, R: 48, stacks: [[-30, -30], [-30, 30]],
      s: [plinth(96, 10), ['p', slab(-42, -36, 84, 72, 8), 'h'], ['p', slab(-34, -28, 60, 56, 6), 'm'], ['c', -4, 0, 18, 'd'], ['c', -4, 0, 13, 'k'], ['c', -4, 0, 9, 'f'], ['c', -4, 0, 4, 'g'],
         ['r', 28, -18, 14, 36, 'l', 2], ['r', 32, -12, 6, 24, 'k'], ['r', -46, -10, 6, 20, 't'], ['c', -30, -30, 5, 'd'], ['c', -30, 30, 5, 'd'], ['c', -30, -30, 2.4, 'f'], ['c', -30, 30, 2.4, 'f'],
         ...rivets([[-36, -32], [-12, -32], [12, -32], [-36, 32], [-12, 32], [12, 32]])],
      mk: [['o', -4, 0, 21, 'gold', 2]] },
    { id: 'factory', S: 96, R: 48, stacks: [[-34, -28]],
      s: [plinth(96, 10), ['p', slab(-44, -38, 50, 76, 6), 'h'], ['r', -40, -32, 8, 64, 't', 1], ['s', 'M-24 -34V34M-12 -34V34', 'm', 1.6], ['r', 6, -26, 38, 52, 'k', 2], ['s', 'M10 -18H40M10 18H40', 'm', 1.2],
         ['r', 40, -34, 6, 68, 'gold', 1], ['c', -34, -28, 5, 'd'], ['c', -34, -28, 2.4, 'f'], ...rivets([[-38, -36], [-38, 36], [0, -36], [0, 36]])],
      pulse: [['r', 10, -1, 30, 2, 'f']], mk: [['r', -30, -6, 22, 12, 'gold', 2]] },
    { id: 'repair', S: 96, R: 48,
      s: [plinth(96, 10), ['p', slab(-40, -40, 80, 80, 8), 'm'], ['p', slab(-34, -34, 68, 68, 6), 'd'], ['s', 'M-34 -14H34M-34 14H34', 'tc', 2], ['r', -44, -8, 6, 16, 't'], ['r', 38, -8, 6, 16, 't'],
         ...[-24, 0, 24].flatMap(x => [['r', x - 3, -40, 6, 6, 'gold'], ['r', x - 3, 34, 6, 6, 'gold']])],
      pulse: [['r', -6, -18, 12, 36, 'g'], ['r', -18, -6, 36, 12, 'g']] },
    { id: 'extractor', S: 64, R: 32, stacks: [[-18, -18]],
      s: [plinth(64, 6), ['p', slab(-26, -26, 52, 52, 6), 'h'], ['c', 0, 0, 15, 'm'], ['c', 0, 0, 11, 'k'], ['r', 14, -4, 16, 8, 'd', 1], ['c', 29, 0, 2.5, 't'], ['c', -18, -18, 4, 'd'], ['c', -18, -18, 2, 'f'], ...rivets([[-22, 22], [22, 22], [22, -22]])],
      spin: { rate: 70, s: [['s', 'M-9 0H9M0 -9V9', 'gold', 2.4], ['c', 0, 0, 2.6, 'f']] }, mk: [['o', 0, 0, 18, 'gold', 1.6]] },
    { id: 'silo', S: 64, R: 32,
      s: [plinth(64, 6), ['p', slab(-24, -24, 48, 48, 8), 'h'], ['p', slab(-18, -18, 36, 36, 6), 'm'], ['s', 'M-18 -6H18M-18 6H18', 'd', 1.4], ['r', -14, -14, 28, 4, 't', 1], ['r', 20, -4, 10, 8, 'd'], ...rivets([[-20, -20], [20, -20], [-20, 20], [20, 20]])],
      pulse: [['c', 0, 0, 3, 'f']] },
    { id: 'exsilo', S: 64, R: 32,
      s: [plinth(64, 6), ['p', slab(-22, -24, 30, 48, 6), 'h'], ['s', 'M-22 -8H8M-22 8H8', 'd', 1.4], ['r', -18, -20, 4, 40, 't', 1], ['r', 8, -4, 18, 8, 'm', 1], ['c', 24, 0, 3.5, 'gold'], ...rivets([[-18, -21], [4, -21], [-18, 21], [4, 21]])] },
    { id: 'tower', S: 64, R: 32,
      s: [plinth(64, 6), ['p', poly(8, 26, 22.5), 'h'], ['p', poly(8, 20, 22.5), 'm'], ...rivets([[0, -23], [0, 23], [-23, 0], [23, 0], [16, 16], [-16, 16], [16, -16], [-16, -16]])],
      tur: { m: [0, 0], s: [['r', 6, -4.5, 24, 3.2, 'd'], ['r', 6, 1.3, 24, 3.2, 'd'], ['r', 28, -5, 4, 10, 'k'], ['p', slab(-11, -10, 20, 20, 4), 'h'], ['r', -8, -6, 9, 12, 'l'], ['r', -11, -3, 2, 6, 't'], ['c', 4, 0, 1.8, 'gold']] } },
    { id: 'towerArt', S: 64, R: 32,
      s: [plinth(64, 6), ['p', poly(8, 26, 22.5), 'h'], ['p', poly(8, 20, 22.5), 'd'], ['o', 0, 0, 16, 'gold', 1.4]],
      tur: { m: [0, 0], s: [['r', 4, -2.6, 30, 5.2, 'd'], ['r', 30, -3.4, 5, 6.8, 'k'], ['r', 16, -3.6, 2, 7.2, 'gold'], ['p', slab(-11, -9, 18, 18, 4), 'h'], ['r', -8, -5, 8, 10, 'l'], ['r', -11, -3, 2, 6, 't']] } },
    { id: 'towerHeavy', S: 64, R: 32,
      s: [plinth(64, 6), ['p', slab(-28, -28, 56, 56, 8), 'h'], ['p', slab(-22, -22, 44, 44, 6), 'm'], ...rivets([[-24, -24], [24, -24], [-24, 24], [24, 24], [0, -25], [0, 25]])],
      tur: { m: [0, 0], s: [['r', 6, -6, 24, 4, 'd'], ['r', 6, 2, 24, 4, 'd'], ['r', 28, -7, 4, 14, 'k'], ['p', slab(-13, -12, 24, 24, 5), 'h'], ['r', -9, -7, 10, 14, 'l'], ['r', -13, -3, 2, 6, 't'], ['o', 3, 0, 4, 'gold', 1]] } },
    { id: 'lab', S: 64, R: 32,
      s: [plinth(64, 6), ['p', slab(-26, -26, 52, 52, 6), 'h'], ['c', 0, 0, 17, 'm'], ['c', 0, 0, 13, 'd'], ['r', -26, -8, 4, 16, 't'], ...rivets([[-21, -21], [21, -21], [-21, 21], [21, 21]])],
      spin: { rate: 30, s: [['s', 'M-10 0H10', 'gold', 2], ['c', 10, 0, 2.2, 'gold'], ['c', -10, 0, 2.2, 'gold']] }, pulse: [['c', 0, 0, 4, 'f']] },
    { id: 'radar', S: 64, R: 32,
      s: [plinth(64, 6), ['p', poly(8, 24, 22.5), 'h'], ['c', 0, 0, 16, 'm'], ['o', 0, 0, 12, 't', 2.2], ['c', 0, 0, 4, 'd']],
      spin: { rate: 70, s: [['r', -2, -18, 6, 36, 'l', 1], ['s', 'M-2 -14V14', 'gold', 1.2], ['s', 'M4 0H14', 'd', 2], ['c', 14, 0, 2.2, 'f']] } },
  ];
  // Team bands along both sides of every hull; a team stripe on buildings.
  const mark = d => d.S ? [['r', -d.S / 2 + 4, d.S / 2 - 9, d.S - 8, 4, 't']]
    : [['r', f1(-d.R * .7), f1(-d.R * .62), f1(d.R * 1.2), f1(d.R * .14), 't'], ['r', f1(-d.R * .7), f1(d.R * .48), f1(d.R * 1.2), f1(d.R * .14), 't']];
  root.DominionSprites = makeArt(BASE, VEH, BLD, ['#fff1c8', '#ff9a3a'], mark);
}

// =============================================================================
// VEX SWARM
// =============================================================================
{
  const BASE = { h: '#8a7650', l: '#c2ad7c', m: '#5c4e33', d: '#3a301f', k: '#14100a', g: '#d6ff7a', gold: '#e6d36a', f: '#8fe03a', tr: '#2a2216', tc: '#5c4e33' };
  // Chitin plates along a body: n arcs across it, x from x0 to x1.
  const segs = (x0, x1, n, ry) => { let d = ''; for (let i = 1; i <= n; i++) { const x = x0 + (x1 - x0) * i / (n + 1); d += `M${f1(x)} ${-ry}Q${f1(x + 2)} 0 ${f1(x)} ${ry}`; } return ['s', d, 'd', .9]; };
  const pair = (x, y, len) => [[x, -y, len, -1], [x, y, len, 1]];
  const VEH = [
    { id: 'tank', D: 30, R: 15, reach: 22, breathe: true, legs: [...pair(6, 7, 8), ...pair(0, 8, 9), ...pair(-6, 7, 8)],
      s: [['p', oval(0, 0, 14, 9.5), 'h'], ['p', oval(1, 0, 10, 6.5), 'l'], segs(-11, 9, 4, 8.5), ['p', 'M13 -4L18 -6L15 -1Z', 'm'], ['p', 'M13 4L18 6L15 1Z', 'm'], ['p', oval(-12, 0, 3.2, 3.8), 't']],
      mk: [['p', 'M-4 -9L-2 -13L0 -9Z', 'gold'], ['p', 'M-4 9L-2 13L0 9Z', 'gold'], ['p', 'M4 -8L6 -11L7 -7Z', 'gold'], ['p', 'M4 8L6 11L7 7Z', 'gold']],
      tur: { m: [1, 0], s: [['p', 'M4 -2.5Q14 -3 20 -1.5L21.5 0L20 1.5Q14 3 4 2.5Z', 'm'], ['c', 20.5, 0, 1.6, 'f'], ['p', oval(-1, 0, 6.5, 5.5), 'h'], ['c', 0, 0, 2.4, 'f'], ['c', 0, 0, 1, 'g']] } },
    { id: 'scout', D: 22, R: 11, reach: 12, breathe: true, legs: [...pair(3, 4, 7), ...pair(-2, 4.5, 8), ...pair(-7, 4, 7)],
      s: [['p', 'M12 0Q6 -6 -3 -5Q-11 -4 -12 0Q-11 4 -3 5Q6 6 12 0Z', 'h'], ['p', 'M9 0Q5 -3 -2 -2.6V2.6Q5 3 9 0Z', 'l'], segs(-9, 6, 3, 4.5), ['p', oval(-10.5, 0, 2, 2.5), 't'], ['p', 'M11 -1.5L15 -3.5L12.5 0L15 3.5L11 1.5Z', 'm'], ['c', 6, 0, 1.2, 'f']],
      mk: [['p', 'M-2 -5L0 -9L1.5 -4.5Z', 'gold'], ['p', 'M-2 5L0 9L1.5 4.5Z', 'gold']] },
    { id: 'artillery', D: 30, R: 15, reach: 36, breathe: true, legs: [...pair(7, 7, 7), ...pair(0, 8, 8), ...pair(-7, 7, 7)], anch: [[-10, -7, -6, -7], [-10, 7, -6, 7], [8, -7, 5, -7], [8, 7, 5, 7]],
      s: [['p', oval(-1, 0, 14, 9), 'h'], segs(-12, 9, 4, 8), ['p', oval(-12, 0, 3, 3.6), 't'], ['p', oval(-4, 0, 7, 6), 'l']],
      mk: [['s', 'M-8 -8.5Q-4 -11 0 -8.5M-8 8.5Q-4 11 0 8.5', 'gold', 1]],
      tur: { m: [0, 0], s: [['p', 'M2 -3Q20 -3.5 33 -2L36 0L33 2Q20 3.5 2 3Z', 'm'], ['s', 'M10 -2.6V2.6M18 -2.8V2.8M26 -2.5V2.5', 'd', 1], ['c', 34.5, 0, 2, 'f'], ['p', oval(-2, 0, 7, 6.5), 'h'], ['c', -2, 0, 3.4, 'f'], ['c', -2, 0, 1.4, 'g']] } },
    { id: 'constructor', D: 26, R: 13, reach: 14, breathe: true, legs: [...pair(5, 6.5, 7), ...pair(-1, 7, 8), ...pair(-7, 6.5, 7)],
      s: [['p', oval(-1, 0, 12, 8.5), 'h'], segs(-10, 7, 3, 7.5), ['p', oval(-11, 0, 2.6, 3.2), 't'], ['c', 2, 0, 4.5, 'l'], ['c', 2, 0, 2, 'f'],
         ['s', 'M9 -4Q15 -6 15 -1M9 4Q15 6 15 1', 'm', 2.2], ['s', 'M15 -1L13 0L15 1', 'k', 1]],
      mk: [['o', 2, 0, 6, 'gold', .9]] },
    { id: 'scavenger', D: 26, R: 13, reach: 14, breathe: true, legs: [...pair(4, 6.5, 7), ...pair(-2, 7, 8), ...pair(-8, 6.5, 7)],
      s: [['p', oval(-3, 0, 11, 8.5), 'h'], ['p', oval(-4, 0, 7.5, 6), 'd'], ['c', -6, -2, 1.8, 'gold'], ['c', -2, 2, 2, 'l'], ['c', -6, 2.5, 1.5, 'l'],
         ['p', 'M7 -6Q14 -9 16 -3L12 -2Z', 'm'], ['p', 'M7 6Q14 9 16 3L12 2Z', 'm'], ['p', oval(-13, 0, 2.4, 3), 't']],
      mk: [['s', 'M-10 -8Q-4 -11 2 -8M-10 8Q-4 11 2 8', 'gold', 1]] },
    { id: 'recyclerV', D: 44, R: 22, reach: 22, breathe: true, legs: [...pair(12, 12, 9), ...pair(4, 13, 10), ...pair(-4, 13, 10), ...pair(-12, 12, 9)],
      s: [['p', oval(0, 0, 21, 15), 'h'], segs(-18, 16, 6, 14), ['p', oval(-2, 0, 12, 9), 'l'], ['c', -2, 0, 7, 'd'], ['c', -2, 0, 5, 'f'], ['p', oval(-19, 0, 4, 5), 't'],
         ['p', 'M19 -6L25 -9L22 -2Z', 'm'], ['p', 'M19 6L25 9L22 2Z', 'm']],
      pulse: [['c', -2, 0, 2.6, 'g']] },
    { id: 'hornet', D: 26, R: 13, reach: 17, breathe: true, legs: [...pair(4, 6, 7), ...pair(-2, 6.5, 8), ...pair(-8, 6, 7)],
      s: [['p', 'M13 0Q8 -8 -4 -7Q-13 -5 -13 0Q-13 5 -4 7Q8 8 13 0Z', 'h'], segs(-10, 8, 3, 6.5), ['p', oval(-12, 0, 2.4, 3), 't'], ['p', 'M-2 -7L2 -12L4 -6Z', 'l'], ['p', 'M-2 7L2 12L4 6Z', 'l']],
      tur: { m: [0, 0], s: [['p', oval(7, -3, 8, 2.4), 'm'], ['p', oval(7, 3, 8, 2.4), 'm'], ['c', 15, -3, 1.4, 'f'], ['c', 15, 3, 1.4, 'f'], ['p', oval(0, 0, 5, 4.5), 'h'], ['c', 0, 0, 1.8, 'f']] } },
    { id: 'sentry', D: 24, R: 12, reach: 19, breathe: true, anch: [[-6, -8, -5, -5], [-6, 8, -5, 5], [6, -8, 5, -5], [6, 8, 5, 5]],
      s: [['p', poly(7, 11.5, 0), 'h'], ['p', poly(7, 8, 25), 'd'], ['p', oval(-10.5, 0, 2, 2.6), 't'], ['c', 0, 0, 3, 'f']],
      tur: { m: [0, 0], rapid: true, s: [['p', 'M3 -3.5Q12 -3.5 18 -2.2L18 -.8Q12 -1 3 -1Z', 'm'], ['p', 'M3 1Q12 1 18 .8L18 2.2Q12 3.5 3 3.5Z', 'm'], ['p', oval(-1, 0, 5.5, 5), 'h'], ['c', -1, 0, 2, 'f'], ['c', 18, -1.5, .9, 'g'], ['c', 18, 1.5, .9, 'g']] } },
    { id: 'juggernaut', D: 46, R: 18, reach: 26, breathe: true, legs: [...pair(14, 9, 9), ...pair(6, 10, 10), ...pair(-2, 10, 10), ...pair(-10, 10, 10), ...pair(-18, 9, 9)],
      s: [['p', oval(0, 0, 23, 12), 'h'], segs(-20, 18, 7, 11), ['p', oval(2, 0, 15, 7), 'l'], ['p', oval(-21, 0, 3.5, 4.5), 't'], ['p', 'M21 -5L28 -8L24 -1Z', 'm'], ['p', 'M21 5L28 8L24 1Z', 'm']],
      mk: [...[-12, -4, 4, 12].flatMap(x => [['p', `M${x - 2} -11L${x} -15L${x + 2} -11Z`, 'gold'], ['p', `M${x - 2} 11L${x} 15L${x + 2} 11Z`, 'gold']])],
      tur: { m: [9, 0], reach: 26, s: [['p', 'M4 -3Q16 -3.5 24 -2L26 0L24 2Q16 3.5 4 3Z', 'm'], ['c', 25, 0, 2, 'f'], ['p', oval(0, 0, 8, 7), 'h'], ['c', 0, 0, 3.2, 'f'], ['c', 0, 0, 1.3, 'g']],
        mkS: [['p', 'M4 -5.5Q16 -6 24 -4.5L26 -3L24 -1.5Q16 -1 4 -.5Z', 'm'], ['p', 'M4 .5Q16 1 24 1.5L26 3L24 4.5Q16 6 4 5.5Z', 'm'], ['c', 25, -3, 1.7, 'f'], ['c', 25, 3, 1.7, 'f'], ['p', oval(0, 0, 8.5, 7.5), 'h'], ['o', 0, 0, 5, 'gold', .8], ['c', 0, 0, 2.6, 'f']] },
      tur2: { m: [-12, 0], reach: 13, rapid: true, s: [['p', oval(6, -2.2, 6, 1.4), 'm'], ['p', oval(6, 2.2, 6, 1.4), 'm'], ['c', 0, 0, 5, 'h'], ['c', 0, 0, 2.2, 'f']],
        mkS: [['p', oval(6, -3.4, 6, 1.2), 'm'], ['p', oval(7, 0, 6.5, 1.2), 'm'], ['p', oval(6, 3.4, 6, 1.2), 'm'], ['c', 0, 0, 5.5, 'h'], ['o', 0, 0, 4.2, 'gold', .7], ['c', 0, 0, 2.2, 'f']] } },
  ];
  // Buildings: grown, not built. Fleshy mounds ringed with chitin and glands.
  const mound = (r, k) => ['p', poly(k || 9, r, 10), 'd'];
  const BLD = [
    { id: 'recycler', S: 96, R: 48,
      s: [mound(46, 11), ['c', 0, 0, 40, 'h'], ['o', 0, 0, 34, 'm', 3], ...[0, 72, 144, 216, 288].map(a => ['p', oval(f1(Math.cos(a * RAD) * 28), f1(Math.sin(a * RAD) * 28), 6, 6), 'l']), ['c', 0, 0, 20, 'd'], ['c', 0, 0, 15, 'f'],
         ['p', oval(-40, 0, 5, 9), 't'], ['p', 'M36 -10Q48 -6 46 0Q48 6 36 10Z', 'm']],
      pulse: [['c', 0, 0, 9, 'g'], ['c', 0, 0, 4, 'gold']], mk: [['o', 0, 0, 24, 'gold', 2]] },
    { id: 'factory', S: 96, R: 48,
      s: [mound(46, 10), ['p', oval(-6, 0, 38, 34), 'h'], ['p', oval(-10, 0, 24, 22), 'm'], ['p', oval(-10, 0, 17, 15), 'd'], ['p', oval(-44, 0, 4, 10), 't'],
         ['p', 'M18 -20Q42 -12 44 0Q42 12 18 20Q28 0 18 -20Z', 'l'], ...[-24, -10, 4].map(x => ['c', x, -28, 3.5, 'f']), ...[-24, -10, 4].map(x => ['c', x, 28, 3.5, 'f'])],
      pulse: [['p', oval(-10, 0, 10, 8), 'f']], mk: [['o', -10, 0, 20, 'gold', 1.6]] },
    { id: 'repair', S: 96, R: 48,
      s: [mound(46, 12), ['c', 0, 0, 40, 'm'], ['c', 0, 0, 34, 'd'], ...[0, 60, 120, 180, 240, 300].map(a => ['c', f1(Math.cos(a * RAD) * 38), f1(Math.sin(a * RAD) * 38), 4, 't'])],
      pulse: [['c', 0, 0, 26, 'f'], ['o', 0, 0, 30, 'g', 1.6], ['o', 0, 0, 16, 'g', 1.2]] },
    { id: 'extractor', S: 64, R: 32,
      s: [mound(30, 9), ['c', 0, 0, 22, 'h'], ...[0, 90, 180, 270].map(a => ['s', `M${f1(Math.cos((a + 45) * RAD) * 12)} ${f1(Math.sin((a + 45) * RAD) * 12)}L${f1(Math.cos((a + 45) * RAD) * 28)} ${f1(Math.sin((a + 45) * RAD) * 28)}`, 'm', 3.4]),
         ['c', 0, 0, 13, 'd'], ['p', oval(22, 0, 8, 4), 'm'], ['c', 29, 0, 2.6, 't']],
      spin: { rate: -60, s: [['p', 'M0 0Q8 -3 9 -9Q3 -4 0 0Z', 'l'], ['p', 'M0 0Q-8 3 -9 9Q-3 4 0 0Z', 'l'], ['p', 'M0 0Q3 8 9 9Q4 3 0 0Z', 'l'], ['p', 'M0 0Q-3 -8 -9 -9Q-4 -3 0 0Z', 'l']] },
      pulse: [['c', 0, 0, 3, 'f']], mk: [['o', 0, 0, 17, 'gold', 1.4]] },
    { id: 'silo', S: 64, R: 32,
      s: [mound(30, 8), ['c', 0, 0, 23, 'h'], ['o', 0, 0, 19, 'm', 1.6], ['c', 0, 0, 16, 'd'], ['p', oval(22, 0, 8, 4), 'm'], ['p', oval(-24, 0, 3, 7), 't']],
      pulse: [['c', 0, 0, 10, 'f'], ['c', -4, -3, 3, 'g']] },
    { id: 'exsilo', S: 64, R: 32,
      s: [mound(30, 8), ['s', 'M-8 0H16', 'm', 4], ['c', -8, -11, 10, 'h'], ['c', -8, 11, 10, 'h'], ['c', -8, -11, 5, 'f'], ['c', -8, 11, 5, 'f'], ['c', 16, 0, 4, 'l'], ['c', 16, 0, 1.8, 'k']] },
    { id: 'tower', S: 64, R: 32,
      s: [mound(30, 9), ['c', 0, 0, 24, 'h'], ...[0, 45, 90, 135, 180, 225, 270, 315].map(a => ['p', `M${f1(Math.cos((a - 8) * RAD) * 20)} ${f1(Math.sin((a - 8) * RAD) * 20)}L${f1(Math.cos(a * RAD) * 30)} ${f1(Math.sin(a * RAD) * 30)}L${f1(Math.cos((a + 8) * RAD) * 20)} ${f1(Math.sin((a + 8) * RAD) * 20)}Z`, 'l']), ['c', 0, 0, 18, 'm']],
      tur: { m: [0, 0], s: [['p', 'M6 -3.4Q20 -4 29 -2L32 0L29 2Q20 4 6 3.4Z', 'm'], ['c', 30, 0, 2.2, 'f'], ['p', oval(0, 0, 11, 10), 'h'], ['c', 0, 0, 5, 'f'], ['c', 0, 0, 2, 'g'], ['p', oval(-10, 0, 2, 4), 't']] } },
    { id: 'towerArt', S: 64, R: 32,
      s: [mound(30, 9), ['c', 0, 0, 24, 'h'], ['c', 0, 0, 18, 'd'], ...[30, 150, 270].map(a => ['c', f1(Math.cos(a * RAD) * 20), f1(Math.sin(a * RAD) * 20), 4.5, 'f'])],
      tur: { m: [0, 0], s: [['p', 'M4 -4Q20 -5 31 -3L35 0L31 3Q20 5 4 4Z', 'm'], ['s', 'M14 -3.8V3.8M22 -3.6V3.6', 'd', 1], ['c', 33, 0, 2.6, 'f'], ['p', oval(0, 0, 10, 9), 'h'], ['c', 0, 0, 4, 'f'], ['p', oval(-9, 0, 2, 4), 't']] } },
    { id: 'towerHeavy', S: 64, R: 32,
      s: [mound(30, 10), ['c', 0, 0, 26, 'h'], ['o', 0, 0, 21, 'l', 2.4], ['c', 0, 0, 18, 'm'], ...[0, 60, 120, 180, 240, 300].map(a => ['c', f1(Math.cos(a * RAD) * 26), f1(Math.sin(a * RAD) * 26), 2.5, 'gold'])],
      tur: { m: [0, 0], s: [['p', 'M6 -6Q20 -6.5 29 -5L31 -3.4L29 -1.8Q20 -1.2 6 -1Z', 'm'], ['p', 'M6 1Q20 1.2 29 1.8L31 3.4L29 5Q20 6.5 6 6Z', 'm'], ['c', 30, -3.4, 1.8, 'f'], ['c', 30, 3.4, 1.8, 'f'], ['p', oval(0, 0, 12, 11), 'h'], ['c', 0, 0, 5, 'f'], ['p', oval(-11, 0, 2, 4.5), 't']] } },
    { id: 'lab', S: 64, R: 32,
      s: [mound(30, 9), ['c', 0, 0, 22, 'h'], ['o', 0, 0, 18, 'm', 1.4], ['c', 0, 0, 15, 'f'], ['p', oval(-24, 0, 3, 8), 't']],
      spin: { rate: 25, s: [['p', oval(0, -7, 3, 5), 'l'], ['p', oval(0, 7, 3, 5), 'l'], ['p', oval(-7, 0, 5, 3), 'l'], ['p', oval(7, 0, 5, 3), 'l']] }, pulse: [['c', 0, 0, 4, 'g']] },
    { id: 'radar', S: 64, R: 32,
      s: [mound(30, 9), ['c', 0, 0, 20, 'h'], ['o', 0, 0, 16, 't', 2.2], ['c', 0, 0, 12, 'm']],
      spin: { rate: 60, s: [['s', 'M0 0Q8 -2 14 0', 'l', 3], ['c', 15, 0, 5, 'l'], ['c', 16, 0, 3, 'f'], ['c', 17, 0, 1.4, 'k']] } },
  ];
  // A stripe down the back of every beast; a ring of team colour on buildings.
  const mark = d => d.S ? [['o', 0, 0, d.S / 2 - 6, 't', 2.2]]
    : [['s', `M${f1(-d.R * .8)} 0H${f1(d.R * .45)}`, 't', f1(Math.max(1.6, d.R * .16))]];
  root.VexSprites = makeArt(BASE, VEH, BLD, ['#f4ffd0', '#8fe03a'], mark);
}
if (typeof module !== 'undefined' && module.exports) module.exports = { DominionSprites: root.DominionSprites, VexSprites: root.VexSprites };
})(typeof window !== 'undefined' ? window : globalThis);
