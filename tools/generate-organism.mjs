#!/usr/bin/env node
/**
 * generate-organism.mjs
 *
 * Grows the organism. Reads data/organism.json (the genome) and emits
 * assets/organism.svg — a single self-contained, animated SVG that is the
 * entire GitHub profile.
 *
 * No dependencies. No JavaScript inside the output (GitHub strips it):
 * every bit of life is SMIL + CSS, which GitHub does render through <img>.
 *
 *   node tools/generate-organism.mjs
 *
 * Metabolism can be fed from the outside (see .github/workflows/metabolism.yml):
 *   ORG_COMMITS=214 ORG_ACTIVE_DAYS=63 ORG_WEEKS=1,4,0,9,... node tools/generate-organism.mjs
 * If nothing is supplied, the values already stored in the genome are reused,
 * so a failed API call can never produce a dead-looking organism.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GENOME = join(ROOT, 'data', 'organism.json');
const OUT = join(ROOT, 'assets', 'organism.svg');

/* ------------------------------------------------------------------ *
 * deterministic randomness
 * the organism must look hand-grown but regenerate identically,
 * otherwise every workflow run would churn the whole file.
 * ------------------------------------------------------------------ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(0x5eed17);
const R = () => rnd();
const rr = (a, b) => a + (b - a) * R();
const pick = (arr) => arr[Math.floor(R() * arr.length)];

/* ------------------------------------------------------------------ *
 * canvas
 * ------------------------------------------------------------------ */
const W = 1680, H = 940;
const CX = 840, CY = 470;
const RX = 690, RY = 378;

const F = (n) => Math.round(n * 100) / 100;
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ *
 * curves: catmull-rom through points -> smooth cubic bezier
 * ------------------------------------------------------------------ */
