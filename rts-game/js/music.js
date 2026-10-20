// =============================================================================
// music.js — THE SOUNDTRACK
//
// Music composed live in the browser with Web Audio (no audio files). A loop
// of four bars in A minor (Am – F – C – G) built from layers that fade in and
// out with the action:
//   pad    long chords                      (always)
//   arp    an arpeggio over the chord       (menu, and when fighting)
//   bass   a pulsing bass line              (in battle)
//   hats   hi-hats                          (in battle, busier when fighting)
//   drums  kick and snare                   (when fighting)
// Each faction has its own sound: Scrapline is gritty and industrial (saw and
// square waves), the Kethra Concord smooth and glassy (sine and triangle
// waves, more echo, an alien flattened second in the arpeggio).
//
// Music.attach(audioContext)   share the game's audio context (phones only
//                              allow sound after a touch)
// Music.play(mood, faction)    mood: 'menu' or 'battle'
// Music.intensity(0..1)        how heated the fighting is (battle mood)
// Music.duck(on)               quieter while paused
// Music.sting(won)             a short victory or defeat phrase, then quiet
// Music.setOn(bool), Music.setVolume(0..1), Music.isOn()
// =============================================================================

(function (root) {
'use strict';

const BPM = 104, STEP = 60 / BPM / 4;          // sixteenth notes
const A2 = 110;
const hz = semi => A2 * Math.pow(2, semi / 12);
// Chord tones (semitones above A2) for each bar of the loop: Am, F, C, G.
const CHORDS = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]];
const ROOTS = [0, -4, 3, -2];
const SOUND = {
  scrapline: { pad: 'sawtooth', padCut: 900, bass: 'sawtooth', arp: 'square', arpCut: 2400, echo: 0.22, flat2: false },
  kethra:    { pad: 'sine',     padCut: 2200, bass: 'triangle', arp: 'sine',  arpCut: 5000, echo: 0.42, flat2: true },
};
// How loud each layer is for a mood (battle: calm → heated, by intensity).
const MIX = {
  menu:   () => ({ pad: 0.55, arp: 0.35, bass: 0, hats: 0, drums: 0 }),
  battle: i => ({ pad: 0.45, arp: 0.08 + 0.32 * i, bass: 0.5 + 0.2 * i, hats: 0.12 + 0.22 * i, drums: Math.max(0, (i - 0.25) / 0.75) * 0.8 }),
  quiet:  () => ({ pad: 0, arp: 0, bass: 0, hats: 0, drums: 0 }),
};

let ctx = null, out = null, echo = null, layers = null, noise = null;
let on = true, volume = 0.5, ducked = false;
let mood = 'quiet', faction = 'scrapline', heat = 0;
let step = 0, nextAt = 0, timer = null;
try { on = localStorage.getItem('scrapline.music') !== 'off'; volume = Number(localStorage.getItem('scrapline.musicVol') || 0.5); } catch (err) { /* optional */ }

function attach(c) {
  if (ctx || !c) return;
  ctx = c;
  out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
  // A feedback echo gives the music some space.
  echo = ctx.createDelay(1); echo.delayTime.value = STEP * 3;
  const fb = ctx.createGain(); fb.gain.value = 0.3; echo.connect(fb).connect(echo);
  const wet = ctx.createGain(); wet.gain.value = 0.22; echo.connect(wet).connect(out);
  echo.wet = wet;
  layers = {};
  for (const k of ['pad', 'arp', 'bass', 'hats', 'drums']) { const g = ctx.createGain(); g.gain.value = 0; g.connect(out); layers[k] = g; }
  layers.arp.connect(echo);
  // One second of white noise for hats and snares.
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0); let s = 1;
  for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
  if (mood !== 'quiet') start();
}

function level() { return on ? volume * (ducked ? 0.35 : 1) : 0; }
function applyMix(t = 0.8) {
  if (!ctx) return;
  const now = ctx.currentTime, m = MIX[mood](heat);
  out.gain.setTargetAtTime(level() * 0.8, now, 0.3);
  for (const k in layers) layers[k].gain.setTargetAtTime(m[k], now, t);
  echo.wet.gain.setTargetAtTime(SOUND[faction].echo, now, 0.5);
}

function start() {
  if (!ctx || timer) return;
  step = 0; nextAt = ctx.currentTime + 0.1;
  timer = setInterval(schedule, 50);
  applyMix(0.4);
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }

// Notes are scheduled a little ahead of time so timing stays steady even
// when the game is busy.
function schedule() {
  if (!ctx || ctx.state !== 'running') return;
  while (nextAt < ctx.currentTime + 0.25) { playStep(step, nextAt); step = (step + 1) % 64; nextAt += STEP; }
}