function smooth(pts, tension = 0.5) {
  if (pts.length < 2) return '';
  let d = `M${F(pts[0].x)} ${F(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension * 2;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension * 2;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension * 2;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension * 2;
    d += `C${F(c1x)} ${F(c1y)} ${F(c2x)} ${F(c2y)} ${F(p2.x)} ${F(p2.y)}`;
  }
  return d;
}

/** resample a polyline so t in [0,1] maps to arc-length-ish position */
function at(pts, t) {
  const i = Math.min(pts.length - 2, Math.max(0, Math.floor(t * (pts.length - 1))));
  const local = t * (pts.length - 1) - i;
  const a = pts[i], b = pts[i + 1];
  return {
    x: a.x + (b.x - a.x) * local,
    y: a.y + (b.y - a.y) * local,
    ang: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

/**
 * Strokes cannot taper in SVG, so a limb is drawn as a run of short
 * overlapping segments whose width falls off — the way an axon actually thins.
 */
function tapered(pts, w0, w1, color, op0, op1, segs = 12) {
  let out = '';
  for (let s = 0; s < segs; s++) {
    const t0 = s / segs, t1 = (s + 1.06) / segs;
    const slice = [];
    const n = 5;
    for (let k = 0; k <= n; k++) slice.push(at(pts, Math.min(1, t0 + (t1 - t0) * (k / n))));
    const w = w0 + (w1 - w0) * (s / segs);
    const o = op0 + (op1 - op0) * (s / segs);
    out += `<path d="${smooth(slice)}" fill="none" stroke="${color}" stroke-width="${F(w)}" stroke-linecap="round" opacity="${F(o)}"/>`;
  }
  return out;
}

/** irregular closed blob */
function blob(cx, cy, rx, ry, lobes, wobble, phase = 0) {
  const pts = [];
  const n = lobes * 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1
      + Math.sin(a * lobes + phase) * wobble
      + Math.sin(a * (lobes * 2 + 1) - phase * 1.7) * wobble * 0.45;
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  pts.push(pts[0], pts[1]);
  return smooth(pts) + 'Z';
}

/* ------------------------------------------------------------------ *
 * genome + metabolism
 * ------------------------------------------------------------------ */
const genome = JSON.parse(readFileSync(GENOME, 'utf8'));
const met = genome.metabolism || {};

if (process.env.ORG_COMMITS) met.commits = parseInt(process.env.ORG_COMMITS, 10) || met.commits;
if (process.env.ORG_ACTIVE_DAYS) met.activeDays = parseInt(process.env.ORG_ACTIVE_DAYS, 10) || met.activeDays;
if (process.env.ORG_REPOS) met.repos = parseInt(process.env.ORG_REPOS, 10) || met.repos;
if (process.env.ORG_WEEKS) {
  const w = process.env.ORG_WEEKS.split(',').map((n) => parseInt(n, 10) || 0);
  if (w.length > 4) met.weeks = w;
}

// Fallback weeks: a plausible, self-consistent trace so the gauge is never empty.
if (!met.weeks || met.weeks.length < 8) {
  const g = mulberry32(0xc0ffee);
  met.weeks = Array.from({ length: 52 }, (_, i) =>
    Math.max(0, Math.round(6 + Math.sin(i / 5.1) * 4 + Math.sin(i / 1.7) * 2 + g() * 7)));
}
const weeks = met.weeks.slice(-52);
const totalCommits = met.commits || weeks.reduce((a, b) => a + b, 0);
const peak = Math.max(1, ...weeks);
const recent = weeks.slice(-8).reduce((a, b) => a + b, 0) / 8;
// vitality drives particle density, glow and impulse speed: 0.35 .. 1
const vitality = Math.max(0.35, Math.min(1, recent / (peak * 0.72 || 1)));
met.updated = new Date().toISOString().slice(0, 10);

const PARTICLE_BUDGET = Math.round(66 + vitality * 78);
const MOTE_BUDGET = Math.round(70 + vitality * 55);

/* ------------------------------------------------------------------ *
 * grow the skeleton
 * ------------------------------------------------------------------ */
const limbs = [];      // { id, pts, hue, label, ... }
const dendrites = [];  // { id, pts, hue, w }
let uid = 0;
const nid = (p) => `${p}${(uid++).toString(36)}`;

for (const b of genome.branches) {
  const a = (b.angle * Math.PI) / 180;
  const dir = { x: Math.cos(a), y: -Math.sin(a) };
  const perp = { x: -dir.y, y: dir.x };
  const curl = rr(-1, 1) * 58;
  const wob = rr(30, 52);
  const steps = 9;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const rad = 0.115 + t * (b.reach - 0.115);
    const bx = CX + dir.x * RX * rad;
    const by = CY + dir.y * RY * rad;
    const swell = Math.sin(t * Math.PI);
    const off = swell * Math.sin(t * 5.3 + b.angle) * wob + curl * Math.pow(t, 1.7);
    pts.push({ x: bx + perp.x * off, y: by + perp.y * off });
  }
  const limb = { ...b, id: nid('L'), pts, dir, perp };
  limbs.push(limb);

  // dendrites: secondary and tertiary growth
  const seeds = [0.3, 0.44, 0.58, 0.7, 0.81, 0.9];
  for (const s of seeds) {
    for (const sgn of [1, -1]) {
      if (R() > 0.72) continue;
      const base = at(pts, s);
      const spread = ((rr(24, 62) * Math.PI) / 180) * sgn;
      const ang = base.ang + spread;
      const len = rr(46, 128) * (1.12 - s);
      const dp = [base];
      const n = 5;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const drift = Math.sin(t * 3.1 + s * 9) * len * 0.22;
        dp.push({
          x: base.x + Math.cos(ang) * len * t - Math.sin(ang) * drift,
          y: base.y + Math.sin(ang) * len * t + Math.cos(ang) * drift,
        });
      }
      const den = { id: nid('D'), pts: dp, hue: b.hue, w: rr(1.1, 2.3) };
      dendrites.push(den);

      // tertiary
      if (R() > 0.45) {
        const tb = at(dp, rr(0.55, 0.9));
        const ta = tb.ang + ((rr(20, 55) * Math.PI) / 180) * (R() > 0.5 ? 1 : -1);
        const tl = rr(22, 58);
        const tp = [tb];
        for (let k = 1; k <= 3; k++) {
          const t = k / 3;
          tp.push({
            x: tb.x + Math.cos(ta) * tl * t + Math.sin(ta) * Math.sin(t * 3) * 7,
            y: tb.y + Math.sin(ta) * tl * t - Math.cos(ta) * Math.sin(t * 3) * 7,
          });
        }
        dendrites.push({ id: nid('D'), pts: tp, hue: b.hue, w: rr(0.6, 1.2) });
      }
    }
  }
}

const limbById = Object.fromEntries(limbs.map((l) => [l.id, l]));
const byBranch = Object.fromEntries(limbs.map((l) => [l.label ? l.id : l.id, l]));
const findLimb = (bid) => limbs.find((l) => l.id === bid) || limbs.find((l) => l.idKey === bid);

/** place a satellite structure hanging off a limb */
function anchor(branchId, t, side, dist) {
  const limb = limbs.find((l) => l.id === branchId) || limbs[0];
  const p = at(limb.pts, t);
  const px = -Math.sin(p.ang) * side, py = Math.cos(p.ang) * side;
  return { hx: p.x, hy: p.y, x: p.x + px * dist, y: p.y + py * dist, limb };
}
const limbOf = (key) => limbs.find((l) => l.id && genome.branches.find((b) => b.id === key)?.label === l.label);

/* ------------------------------------------------------------------ *
 * SVG assembly
 * ------------------------------------------------------------------ */
const defs = [];
const layers = { field: '', membrane: '', limbs: '', cells: '', skills: '', core: '', particles: '', motes: '', hud: '' };

const pathDefs = [];
const registerPath = (id, d) => { pathDefs.push(`<path id="${id}" d="${d}" fill="none"/>`); };

/** every piece of readout text is queued here and de-collided before drawing */
const labels = [];

/* ---- field: nebula, dust, vignette ---- */
layers.field += `<rect width="${W}" height="${H}" fill="#03050A"/>`;
layers.field += `<ellipse cx="${CX}" cy="${CY}" rx="${RX + 200}" ry="${RY + 160}" fill="url(#nebula)"/>`;
layers.field += `<g class="drift-a" opacity="0.5"><ellipse cx="${CX - 240}" cy="${CY - 90}" rx="330" ry="220" fill="url(#hazeC)"/></g>`;
layers.field += `<g class="drift-b" opacity="0.45"><ellipse cx="${CX + 280}" cy="${CY + 70}" rx="360" ry="200" fill="url(#hazeB)"/></g>`;

// faint substrate speckle — the medium the specimen sits in
{
  const g = mulberry32(0x51ce);
  let s = '';
  for (let i = 0; i < 340; i++) {
    const a = g() * Math.PI * 2, r = Math.pow(g(), 0.55);
    const x = CX + Math.cos(a) * RX * 1.18 * r;
    const y = CY + Math.sin(a) * RY * 1.18 * r;
    s += `<circle cx="${F(x)}" cy="${F(y)}" r="${F(0.4 + g() * 0.9)}" fill="#7FE9E0" opacity="${F(0.03 + g() * 0.09)}"/>`;
  }
  layers.field += `<g>${s}</g>`;
}

/* ---- membrane ---- */
{
  const m1 = blob(CX, CY, RX * 0.98, RY * 0.99, 5, 0.045, 0.4);
  const m2 = blob(CX, CY, RX * 0.9, RY * 0.9, 7, 0.038, 2.1);
  const m3 = blob(CX, CY, RX * 0.62, RY * 0.66, 6, 0.05, 4.4);
  layers.membrane += `<g class="breathe-slow">`
    + `<path d="${m1}" fill="url(#cyto)" stroke="#2A4A55" stroke-width="1.1" opacity="0.55"/>`
    + `<path d="${m1}" fill="none" stroke="#7FE9E0" stroke-width="0.6" opacity="0.20" class="flow-slow"/>`
    + `</g>`;
  layers.membrane += `<g class="breathe-mid"><path d="${m2}" fill="none" stroke="#3E6C74" stroke-width="0.7" opacity="0.32" stroke-dasharray="2 9" class="crawl"/></g>`;
  layers.membrane += `<g class="breathe-fast"><path d="${m3}" fill="none" stroke="#57808A" stroke-width="0.6" opacity="0.22" stroke-dasharray="1 14"/></g>`;

  // cilia along the outer membrane
  let cil = '';
  for (let i = 0; i < 170; i++) {
    const a = (i / 170) * Math.PI * 2;
    const k = 1 + Math.sin(a * 5 + 0.4) * 0.045 + Math.sin(a * 11 - 0.68) * 0.02;
    const x = CX + Math.cos(a) * RX * 0.98 * k;
    const y = CY + Math.sin(a) * RY * 0.99 * k;
    const nx = Math.cos(a), ny = Math.sin(a);
    const len = 4 + R() * 11;
    cil += `<line x1="${F(x)}" y1="${F(y)}" x2="${F(x + nx * len)}" y2="${F(y + ny * len)}" stroke="#6FD8D0" stroke-width="0.7" opacity="${F(0.06 + R() * 0.16)}" class="cil" style="animation-delay:-${F(R() * 9)}s;animation-duration:${F(5 + R() * 6)}s"/>`;
  }
  layers.membrane += `<g class="breathe-slow">${cil}</g>`;
}

/* ---- limbs (major neural systems) ---- */
for (const l of limbs) {
  const d = smooth(l.pts);
  registerPath(l.id, d);
  let g = '';
  g += `<path d="${d}" fill="none" stroke="${l.hue}" stroke-width="14" opacity="0.05" stroke-linecap="round"/>`;
  g += tapered(l.pts, 6.2, 1.1, l.hue, 0.5, 0.24, 14);
  g += `<path d="${d}" fill="none" stroke="#DDF7FA" stroke-width="0.8" opacity="0.18" stroke-dasharray="1 7" class="crawl"/>`;
  // myelin bands
  for (let i = 1; i < 9; i++) {
    const p = at(l.pts, i / 9.5);
    const nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
    const w = 5.5 * (1 - i / 12);
    g += `<line x1="${F(p.x - nx * w)}" y1="${F(p.y - ny * w)}" x2="${F(p.x + nx * w)}" y2="${F(p.y + ny * w)}" stroke="${l.hue}" stroke-width="0.8" opacity="0.22"/>`;
  }
  layers.limbs += `<g class="limb">${g}</g>`;

  // terminus label — the system name, emerging from tissue rather than sitting on it
  const end = at(l.pts, 0.999);
  const outward = { x: Math.cos((l.angle * Math.PI) / 180), y: -Math.sin((l.angle * Math.PI) / 180) };
  const lx = end.x + outward.x * 26;
  const ly = end.y + outward.y * 20;
  const anchorAttr = outward.x < -0.25 ? 'end' : outward.x > 0.25 ? 'start' : 'middle';
  layers.limbs += `<g class="term" style="animation-delay:-${F(R() * 8)}s">`
    + `<circle cx="${F(end.x)}" cy="${F(end.y)}" r="3.4" fill="${l.hue}" opacity="0.75"/>`
    + `<circle cx="${F(end.x)}" cy="${F(end.y)}" r="9" fill="none" stroke="${l.hue}" stroke-width="0.7" opacity="0.3"/>`
    + `<text class="mono sys" x="${F(lx)}" y="${F(ly)}" text-anchor="${anchorAttr}" fill="${l.hue}">${esc(l.label)}</text>`
    + `<text class="mono note" x="${F(lx)}" y="${F(ly + 13)}" text-anchor="${anchorAttr}">${esc(l.note)}</text>`
    + `</g>`;
}

/* ---- dendrites ---- */
for (const dn of dendrites) {
  const d = smooth(dn.pts);
  registerPath(dn.id, d);
  layers.limbs += `<path d="${d}" fill="none" stroke="${dn.hue}" stroke-width="${F(dn.w)}" opacity="${F(0.12 + R() * 0.16)}" stroke-linecap="round"/>`;
  const tip = dn.pts[dn.pts.length - 1];
  if (R() > 0.4) {
    layers.limbs += `<circle cx="${F(tip.x)}" cy="${F(tip.y)}" r="${F(0.9 + R() * 1.8)}" fill="${dn.hue}" opacity="0.4" class="syn" style="animation-delay:-${F(R() * 24)}s;animation-duration:${F(11 + R() * 16)}s"/>`;
  }
}

/* ---- project nodes: organelles ---- */
const branchIdToLimb = {};
genome.branches.forEach((b, i) => { branchIdToLimb[b.id] = limbs[i]; });

for (const n of genome.nodes) {
  const limb = branchIdToLimb[n.branch] || limbs[0];
  const p = at(limb.pts, n.t);
  const nx = -Math.sin(p.ang) * n.side, ny = Math.cos(p.ang) * n.side;
  const x = p.x + nx * n.spread, y = p.y + ny * n.spread;
  const hue = limb.hue;
  const s = n.size;

  // umbilical: every organelle stays wired to its limb, and so to the core
  const mid = { x: (p.x + x) / 2 - ny * 9, y: (p.y + y) / 2 + nx * 9 };
  const conn = `M${F(p.x)} ${F(p.y)}Q${F(mid.x)} ${F(mid.y)} ${F(x)} ${F(y)}`;
  const connId = nid('C');
  registerPath(connId, conn);
  layers.cells += `<path d="${conn}" fill="none" stroke="${hue}" stroke-width="1.5" opacity="0.28"/>`;
  layers.cells += `<path d="${conn}" fill="none" stroke="#EAFBFF" stroke-width="0.6" opacity="0.16" stroke-dasharray="1.5 6" class="crawl"/>`;

  let g = `<g class="cell" style="animation-delay:-${F(R() * 12)}s;animation-duration:${F(7 + R() * 6)}s">`;
  g += `<circle cx="${F(x)}" cy="${F(y)}" r="${F(s * 3.1)}" fill="${hue}" opacity="0.045"/>`;
  g += `<path d="${blob(x, y, s * 1.85, s * 1.7, 5, 0.07, R() * 6)}" fill="${hue}" opacity="0.05" stroke="${hue}" stroke-width="0.7" stroke-opacity="0.32"/>`;
  g += `<path d="${blob(x, y, s * 1.2, s * 1.16, 6, 0.06, R() * 6)}" fill="#061016" opacity="0.85" stroke="${hue}" stroke-width="0.8" stroke-opacity="0.5"/>`;
  g += `<circle cx="${F(x)}" cy="${F(y)}" r="${F(s * 0.52)}" fill="${hue}" opacity="0.8"/>`;
  g += `<circle cx="${F(x)}" cy="${F(y)}" r="${F(s * 0.26)}" fill="#F2FDFF" opacity="0.9"/>`;
  // satellite vesicles
  const sats = 5 + Math.floor(R() * 5);
  for (let i = 0; i < sats; i++) {
    const a = R() * Math.PI * 2, d = s * rr(1.25, 1.75);
    g += `<circle cx="${F(x + Math.cos(a) * d)}" cy="${F(y + Math.sin(a) * d * 0.92)}" r="${F(rr(0.8, 2.1))}" fill="${hue}" opacity="${F(rr(0.3, 0.75))}" class="syn" style="animation-delay:-${F(R() * 20)}s;animation-duration:${F(9 + R() * 14)}s"/>`;
  }
  // orbiting ring
  g += `<ellipse cx="${F(x)}" cy="${F(y)}" rx="${F(s * 2.25)}" ry="${F(s * 0.9)}" fill="none" stroke="${hue}" stroke-width="0.55" opacity="0.22" transform="rotate(${F(rr(-40, 40))} ${F(x)} ${F(y)})"/>`;
  g += `</g>`;

  layers.cells += g;

  // the readout is not drawn yet — every tag goes through the relaxation pass
  // below so that no two specimen labels ever sit on top of each other
  labels.push({
    kind: 'node', hue, cx: x, cy: y, gap: s * 2.4 + 9,
    lines: [
      { t: n.name, cls: 'nm', size: 10.5, ls: 2.2, fill: hue, dy: 0 },
      { t: n.tech, cls: 'meta', size: 7.4, ls: 1.5, fill: null, dy: 11.5 },
      { t: n.status, cls: 'st', size: 7, ls: 2.4, fill: hue, dy: 22 },
    ],
    up: 8.5, down: 26,
  });
}

/* ---- skills: cell morphologies, discovered rather than listed ---- */
function morph(form, x, y, hue, seed) {
  const g = mulberry32(seed);
  let s = '';
  if (form === 'hex') {
    const r = 8.5;
    const p = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      p.push(`${F(x + Math.cos(a) * r)},${F(y + Math.sin(a) * r)}`);
    }
    s += `<polygon points="${p.join(' ')}" fill="${hue}" fill-opacity="0.07" stroke="${hue}" stroke-width="0.8" opacity="0.7"/>`;
    s += `<circle cx="${F(x)}" cy="${F(y)}" r="2" fill="${hue}" opacity="0.8"/>`;
  } else if (form === 'rod') {
    const a = g() * Math.PI;
    s += `<g transform="rotate(${F((a * 180) / Math.PI)} ${F(x)} ${F(y)})">`
      + `<rect x="${F(x - 11)}" y="${F(y - 3.6)}" width="22" height="7.2" rx="3.6" fill="${hue}" fill-opacity="0.07" stroke="${hue}" stroke-width="0.8" opacity="0.7"/>`
      + `<circle cx="${F(x - 4)}" cy="${F(y)}" r="1.5" fill="${hue}" opacity="0.7"/>`
      + `<circle cx="${F(x + 4)}" cy="${F(y)}" r="1.5" fill="${hue}" opacity="0.7"/></g>`;
  } else if (form === 'spiral') {
    const pts = [];
    for (let i = 0; i <= 46; i++) {
      const t = i / 46, a = t * Math.PI * 3.4, r = 1.6 + t * 9.4;
      pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }
    s += `<path d="${smooth(pts)}" fill="none" stroke="${hue}" stroke-width="0.9" opacity="0.6"/>`;
    s += `<circle cx="${F(x)}" cy="${F(y)}" r="1.6" fill="${hue}" opacity="0.85"/>`;
  } else {
    for (let i = 0; i < 7; i++) {
      const a = g() * Math.PI * 2, d = g() * 9.5;
      s += `<circle cx="${F(x + Math.cos(a) * d)}" cy="${F(y + Math.sin(a) * d)}" r="${F(1.1 + g() * 1.8)}" fill="${hue}" opacity="${F(0.35 + g() * 0.45)}"/>`;
    }
    s += `<circle cx="${F(x)}" cy="${F(y)}" r="11" fill="none" stroke="${hue}" stroke-width="0.5" opacity="0.22"/>`;
  }
  return s;
}

let skillSeed = 1;
for (const sk of genome.skills) {
  const limb = branchIdToLimb[sk.branch] || limbs[0];
  const p = at(limb.pts, sk.t);
  const nx = -Math.sin(p.ang) * sk.side, ny = Math.cos(p.ang) * sk.side;
  const x = p.x + nx * sk.d, y = p.y + ny * sk.d;
  const hue = limb.hue;
  layers.skills += `<line x1="${F(p.x)}" y1="${F(p.y)}" x2="${F(x)}" y2="${F(y)}" stroke="${hue}" stroke-width="0.6" opacity="0.18"/>`;
  layers.skills += `<g class="cellmini" style="animation-delay:-${F(R() * 14)}s;animation-duration:${F(8 + R() * 7)}s">`
    + morph(sk.form, x, y, hue, 0x9000 + skillSeed++)
    + `</g>`;
  labels.push({
    kind: 'skill', hue: null, cx: x, cy: y + 3.4, gap: 15,
    lines: [{ t: sk.label, cls: 'sk', size: 6.8, ls: 1.9, fill: null, dy: 0 }],
    up: 5, down: 5,
  });
}

/* ------------------------------------------------------------------ *
 * label relaxation
 * Organic layout means labels land wherever the tissue grew. Rather than
 * hand-nudging coordinates, push overlapping readouts apart vertically
 * until the plate is legible, then draw a leader back to the structure.
 * ------------------------------------------------------------------ */
{
  const wOf = (l) => Math.max(...l.lines.map((ln) => ln.t.length * (ln.size * 0.61 + ln.ls)));

  for (const l of labels) {
    l.w = wOf(l);
    // prefer pointing outward from the core, but flip if we would run off-plate
    l.side = l.cx >= CX ? 1 : -1;
    if (l.side === 1 && l.cx + l.gap + l.w > W - 44) l.side = -1;
    if (l.side === -1 && l.cx - l.gap - l.w < 44) l.side = 1;
    l.x = l.cx + l.side * l.gap;
    l.y = l.cy;
  }

  // static keep-out zones: the core designation and the instrument corners
  const walls = [
    { x0: CX - 235, x1: CX + 235, y0: CY + 92, y1: CY + 190 },
    { x0: 30, x1: 360, y0: 30, y1: 122 },
    { x0: W - 360, x1: W - 30, y0: 30, y1: 122 },
    { x0: 30, x1: 380, y0: H - 130, y1: H - 20 },
    { x0: W - 240, x1: W - 30, y0: H - 190, y1: H - 20 },
  ];
  const box = (l) => ({
    x0: l.side === 1 ? l.x : l.x - l.w, x1: l.side === 1 ? l.x + l.w : l.x,
    y0: l.y - l.up, y1: l.y + l.down,
  });
  const hit = (a, b) => a.x0 < b.x1 + 6 && b.x0 < a.x1 + 6 && a.y0 < b.y1 + 4 && b.y0 < a.y1 + 4;

  for (let pass = 0; pass < 90; pass++) {
    let moved = 0;
    for (let i = 0; i < labels.length; i++) {
      const A = labels[i], ba = box(A);
      for (const w of walls) {
        if (hit(ba, w)) {
          const push = A.y < (w.y0 + w.y1) / 2 ? -1 : 1;
          A.y += push * 3; moved++;
        }
      }
      for (let j = i + 1; j < labels.length; j++) {
        const B = labels[j];
        const bb = box(B);
        if (!hit(box(A), bb)) continue;
        // node readouts outrank skill labels: skills yield first
        const wA = A.kind === 'node' ? 0.35 : 1, wB = B.kind === 'node' ? 0.35 : 1;
        const dir = A.y <= B.y ? -1 : 1;
        A.y += dir * 2.4 * wA;
        B.y -= dir * 2.4 * wB;
        moved++;
      }
    }
    if (!moved) break;
  }

  for (const l of labels) {
    l.y = Math.max(46 + l.up, Math.min(H - 40 - l.down, l.y));
    const anc = l.side === 1 ? 'start' : 'end';
    const lead = `<path d="M${F(l.cx + l.side * (l.gap - 7))} ${F(l.cy)}Q${F(l.x - l.side * 5)} ${F(l.cy)} ${F(l.x - l.side * 3)} ${F(l.y)}" fill="none" stroke="${l.hue || '#4A6570'}" stroke-width="0.6" opacity="${l.kind === 'node' ? 0.32 : 0.2}"/>`;
    let txt = '';
    for (const ln of l.lines) {
      txt += `<text class="mono ${ln.cls}" x="${F(l.x)}" y="${F(l.y + ln.dy)}" text-anchor="${anc}"${ln.fill ? ` fill="${ln.fill}"` : ''}>${esc(ln.t)}</text>`;
    }
    const target = l.kind === 'node' ? 'cells' : 'skills';
    layers[target] += `<g class="tag">${lead}${txt}</g>`;
  }
}

/* ---- core: the nucleus ---- */
{
  let g = '';
  g += `<circle cx="${CX}" cy="${CY}" r="272" fill="url(#coreGlow)" class="halo"/>`;
  // concentric organic shells, counter-rotating
  const shells = [
    { r: 140, ry: 128, w: 0.8, o: 0.32, dash: '3 12', spin: 'spin-a' },
    { r: 114, ry: 106, w: 0.7, o: 0.28, dash: '1 9', spin: 'spin-b' },
    { r: 88, ry: 83, w: 0.9, o: 0.36, dash: '18 10', spin: 'spin-c' },
  ];
  for (const s of shells) {
    g += `<g class="${s.spin}"><ellipse cx="${CX}" cy="${CY}" rx="${s.r}" ry="${s.ry}" fill="none" stroke="#7FE9E0" stroke-width="${s.w}" stroke-dasharray="${s.dash}" opacity="${s.o}"/></g>`;
  }
  // chromatin: tangled interior filaments
  let fil = '';
  for (let i = 0; i < 22; i++) {
    const a0 = R() * Math.PI * 2;
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const a = a0 + t * rr(1.2, 3.4);
      const r = 12 + Math.sin(t * Math.PI) * rr(18, 54);
      pts.push({ x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r * 0.92 });
    }
    fil += `<path d="${smooth(pts)}" fill="none" stroke="${pick(['#7FE9E0', '#79C0FF', '#F2CC60', '#7EE787'])}" stroke-width="${F(rr(0.5, 1.1))}" opacity="${F(rr(0.12, 0.34))}"/>`;
  }
  g += `<g class="breathe-core">`
    + `<path d="${blob(CX, CY, 74, 69, 6, 0.055, 1.2)}" fill="url(#nucleus)" stroke="#8FF3EA" stroke-width="1" stroke-opacity="0.5"/>`
    + fil
    + `</g>`;

  // nucleolus
  g += `<circle cx="${CX}" cy="${CY}" r="21" fill="url(#nucleolus)" class="pulse-core"/>`;
  g += `<circle cx="${CX}" cy="${CY}" r="6" fill="#F6FEFF" opacity="0.94" class="pulse-core"/>`;

  // designation — the identity cluster reads out of the core itself
  g += `<ellipse cx="${CX}" cy="${CY + 132}" rx="290" ry="60" fill="url(#clear)"/>`;
  g += `<text class="mono name" x="${CX}" y="${CY + 126}" text-anchor="middle">DEEBYANSHU JHA</text>`;
  g += `<line x1="${CX - 96}" y1="${CY + 137}" x2="${CX + 96}" y2="${CY + 137}" stroke="#7FE9E0" stroke-width="0.6" opacity="0.28"/>`;
  g += `<text class="mono namesub2" x="${CX}" y="${CY + 152}" text-anchor="middle">IDENTITY</text>`;
  g += `<text class="mono ident" x="${CX}" y="${CY + 166}" text-anchor="middle">COMPUTER SCIENCE STUDENT &#183; BUILDER</text>`;
  g += `<text class="mono ident" x="${CX}" y="${CY + 179}" text-anchor="middle">${esc(genome.specimen.substrate)}</text>`;
  layers.core += g;
}

/* ---- impulses travelling the network ---- */
{
  const carriers = [
    ...limbs.map((l) => ({ id: l.id, hue: l.hue, weight: 4, speed: rr(7, 11) })),
    ...dendrites.map((d) => ({ id: d.id, hue: d.hue, weight: 1, speed: rr(3.4, 6.4) })),
  ];
  const pool = [];
  for (const c of carriers) for (let i = 0; i < c.weight; i++) pool.push(c);

  for (let i = 0; i < PARTICLE_BUDGET; i++) {
    const c = pool[i % pool.length];
    const inward = R() > 0.74;
    const dur = F(c.speed * rr(0.75, 1.5) / (0.7 + vitality * 0.55));
    const begin = F(-R() * dur * 3);
    const rBig = F(rr(3.4, 6.6));
    const rSm = F(rr(0.9, 1.7));
    const kp = inward ? ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : '';
    layers.particles += `<g opacity="0">`
      + `<animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite"${kp}><mpath href="#${c.id}" xlink:href="#${c.id}"/></animateMotion>`
      + `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.09;0.82;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>`
      + `<circle r="${rBig}" fill="${c.hue}" opacity="0.13"/>`
      + `<circle r="${rSm}" fill="#F4FEFF" opacity="0.92"/>`
      + `</g>`;
  }
}