function tone(layer, type, freq, at, dur, vol, cut) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + Math.min(0.02, dur / 4));
  g.gain.setTargetAtTime(0, at + dur * 0.6, dur * 0.25);
  let node = o;
  if (cut) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; o.connect(f); node = f; }
  node.connect(g).connect(layers[layer]);
  o.start(at); o.stop(at + dur * 1.6 + 0.05);
}
function hit(layer, at, dur, vol, type, freq) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  s.connect(f).connect(g).connect(layers[layer]);
  s.start(at, (at * 7.3) % 0.9); s.stop(at + dur + 0.02);
}
function kick(at, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
  g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
  o.connect(g).connect(layers.drums); o.start(at); o.stop(at + 0.32);
}

function playStep(n, at) {
  const bar = Math.floor(n / 16), s = n % 16, S = SOUND[faction], chord = CHORDS[bar], root = ROOTS[bar];
  // Pad: the chord, held for the whole bar.
  if (s === 0) for (const c of chord) {
    tone('pad', S.pad, hz(c + 12), at, STEP * 16, 0.06, S.padCut);
    tone('pad', S.pad, hz(c + 12) * 1.004, at, STEP * 16, 0.04, S.padCut);   // slight detune for width
  }
  // Arpeggio: up and down the chord in sixteenths (the Kethra add a flattened second).
  const notes = S.flat2 ? [...chord, chord[0] + 1 + 12, chord[1] + 12] : [...chord, chord[0] + 12, chord[1] + 12];
  const k = [0, 1, 2, 3, 4, 3, 2, 1][s % 8];
  if (s % 2 === 0 || heat > 0.5) tone('arp', S.arp, hz(notes[k] + 24), at, STEP * 0.9, 0.05, S.arpCut);
  // Bass: a driving eighth-note pulse with a push before each bar.
  if ([0, 2, 3, 6, 8, 10, 11, 14].includes(s)) tone('bass', S.bass, hz(root - 12 + (s === 14 ? 7 : 0)), at, STEP * 1.6, 0.16, 500);
  // Hats: eighths, sixteenths when it's heated.
  if (s % 2 === 0 || heat > 0.6) hit('hats', at, 0.04, s % 4 === 2 ? 0.12 : 0.07, 'highpass', 7000);
  // Drums: kick on the beat with a syncopated push, snare on 2 and 4.
  if (s === 0 || s === 8 || s === 10 || (s === 3 && bar % 2)) kick(at, 0.9);
  if (s === 4 || s === 12) hit('drums', at, 0.16, 0.35, 'bandpass', 1800);
}

const Music = {
  attach,
  play(m, f) {
    mood = m; if (f && SOUND[f]) faction = f;
    if (m === 'battle') heat = 0;
    if (ctx) { start(); applyMix(m === 'menu' ? 1.5 : 0.8); }
  },
  intensity(i) {
    const v = Math.max(0, Math.min(1, i));
    if (Math.abs(v - heat) < 0.04) return;
    const rising = v > heat;
    heat = v; applyMix(rising ? 0.6 : 3);   // in quickly, out slowly
  },
  duck(d) { ducked = d; applyMix(); },
  sting(won) {
    if (!ctx || !on) { mood = 'quiet'; applyMix(); return; }
    mood = 'quiet'; applyMix(0.3); stop();
    // Victory: a rising major phrase. Defeat: a falling minor one.
    const t = ctx.currentTime + 0.4, phrase = won ? [0, 4, 7, 12, 16] : [12, 10, 7, 3, 0];
    layers.arp.gain.cancelScheduledValues(t - 0.3); layers.arp.gain.setValueAtTime(0.9, t - 0.05);
    phrase.forEach((p, i) => tone('arp', SOUND[faction].arp === 'sine' ? 'triangle' : 'square', hz(p + 24), t + i * 0.22, won && i === phrase.length - 1 ? 1.4 : 0.3, 0.07, 3000));
    layers.arp.gain.setTargetAtTime(0, t + 2.2, 0.4);
  },
  setOn(v) { on = !!v; try { localStorage.setItem('scrapline.music', on ? 'on' : 'off'); } catch (err) { /* optional */ } applyMix(); },
  setVolume(v) { volume = Math.max(0, Math.min(1, v)); try { localStorage.setItem('scrapline.musicVol', String(volume)); } catch (err) { /* optional */ } applyMix(); },
  isOn: () => on,
  getVolume: () => volume,
  _out: () => out,   // for tests: the music's output
};
root.Music = Music;
})(typeof window !== 'undefined' ? window : globalThis);