/* ---- free-floating motes in the medium ---- */
{
  let s = '';
  for (let i = 0; i < MOTE_BUDGET; i++) {
    const a = R() * Math.PI * 2, k = Math.pow(R(), 0.5);
    const x = CX + Math.cos(a) * RX * 1.12 * k;
    const y = CY + Math.sin(a) * RY * 1.12 * k;
    const dx = F(rr(-26, 26)), dy = F(rr(-20, 20));
    const dur = F(rr(14, 34));
    s += `<circle cx="${F(x)}" cy="${F(y)}" r="${F(rr(0.5, 1.7))}" fill="${pick(['#7FE9E0', '#79C0FF', '#7EE787', '#F2CC60', '#CFE9F2'])}" opacity="${F(rr(0.12, 0.5))}">`
      + `<animateTransform attributeName="transform" type="translate" values="0 0;${dx} ${dy};${F(-dx * 0.7)} ${F(dy * 0.5)};0 0" dur="${dur}s" begin="${F(-R() * dur)}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.34;0.68;1" keySplines=".4 0 .6 1;.4 0 .6 1;.4 0 .6 1"/>`
      + `<animate attributeName="opacity" values="${F(rr(0.05, 0.2))};${F(rr(0.35, 0.7))};${F(rr(0.05, 0.2))}" dur="${F(rr(5, 13))}s" begin="${F(-R() * 12)}s" repeatCount="indefinite"/>`
      + `</circle>`;
  }
  layers.motes = s;
}

/* ---- instrument HUD ---- */
{
  const sp = genome.specimen;
  let g = '';
  const T = (x, y, cls, txt, extra = '') => `<text class="mono ${cls}" x="${x}" y="${y}" ${extra}>${esc(txt)}</text>`;

  g += `<g opacity="0.9">`;
  g += T(44, 52, 'hud hud-b', `SPECIMEN ${sp.id}`);
  g += T(44, 68, 'hud', `DESIGNATION ${sp.designation}`);
  g += T(44, 82, 'hud', `CLASS ${sp.classification}`);
  g += T(44, 96, 'hud', `HABITAT ${sp.habitat}`);
  g += T(44, 110, 'hud', `GERMINATED ${sp.germination}`);

  g += T(W - 44, 52, 'hud hud-b', `LIVE CULTURE`, 'text-anchor="end"');
  g += T(W - 44, 68, 'hud', `OBSERVED ${met.updated}`, 'text-anchor="end"');
  g += T(W - 44, 82, 'hud', `ORGANELLES ${genome.nodes.length}`, 'text-anchor="end"');
  g += T(W - 44, 96, 'hud', `COLONIES ${met.repos || genome.metabolism.repos || 26}`, 'text-anchor="end"');
  g += T(W - 44, 110, 'hud', `NEURAL SYSTEMS ${genome.branches.length}`, 'text-anchor="end"');
  g += `<circle cx="${W - 36}" cy="47" r="3" fill="#7EE787" class="heartbeat"/>`;
  g += `</g>`;

  // metabolism trace: 52 weeks of commit activity as a respiration chart
  const bx = 44, by = H - 52, bw = 300, bh = 34;
  g += T(bx, by - bh - 12, 'hud hud-b', 'METABOLIC TRACE / 52 WEEKS');
  let bars = '';
  weeks.forEach((v, i) => {
    const h = Math.max(1.2, (v / peak) * bh);
    const x = bx + i * (bw / weeks.length);
    const o = 0.22 + (v / peak) * 0.62;
    bars += `<rect x="${F(x)}" y="${F(by - h)}" width="${F(bw / weeks.length - 1.4)}" height="${F(h)}" fill="#7FE9E0" opacity="${F(o)}" class="bar" style="animation-delay:-${F(R() * 10)}s;animation-duration:${F(4 + R() * 5)}s"/>`;
  });
  g += bars;
  g += `<line x1="${bx}" y1="${by + 3}" x2="${bx + bw}" y2="${by + 3}" stroke="#2B4550" stroke-width="0.8"/>`;
  g += T(bx, by + 18, 'hud', `IMPULSES ${totalCommits}   VITALITY ${(vitality * 100).toFixed(0)}%   ${'█'.repeat(Math.round(vitality * 10))}${'░'.repeat(10 - Math.round(vitality * 10))}`);

  // legend / systems key
  const keys = genome.branches;
  let ky = H - 52 - (keys.length - 1) * 15;
  g += T(W - 44, ky - 20, 'hud hud-b', 'NEURAL SYSTEMS', 'text-anchor="end"');
  keys.forEach((b, i) => {
    const y = ky + i * 15;
    g += `<circle cx="${W - 48}" cy="${F(y - 3.4)}" r="2.6" fill="${b.hue}" opacity="0.85"/>`;
    g += T(W - 58, y, 'hud', `${b.label}`, 'text-anchor="end"');
  });

  g += T(CX, H - 30, 'hud dimmer', 'THIS SPECIMEN RESPONDS TO TOUCH — A LIVE CULTURE IS LINKED BELOW', 'text-anchor="middle"');

  // reticle marks, like a microscope overlay
  const tick = (x, y, w, h2) => `<path d="M${x} ${y}h${w}M${x} ${y}v${h2}" stroke="#2E4A54" stroke-width="1" fill="none" opacity="0.7"/>`;
  g += tick(28, 28, 20, 20) + tick(W - 28, 28, -20, 20) + tick(28, H - 28, 20, -20) + tick(W - 28, H - 28, -20, -20);

  layers.hud = g;
}

/* ---- something for whoever zooms in ---- */
layers.hud += `<text class="mono micro" x="${CX}" y="${CY + 214}" text-anchor="middle">IF YOU ZOOMED IN THIS FAR, YOU ARE EXACTLY THE KIND OF PERSON I BUILD FOR.</text>`;

/* ---- scan sweep ---- */
layers.hud += `<rect class="sweep" x="0" y="-140" width="${W}" height="140" fill="url(#sweep)"/>`;

/* ------------------------------------------------------------------ *
 * defs + stylesheet
 * ------------------------------------------------------------------ */
const style = `
  .mono { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace; }
  text { fill: #7E93A0; }
  .sys   { font-size: 13px; letter-spacing: 4.4px; opacity: .92; }
  .note  { font-size: 7.6px; letter-spacing: 1.7px; fill:#54666F; opacity:.9; }
  .nm    { font-size: 10.5px; letter-spacing: 2.2px; opacity: .95; }
  .meta  { font-size: 7.4px; letter-spacing: 1.5px; fill: #6B808B; }
  .st    { font-size: 7px;   letter-spacing: 2.4px; opacity: .62; }
  .sk    { font-size: 6.8px; letter-spacing: 1.9px; fill: #5D7681; opacity: .68; }
  .name  { font-size: 21px;  letter-spacing: 11px; fill: #E6F7FA; opacity: .95; }
  .namesub  { font-size: 7.4px; letter-spacing: 4.2px; fill: #5F7C86; }
  .namesub2 { font-size: 8px;   letter-spacing: 6px;   fill: #7FE9E0; opacity:.7; }
  .ident { font-size: 7px; letter-spacing: 3px; fill: #52686F; }
  .hud   { font-size: 7.6px; letter-spacing: 1.9px; fill: #4E6570; }
  .hud-b { fill: #7FE9E0; opacity: .82; }
  .dimmer{ fill: #3C4E57; letter-spacing: 3px; }
  .micro { font-size: 2.6px; letter-spacing: 1.1px; fill: #1C3038; }

  @keyframes breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.014); } }
  @keyframes breatheS{ 0%,100% { transform: scale(1); } 50% { transform: scale(1.026); } }
  @keyframes halo    { 0%,100% { opacity: .5; } 50% { opacity: .85; } }
  @keyframes corebeat{ 0%,100% { transform: scale(1); opacity:.9; } 42% { transform: scale(1.09); opacity:1; } 70% { transform: scale(.98); } }
  @keyframes spin    { to { transform: rotate(360deg); } }
  @keyframes spinR   { to { transform: rotate(-360deg); } }
  @keyframes crawl   { to { stroke-dashoffset: -220; } }
  @keyframes crawlS  { to { stroke-dashoffset: -900; } }
  @keyframes syn     { 0%,88%,100% { opacity: .12; transform: scale(.7); }
                       92% { opacity: 1; transform: scale(2.1); }
                       96% { opacity: .3; transform: scale(1.1); } }
  @keyframes cellact { 0%,100% { opacity: .82; transform: scale(1); } 50% { opacity: 1; transform: scale(1.035); } }
  @keyframes minipulse { 0%,100% { opacity:.5; } 50% { opacity: 1; } }
  @keyframes cil     { 0%,100% { opacity:.08; } 50% { opacity:.34; } }
  @keyframes bar     { 0%,100% { opacity: .35; } 50% { opacity: .95; } }
  @keyframes beat    { 0%,100% { opacity:.25; transform: scale(.8);} 12% { opacity:1; transform: scale(1.5);} 26% { opacity:.4; transform:scale(1);} 38%{opacity:.95; transform:scale(1.25);} 55%{opacity:.25; transform:scale(.8);} }
  @keyframes sweep   { 0% { transform: translateY(0); opacity: 0; }
                       6% { opacity: .5; } 60% { opacity: .22; }
                       76%,100% { transform: translateY(${H + 160}px); opacity: 0; } }
  @keyframes termfade{ 0%,100% { opacity: .88; } 50% { opacity: 1; } }

  .breathe-slow { animation: breathe 15s ease-in-out infinite; transform-box: view-box; transform-origin: ${CX}px ${CY}px; }
  .breathe-mid  { animation: breathe 11.4s ease-in-out infinite; animation-delay:-3s; transform-box: view-box; transform-origin: ${CX}px ${CY}px; }
  .breathe-fast { animation: breathe 8.6s ease-in-out infinite; animation-delay:-5s; transform-box: view-box; transform-origin: ${CX}px ${CY}px; }
  .breathe-core { animation: breatheS 6.8s ease-in-out infinite; transform-box: view-box; transform-origin: ${CX}px ${CY}px; }
  .pulse-core   { animation: corebeat 3.9s ease-in-out infinite; transform-box: view-box; transform-origin: ${CX}px ${CY}px; }
  .halo         { animation: halo 7.6s ease-in-out infinite; }
  .spin-a { animation: spin 96s linear infinite;  transform-box: view-box; transform-origin: ${CX}px ${CY}px; }
  .spin-b { animation: spinR 71s linear infinite; transform-box: view-box; transform-origin: ${CX}px ${CY}px; }
  .spin-c { animation: spin 138s linear infinite; transform-box: view-box; transform-origin: ${CX}px ${CY}px; }
  .crawl     { animation: crawl 9s linear infinite; }
  .flow-slow { animation: crawlS 60s linear infinite; stroke-dasharray: 40 260; }
  .syn      { animation-name: syn; animation-timing-function: ease-out; animation-iteration-count: infinite; transform-box: fill-box; transform-origin: center; }
  .cell     { animation-name: cellact; animation-timing-function: ease-in-out; animation-iteration-count: infinite; transform-box: fill-box; transform-origin: center; }
  .cellmini { animation-name: minipulse; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
  .cil      { animation-name: cil; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
  .bar      { animation-name: bar; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
  .heartbeat{ animation: beat 2.6s ease-out infinite; transform-box: fill-box; transform-origin: center; }
  .sweep    { animation: sweep 17s cubic-bezier(.5,0,.5,1) infinite; }
  .term     { animation: termfade 6s ease-in-out infinite; }

  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; }
  }
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">Deebyanshu Jha as a living digital organism</title>
<desc id="d">An animated specimen chart. A nucleus labelled DEEBYANSHU JHA sits at the centre of a membrane. Six neural systems grow outward from it: BUILD, SYSTEMS, PROJECTS, EXPERIMENTS, LEARNING and FUTURE. Organelles along those limbs are real projects including the Lamb interpreter, ChatterNet, a WinSock echo server, xv6 study, a portfolio, Project Camp, HostelFix, Rapid Recall, a placement predictor and 700+ solved problems. Smaller cell forms are the languages and tools behind them. Impulses travel the pathways continuously.</desc>
<defs>
<radialGradient id="nebula" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#0A2029" stop-opacity="0.85"/>
  <stop offset="0.45" stop-color="#061218" stop-opacity="0.6"/>
  <stop offset="1" stop-color="#03050A" stop-opacity="0"/>
</radialGradient>
<radialGradient id="hazeC" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#0E4A50" stop-opacity="0.34"/><stop offset="1" stop-color="#03050A" stop-opacity="0"/>
</radialGradient>
<radialGradient id="hazeB" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#123A55" stop-opacity="0.3"/><stop offset="1" stop-color="#03050A" stop-opacity="0"/>
</radialGradient>
<radialGradient id="cyto" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#08202A" stop-opacity="0.55"/>
  <stop offset="0.7" stop-color="#061620" stop-opacity="0.3"/>
  <stop offset="1" stop-color="#040A10" stop-opacity="0.12"/>
</radialGradient>
<radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#7FE9E0" stop-opacity="0.20"/>
  <stop offset="0.35" stop-color="#3C8FA8" stop-opacity="0.10"/>
  <stop offset="1" stop-color="#03050A" stop-opacity="0"/>
</radialGradient>
<radialGradient id="nucleus" cx="42%" cy="38%" r="70%">
  <stop offset="0" stop-color="#BFF6F0" stop-opacity="0.42"/>
  <stop offset="0.45" stop-color="#2C7E8C" stop-opacity="0.30"/>
  <stop offset="1" stop-color="#07171E" stop-opacity="0.75"/>
</radialGradient>
<radialGradient id="nucleolus" cx="42%" cy="38%" r="65%">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>
  <stop offset="0.4" stop-color="#9CF0E8" stop-opacity="0.7"/>
  <stop offset="1" stop-color="#7FE9E0" stop-opacity="0"/>
</radialGradient>
<radialGradient id="clear" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#03050A" stop-opacity="0.9"/>
  <stop offset="0.55" stop-color="#03050A" stop-opacity="0.72"/>
  <stop offset="1" stop-color="#03050A" stop-opacity="0"/>
</radialGradient>
<linearGradient id="sweep" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#7FE9E0" stop-opacity="0"/>
  <stop offset="0.82" stop-color="#7FE9E0" stop-opacity="0.05"/>
  <stop offset="1" stop-color="#B9FBF5" stop-opacity="0.13"/>
</linearGradient>
<style>${style}</style>
${pathDefs.join('')}
</defs>
<g id="field">${layers.field}</g>
<g id="membrane">${layers.membrane}</g>
<g id="network">${layers.limbs}</g>
<g id="organelles">${layers.cells}</g>
<g id="morphology">${layers.skills}</g>
<g id="core">${layers.core}</g>
<g id="impulses">${layers.particles}</g>
<g id="medium">${layers.motes}</g>
<g id="instrument">${layers.hud}</g>
</svg>
`;

writeFileSync(OUT, svg, 'utf8');

// persist metabolism back into the genome so the last good reading survives
genome.metabolism = { commits: totalCommits, activeDays: met.activeDays || 0, repos: met.repos || 26, weeks, updated: met.updated };
writeFileSync(GENOME, JSON.stringify(genome, null, 2) + '\n', 'utf8');

const kb = (Buffer.byteLength(svg) / 1024).toFixed(1);
console.log(`organism grown -> assets/organism.svg  (${kb} KB)`);
console.log(`  limbs ${limbs.length}  dendrites ${dendrites.length}  organelles ${genome.nodes.length}  morphologies ${genome.skills.length}`);
console.log(`  impulses ${PARTICLE_BUDGET}  motes ${MOTE_BUDGET}  vitality ${(vitality * 100).toFixed(0)}%  commits ${totalCommits}`);
