#!/usr/bin/env node
/**
 * THE DEEBYANSHU BLUEPRINT
 * ------------------------
 * Emits assets/blueprint.svg — a 1400 x 8800 technical drawing.
 *
 * Everything in the drawing is real. Projects, stacks, statuses and links
 * come from data/organism.json, which is the same source the old organism
 * used. Nothing here is invented.
 *
 *   node tools/generate-blueprint.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA = JSON.parse(readFileSync(resolve(ROOT, 'data/organism.json'), 'utf8'));

/* ------------------------------------------------------------------ *
 * CANVAS
 * ------------------------------------------------------------------ */

const W = 1400;
const H = 8800;

// drawing frame
const FL = 34, FR = W - 34, FT = 34, FB = H - 34;
// inner rule (the sheet's printed border)
const IL = 68, IR = W - 68;
// the machine occupies the middle; annotations live in the gutters
const AXIS = 700;
const GUT_L = 96;              // left gutter text origin
const GUT_R = W - 96;          // right gutter text origin (anchored end)

/* ------------------------------------------------------------------ *
 * PALETTE — paper, ink, one accent.
 * ------------------------------------------------------------------ */

const C = {
  paper:    '#ECE5D8',
  paperHi:  '#F4EEE3',
  tint:     '#E2DACB',
  grid:     '#D8CFBE',
  gridMaj:  '#CFC4AF',
  faint:    '#B9AF9B',
  thin:     '#8C8271',
  ink:      '#23262A',
  ink2:     '#4C5158',
  ink3:     '#6E7681',
  red:      '#A8391F',
  redPale:  '#C97A63',
};

/* ------------------------------------------------------------------ *
 * DETERMINISTIC WOBBLE — nothing in a hand drawing is exactly straight.
 * ------------------------------------------------------------------ */

let _s = 0x2f6e2b1;
const rnd = () => {
  _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0;
  return _s / 4294967296;
};
const jit = (a = 1) => (rnd() - 0.5) * 2 * a;

/* ------------------------------------------------------------------ *
 * PRIMITIVES
 * ------------------------------------------------------------------ */

const n = (v) => Math.round(v * 100) / 100;
const out = [];
const push = (s) => out.push(s);

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const attrs = (o) => Object.entries(o)
  .filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => `${k}="${typeof v === 'number' ? n(v) : v}"`).join(' ');

/** straight line, with a touch of hand-drawn drift */
function L(x1, y1, x2, y2, o = {}) {
  const w = o.wobble ?? 0;
  if (w) {
    const mx = (x1 + x2) / 2 + jit(w), my = (y1 + y2) / 2 + jit(w);
    return P(`M${n(x1 + jit(w * .4))} ${n(y1 + jit(w * .4))}Q${n(mx)} ${n(my)} ${n(x2 + jit(w * .4))} ${n(y2 + jit(w * .4))}`, o);
  }
  return `<line ${attrs({
    x1, y1, x2, y2,
    stroke: o.stroke || C.thin,
    'stroke-width': o.sw ?? 1,
    'stroke-dasharray': o.dash,
    'stroke-linecap': o.cap,
    opacity: o.op, class: o.cls,
  })}/>`;
}

function P(d, o = {}) {
  return `<path ${attrs({
    d,
    fill: o.fill || 'none',
    stroke: o.stroke ?? (o.fill ? undefined : C.thin),
    'stroke-width': o.sw ?? 1,
    'stroke-dasharray': o.dash,
    'stroke-linecap': o.cap,
    'stroke-linejoin': o.join,
    opacity: o.op, class: o.cls, transform: o.tf,
  })}/>`;
}

function CIR(cx, cy, r, o = {}) {
  return `<circle ${attrs({
    cx, cy, r,
    fill: o.fill || 'none',
    stroke: o.stroke ?? (o.fill && !o.stroke ? undefined : C.thin),
    'stroke-width': o.sw ?? 1,
    'stroke-dasharray': o.dash,
    opacity: o.op, class: o.cls,
  })}/>`;
}

function R(x, y, w, h, o = {}) {
  return `<rect ${attrs({
    x, y, width: w, height: h, rx: o.rx,
    fill: o.fill || 'none',
    stroke: o.stroke ?? (o.fill && !o.stroke ? undefined : C.thin),
    'stroke-width': o.sw ?? 1,
    'stroke-dasharray': o.dash,
    opacity: o.op, class: o.cls, transform: o.tf,
  })}/>`;
}

/**
 * Text. Sizes assume the sheet is viewed at ~0.62x inside a GitHub README,
 * so nothing here drops below 15px.
 */
function T(x, y, s, o = {}) {
  const cls = o.cls || 'mono';
  return `<text ${attrs({
    x, y,
    class: cls,
    'font-size': o.size ?? 17,
    'text-anchor': o.anchor,
    'letter-spacing': o.ls,
    fill: o.fill || C.ink2,
    opacity: o.op,
    transform: o.rot ? `rotate(${n(o.rot)} ${n(x)} ${n(y)})` : o.tf,
    'font-weight': o.weight,
  })}>${esc(s)}</text>`;
}

/** stacked lines of text */
function TT(x, y, lines, o = {}) {
  const lh = o.lh ?? (o.size ?? 17) * 1.55;
  return lines.map((l, i) => (l === '' ? '' : T(x, y + i * lh, l, o))).join('');
}

/* ------------------------------------------------------------------ *
 * DRAFTING VOCABULARY
 * ------------------------------------------------------------------ */

/** filled arrowhead pointing along (dx,dy) */
function arrow(x, y, ang, o = {}) {
  const s = o.size ?? 9, w = o.w ?? 3.4;
  return `<path d="M0 0 L-${n(s)} -${n(w)} L-${n(s * .72)} 0 L-${n(s)} ${n(w)} Z" fill="${o.fill || C.ink2}" opacity="${o.op ?? 1}" transform="translate(${n(x)} ${n(y)}) rotate(${n(ang)})"/>`;
}

/** dimension line: |<------- 480 ------->| */
function dimV(x, y1, y2, label, o = {}) {
  const ext = o.ext ?? 16, col = o.stroke || C.faint;
  const mid = (y1 + y2) / 2;
  return [
    L(x - ext, y1, x + ext, y1, { stroke: col, sw: .8 }),
    L(x - ext, y2, x + ext, y2, { stroke: col, sw: .8 }),
    L(x, y1, x, y2, { stroke: col, sw: .8 }),
    arrow(x, y1 + 1, 90, { size: 8, fill: col }),
    arrow(x, y2 - 1, -90, { size: 8, fill: col }),
    label ? `<rect x="${n(x - 42)}" y="${n(mid - 12)}" width="84" height="24" fill="${C.paper}"/>` : '',
    label ? T(x, mid + 5, label, { size: 15, anchor: 'middle', fill: C.ink3, ls: 1.2 }) : '',
  ].join('');
}

function dimH(y, x1, x2, label, o = {}) {
  const ext = o.ext ?? 14, col = o.stroke || C.faint;
  const mid = (x1 + x2) / 2;
  return [
    L(x1, y - ext, x1, y + ext, { stroke: col, sw: .8 }),
    L(x2, y - ext, x2, y + ext, { stroke: col, sw: .8 }),
    L(x1, y, x2, y, { stroke: col, sw: .8 }),
    arrow(x1 + 1, y, 180, { size: 8, fill: col }),
    arrow(x2 - 1, y, 0, { size: 8, fill: col }),
    label ? `<rect x="${n(mid - 44)}" y="${n(y - 12)}" width="88" height="24" fill="${C.paper}"/>` : '',
    label ? T(mid, y + 5, label, { size: 15, anchor: 'middle', fill: C.ink3, ls: 1.2 }) : '',
  ].join('');
}

/**
 * Leader: a dot on the part, an elbow, then a horizontal shelf the label
 * sits on. `dir` is -1 (label to the left) or 1 (label to the right).
 */
function leader(px, py, tx, ty, dir, lines, o = {}) {
  const shelf = o.shelf ?? 26;
  const endX = tx + (dir < 0 ? shelf : -shelf);
  const col = o.stroke || C.thin;
  const size = o.size ?? 17;
  const head = lines[0], rest = lines.slice(1);
  return [
    CIR(px, py, 2.6, { fill: col, stroke: 'none' }),
    P(`M${n(px)} ${n(py)}L${n(endX)} ${n(ty)}L${n(tx)} ${n(ty)}`, { stroke: col, sw: .9 }),
    T(tx, ty - 9, head, {
      cls: 'mono', size: size + 3, ls: 2.4, weight: 600,
      fill: o.headFill || C.ink, anchor: dir < 0 ? 'end' : 'start',
    }),
    TT(tx, ty + size + 5, rest, {
      size, ls: 1, fill: C.ink3, lh: size * 1.5,
      anchor: dir < 0 ? 'end' : 'start',
    }),
  ].join('');
}

/** figure caption block used above every major assembly */
function figHead(x, y, fig, title, sub, o = {}) {
  const a = o.anchor || 'start';
  const ts = o.size ?? 46;
  return [
    o.knockout ? R(o.knockout[0], y - 24, o.knockout[1], 104, { fill: C.paperHi, stroke: 'none' }) : '',
    T(x, y, fig, { size: 17, ls: 4, fill: C.red, anchor: a, weight: 600 }),
    T(x, y + 42, title, { cls: 'disp', size: ts, ls: 5, fill: C.ink, anchor: a }),
    sub ? T(x, y + 70, sub, { size: 17, ls: 3.2, fill: C.ink3, anchor: a }) : '',
  ].join('');
}

/** 45° section hatching inside an arbitrary path */
let hatchId = 0;
function hatched(d, o = {}) {
  const id = `hx${hatchId++}`;
  return `<clipPath id="${id}"><path d="${d}"/></clipPath>` +
    `<g clip-path="url(#${id})">` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#hatch${o.dense ? 'D' : ''})"/></g>` +
    P(d, { stroke: o.stroke || C.ink2, sw: o.sw ?? 1.3 });
}

/** involute-ish gear, drawn as a real part */
function gear(cx, cy, r, teeth, o = {}) {
  const th = o.tooth ?? r * 0.15;
  const ri = r - th;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    const p = (ang, rad) => `${n(cx + Math.cos(ang) * rad)} ${n(cy + Math.sin(ang) * rad)}`;
    d += (i === 0 ? 'M' : 'L') + p(a0, ri);
    d += 'L' + p(a0 + step * .22, r);
    d += 'L' + p(a0 + step * .50, r);
    d += 'L' + p(a0 + step * .72, ri);
  }
  d += 'Z';
  return `<g class="${o.cls || ''}" style="${o.spin ? `transform-origin:${n(cx)}px ${n(cy)}px` : ''}">` +
    P(d, { stroke: o.stroke || C.ink2, sw: o.sw ?? 1.2, fill: o.fill, join: 'round' }) +
    CIR(cx, cy, ri * .62, { stroke: C.thin, sw: .8 }) +
    CIR(cx, cy, ri * .22, { stroke: C.ink2, sw: 1.1 }) +
    (o.spokes !== false ? Array.from({ length: 4 }, (_, i) => {
      const a = (i / 4) * Math.PI * 2 + .4;
      return L(cx + Math.cos(a) * ri * .24, cy + Math.sin(a) * ri * .24,
               cx + Math.cos(a) * ri * .60, cy + Math.sin(a) * ri * .60,
               { stroke: C.thin, sw: .9 });
    }).join('') : '') + `</g>`;
}

/** bolt / fastener glyph */
function bolt(x, y, r = 6) {
  return CIR(x, y, r, { stroke: C.ink2, sw: 1 }) +
    L(x - r * .68, y - r * .68, x + r * .68, y + r * .68, { stroke: C.ink2, sw: .9 }) +
    L(x - r * .68, y + r * .68, x + r * .68, y - r * .68, { stroke: C.ink2, sw: .9 });
}

/** centre mark: the little cross drafters put at the middle of a circle */
function centreMark(x, y, r = 14) {
  return L(x - r, y, x + r, y, { stroke: C.red, sw: .8, op: .75, dash: '9 3 2 3' }) +
    L(x, y - r, x, y + r, { stroke: C.red, sw: .8, op: .75, dash: '9 3 2 3' });
}

/** handwritten margin note, in pencil, very slightly off-axis */
function note(x, y, lines, o = {}) {
  const rot = o.rot ?? jit(1.1);
  const col = o.fill || C.red;
  return `<g transform="rotate(${n(rot)} ${n(x)} ${n(y)})">` +
    TT(x, y, lines, {
      cls: 'hand', size: o.size ?? 19, fill: col, op: o.op ?? .92,
      anchor: o.anchor, lh: o.lh ?? (o.size ?? 19) * 1.35,
    }) + `</g>`;
}

/** rubber stamp — rotated, distressed, red */
function stamp(x, y, w, h, lines, o = {}) {
  const rot = o.rot ?? -4;
  const inner = 7;
  return `<g transform="rotate(${n(rot)} ${n(x)} ${n(y)})" opacity="${o.op ?? .78}">` +
    R(x - w / 2, y - h / 2, w, h, { stroke: C.red, sw: 2.6, rx: 3 }) +
    R(x - w / 2 + inner, y - h / 2 + inner, w - inner * 2, h - inner * 2, { stroke: C.red, sw: 1, rx: 2, op: .7 }) +
    lines.map((l, i) => T(x, y - 12 + i * (o.lh ?? 30) + 7, l.s, {
      size: l.big ? 26 : 14, ls: l.big ? 4 : 2, anchor: 'middle', fill: C.red, weight: 600,
    })).join('') +
    `</g>`;
}

/* ------------------------------------------------------------------ *
 * SHEET
 * ------------------------------------------------------------------ */

const FONT_MONO = `ui-monospace,'SFMono-Regular','SF Mono',Menlo,Consolas,'DejaVu Sans Mono','Liberation Mono',monospace`;
const FONT_DISP = `'Helvetica Neue',Helvetica,'Arial Narrow',Arial,'Liberation Sans',sans-serif`;
const FONT_HAND = `'Segoe Script','Bradley Hand','Apple Chancery','Comic Sans MS',cursive`;

function defs() {
  return `<defs>
  <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
    <path d="M28 0H0V28" fill="none" stroke="${C.grid}" stroke-width=".6"/>
  </pattern>
  <pattern id="gridMaj" width="140" height="140" patternUnits="userSpaceOnUse">
    <path d="M140 0H0V140" fill="none" stroke="${C.gridMaj}" stroke-width=".9"/>
  </pattern>
  <pattern id="hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="9" stroke="${C.thin}" stroke-width=".9"/>
  </pattern>
  <pattern id="hatchD" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="5" stroke="${C.ink3}" stroke-width=".8"/>
  </pattern>
  <pattern id="stipple" width="14" height="14" patternUnits="userSpaceOnUse">
    <circle cx="3" cy="3" r=".9" fill="${C.faint}"/><circle cx="10" cy="9" r=".9" fill="${C.faint}"/>
  </pattern>
  <radialGradient id="vig" cx="50%" cy="50%" r="72%">
    <stop offset="55%" stop-color="${C.paperHi}"/>
    <stop offset="100%" stop-color="${C.tint}"/>
  </radialGradient>
  <linearGradient id="foxL" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#C9B98F" stop-opacity=".30"/>
    <stop offset="100%" stop-color="#C9B98F" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="foxR" x1="1" y1="0" x2="0" y2="0">
    <stop offset="0%" stop-color="#C9B98F" stop-opacity=".30"/>
    <stop offset="100%" stop-color="#C9B98F" stop-opacity="0"/>
  </linearGradient>

  <style><![CDATA[
    text { font-family:${FONT_MONO}; }
    .mono { font-family:${FONT_MONO}; }
    .disp { font-family:${FONT_DISP}; font-weight:300; }
    .dispb{ font-family:${FONT_DISP}; font-weight:700; }
    .hand { font-family:${FONT_HAND}; font-style:italic; }

    @keyframes spinCW  { to { transform: rotate(360deg); } }
    @keyframes spinCCW { to { transform: rotate(-360deg); } }
    @keyframes blink   { 0%,44% {opacity:.15} 50%,94% {opacity:1} 100% {opacity:.15} }
    @keyframes breathe { 0%,100% {opacity:.25} 50% {opacity:.85} }
    @keyframes march   { to { stroke-dashoffset:-64; } }
    @keyframes creep   { to { stroke-dashoffset:-200; } }

    .g-cw  { animation: spinCW  46s linear infinite; }
    .g-ccw { animation: spinCCW 32s linear infinite; }
    .g-fast{ animation: spinCW  17s linear infinite; }
    .led   { animation: blink 3.4s ease-in-out infinite; }
    .led-b { animation: blink 5.1s ease-in-out infinite; animation-delay:-1.7s; }
    .soft  { animation: breathe 7s ease-in-out infinite; }
    .flow  { stroke-dasharray:10 6; animation: march 2.6s linear infinite; }
    .flow-s{ stroke-dasharray:4 9; animation: creep 9s linear infinite; }
  ]]></style>
</defs>`;
}

/** signal pulse that physically travels a path */
function pulse(pathD, dur, o = {}) {
  const id = `pp${hatchId++}`;
  return `<path id="${id}" d="${pathD}" fill="none" stroke="none"/>` +
    `<circle r="${o.r ?? 4}" fill="${o.fill || C.red}" opacity="${o.op ?? .9}">` +
    `<animateMotion dur="${dur}s" repeatCount="indefinite" begin="${o.begin ?? 0}s" ` +
    `keyPoints="0;1" keyTimes="0;1" calcMode="linear"><mpath xlink:href="#${id}"/></animateMotion>` +
    `<animate attributeName="opacity" dur="${dur}s" begin="${o.begin ?? 0}s" repeatCount="indefinite" ` +
    `values="0;${o.op ?? .9};${o.op ?? .9};0" keyTimes="0;.06;.94;1"/></circle>`;
}

/* ------------------------------------------------------------------ *
 * BACKGROUND: paper, grid, frame, zone letters
 * ------------------------------------------------------------------ */

function sheet() {
  const s = [];
  s.push(R(0, 0, W, H, { fill: C.paperHi, stroke: 'none' }));
  s.push(R(0, 0, W, H, { fill: 'url(#grid)', stroke: 'none', op: .85 }));
  s.push(R(0, 0, W, H, { fill: 'url(#gridMaj)', stroke: 'none', op: .8 }));
  // aged edges
  s.push(R(0, 0, 150, H, { fill: 'url(#foxL)', stroke: 'none' }));
  s.push(R(W - 150, 0, 150, H, { fill: 'url(#foxR)', stroke: 'none' }));
  // a few foxing spots — paper is never clean
  for (let i = 0; i < 26; i++) {
    s.push(CIR(rnd() * W, rnd() * H, 8 + rnd() * 46, {
      fill: '#C2AE85', stroke: 'none', op: .035 + rnd() * .04,
    }));
  }
  // frame
  s.push(R(FL, FT, FR - FL, FB - FT, { stroke: C.ink2, sw: 2.2 }));
  s.push(R(FL + 10, FT + 10, FR - FL - 20, FB - FT - 20, { stroke: C.faint, sw: .8 }));

  // zone markers down both frame edges (A, B, C… like a real sheet)
  const zoneH = 620;
  const zones = Math.floor((FB - FT) / zoneH);
  for (let i = 0; i < zones; i++) {
    const y = FT + i * zoneH;
    const ch = String.fromCharCode(65 + (i % 26));
    if (i) {
      s.push(L(FL, y, FL + 10, y, { stroke: C.ink2, sw: 1.4 }));
      s.push(L(FR - 10, y, FR, y, { stroke: C.ink2, sw: 1.4 }));
    }
    s.push(T(FL + 5, y + zoneH / 2, ch, { size: 15, anchor: 'middle', fill: C.ink3, ls: 0 }));
    s.push(T(FR - 5, y + zoneH / 2, ch, { size: 15, anchor: 'middle', fill: C.ink3, ls: 0 }));
  }
  return s.join('');
}

/* ------------------------------------------------------------------ *
 * THE SPINE — one conduit runs the whole sheet. Everything hangs off it.
 * ------------------------------------------------------------------ */

const SPINE_TOP = 880;
const SPINE_BOT = 8180;

function spine() {
  const s = [];
  const g = 7; // half-width of the conduit
  s.push(L(AXIS - g, SPINE_TOP, AXIS - g, SPINE_BOT, { stroke: C.ink2, sw: 1.5 }));
  s.push(L(AXIS + g, SPINE_TOP, AXIS + g, SPINE_BOT, { stroke: C.ink2, sw: 1.5 }));
  s.push(L(AXIS, SPINE_TOP, AXIS, SPINE_BOT, { stroke: C.red, sw: .7, dash: '20 5 3 5', op: .5 }));

  // flange joints at regular intervals — with a section number stencilled on
  for (let y = SPINE_TOP + 240; y < SPINE_BOT; y += 470) {
    s.push(R(AXIS - 15, y, 30, 9, { fill: C.paper, stroke: C.ink2, sw: 1.2 }));
    s.push(L(AXIS - 15, y + 4.5, AXIS + 15, y + 4.5, { stroke: C.faint, sw: .7 }));
    s.push(T(AXIS + 26, y + 8, `J${String(Math.round((y - SPINE_TOP) / 470) + 1).padStart(2, '0')}`,
      { size: 14, fill: C.faint, ls: 1 }));
  }
  return s.join('');
}

/** signal travelling the length of the conduit, in three staggered packets */
function spineSignal() {
  const d = `M${AXIS} ${SPINE_TOP}L${AXIS} ${SPINE_BOT}`;
  return pulse(d, 26, { begin: 0, r: 4.2 }) +
    pulse(d, 26, { begin: -9, r: 3, op: .55 }) +
    pulse(d, 26, { begin: -18, r: 3, op: .55 });
}

/* ================================================================== *
 * PART 01 — TITLE / SPECIFICATION            y 34 … 950
 * ================================================================== */

function part01() {
  const s = [];
  const spec = DATA.specimen;

  /* header rule */
  s.push(L(IL, 92, IR, 92, { stroke: C.ink2, sw: 1.4 }));
  s.push(T(IL, 82, 'SHEET 01 OF 01   ·   SCALE 1:1   ·   FIRST-ANGLE PROJECTION   ·   ALL DIMENSIONS IN COMMITS',
    { size: 16, ls: 2, fill: C.ink3 }));
  s.push(T(IR, 82, `DWG. NO. ${spec.id}`, { size: 16, ls: 3, fill: C.red, anchor: 'end', weight: 600 }));

  /* construction geometry behind the wordmark */
  s.push(CIR(AXIS, 430, 316, { stroke: C.faint, sw: .8, op: .55 }));
  s.push(CIR(AXIS, 430, 258, { stroke: C.faint, sw: .8, dash: '6 6', op: .45 }));
  s.push(P(`M${IL} 430 A316 316 0 0 1 ${IR} 430`, { stroke: C.faint, sw: .7, op: .35 }));
  s.push(centreMark(AXIS, 430, 22));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r0 = i % 6 === 0 ? 300 : 308;
    s.push(L(AXIS + Math.cos(a) * r0, 430 + Math.sin(a) * r0,
      AXIS + Math.cos(a) * 316, 430 + Math.sin(a) * 316, { stroke: C.faint, sw: .8, op: .6 }));
  }

  /* FIG. 01 */
  s.push(T(IL, 168, 'FIG. 01', { size: 18, ls: 5, fill: C.red, weight: 600 }));
  s.push(L(IL, 180, IL + 96, 180, { stroke: C.red, sw: 1.4 }));
  s.push(T(IL, 204, 'PRIMARY SYSTEM', { size: 17, ls: 3.4, fill: C.ink3 }));

  /* the wordmark */
  s.push(T(IL + 6, 372, 'DEEBYANSHU', { cls: 'disp', size: 152, ls: 6, fill: C.ink }));
  s.push(T(IL + 6, 512, 'JHA', { cls: 'disp', size: 152, ls: 6, fill: C.ink }));

  /* underline with tick, like a dimensioned edge */
  s.push(L(IL + 6, 392, IL + 1050, 392, { stroke: C.ink, sw: 1, op: .35 }));
  s.push(dimH(560, IL + 6, IL + 322, '3 SYLLABLES', { ext: 10 }));

  /* spec table, right of JHA */
  const sx = 520;
  const rows = [
    ['PERSONAL SYSTEM', 'BLUEPRINT / 01'],
    ['DESIGNATION', '24BCT0213'],
    ['CLASSIFICATION', spec.classification],
    ['SUBSTRATE', spec.substrate],
    ['HABITAT', spec.habitat],
    ['STATUS', 'BUILDING'],
    ['VERSION', '2026.08'],
  ];
  s.push(L(sx, 424, IR, 424, { stroke: C.ink2, sw: 1.2 }));
  rows.forEach(([k, v], i) => {
    const y = 452 + i * 30;
    s.push(T(sx, y, k, { size: 16, ls: 2.6, fill: C.ink3 }));
    s.push(T(IR, y, v, {
      size: 17, ls: 2.6, anchor: 'end', weight: 600,
      fill: k === 'STATUS' ? C.red : C.ink,
    }));
    s.push(L(sx, y + 9, IR, y + 9, { stroke: C.faint, sw: .55, op: .8, dash: i === rows.length - 1 ? undefined : '2 4' }));
  });
  // live indicator next to STATUS
  s.push(CIR(sx - 16, 571, 4.4, { fill: C.red, stroke: 'none', cls: 'led' }));

  /* handwritten note near the title */
  s.push(note(IL + 12, 604, ['drawn over several evenings.', 'the first three versions were worse.'], { rot: -.8, size: 20 }));

  /* ---- title block, bottom of the sheet head ---- */
  const tb = { x: IL, y: 686, w: IR - IL, h: 148 };
  s.push(R(tb.x, tb.y, tb.w, tb.h, { stroke: C.ink2, sw: 1.8, fill: C.paper, op: .96 }));
  const colW = tb.w / 6;
  const cells = [
    ['DRAWN BY', 'D. JHA'],
    ['CHECKED BY', '— NOBODY —'],
    ['REVISION', '01'],
    ['DATE', '2026.08'],
    ['SHEET SIZE', '1400 × 8800'],
    ['ORIGIN', spec.germination],
  ];
  cells.forEach(([k, v], i) => {
    const x = tb.x + i * colW;
    if (i) s.push(L(x, tb.y, x, tb.y + 74, { stroke: C.ink2, sw: 1 }));
    s.push(T(x + 16, tb.y + 28, k, { size: 15, ls: 2.4, fill: C.ink3 }));
    s.push(T(x + 16, tb.y + 58, v, { size: 20, ls: 2, fill: i === 1 ? C.red : C.ink, weight: 600 }));
  });
  s.push(L(tb.x, tb.y + 74, tb.x + tb.w, tb.y + 74, { stroke: C.ink2, sw: 1 }));
  s.push(T(tb.x + 16, tb.y + 106, 'TITLE', { size: 15, ls: 2.4, fill: C.ink3 }));
  s.push(T(tb.x + 16, tb.y + 134, 'THE DEEBYANSHU BLUEPRINT', { cls: 'disp', size: 30, ls: 7, fill: C.ink }));
  s.push(T(tb.x + tb.w - 16, tb.y + 134, `@${DATA.specimen.handle}`, { size: 19, ls: 2.4, fill: C.ink3, anchor: 'end' }));

  /* scroll cue — the drawing continues below the fold */
  s.push(T(AXIS, 892, 'CONTINUES BELOW', { size: 15, ls: 5, anchor: 'middle', fill: C.faint }));
  s.push(arrow(AXIS, 928, 90, { size: 12, fill: C.faint }));

  return s.join('');
}

/* ================================================================== *
 * PART 02 — THE CORE                          y 950 … 2560
 * ================================================================== */

const CORE = { x: AXIS, y: 1760, r: 176 };

/** pipe from core edge out to a subsystem hub */
function pipe(toX, toY, o = {}) {
  const dx = toX - CORE.x, dy = toY - CORE.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const x0 = CORE.x + ux * (CORE.r + 4), y0 = CORE.y + uy * (CORE.r + 4);
  const x1 = toX - ux * (o.pad ?? 62), y1 = toY - uy * (o.pad ?? 62);
  const d = `M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}`;
  return {
    d,
    svg: P(d, { stroke: C.ink2, sw: 3.4, op: .9 }) +
      P(d, { stroke: C.paper, sw: 1.4 }) +
      arrow(x1, y1, Math.atan2(uy, ux) * 180 / Math.PI, { size: 10, fill: C.ink2 }),
  };
}

function subLabel(x, y, code, name, body, anchor = 'middle') {
  return [
    T(x, y, code, { size: 15, ls: 3.4, fill: C.red, anchor, weight: 600 }),
    T(x, y + 30, name, { cls: 'disp', size: 30, ls: 4.5, fill: C.ink, anchor }),
    TT(x, y + 54, body, { size: 16, ls: 1, fill: C.ink3, anchor, lh: 22 }),
  ].join('');
}

function part02() {
  const s = [];

  s.push(figHead(IL, 1024, 'FIG. 02', 'THE CORE', 'PRIMARY ASSEMBLY — SECTION A–A'));
  s.push(TT(IL, 1128, [
    'Six subsystems draw from one shaft. None of them',
    'run independently; starving any one of them stalls',
    'the others within a week or two.',
  ], { size: 17, fill: C.ink3, lh: 24 }));

  /* ---------- section cut line A–A ---------- */
  s.push(L(IL, CORE.y, IR, CORE.y, { stroke: C.red, sw: .8, dash: '26 6 3 6', op: .38 }));
  s.push(T(IL + 4, CORE.y - 12, 'A', { size: 22, fill: C.red, weight: 600, ls: 2 }));
  s.push(T(IR - 4, CORE.y - 12, 'A', { size: 22, fill: C.red, weight: 600, ls: 2, anchor: 'end' }));

  /* ---------- subsystem mechanisms ---------- */
  const subs = [];

  // 01 BUILDING — a screw press. Force applied downward, deliberately.
  {
    const x = 336, y = 1424, g = [];
    g.push(R(x - 66, y - 54, 132, 13, { fill: C.paper, stroke: C.ink2, sw: 1.4 }));
    g.push(L(x, y - 41, x, y + 6, { stroke: C.ink2, sw: 2.2 }));
    for (let i = 0; i < 7; i++) g.push(P(`M${n(x - 9)} ${n(y - 38 + i * 6)}L${n(x + 9)} ${n(y - 35 + i * 6)}`, { stroke: C.thin, sw: 1 }));
    g.push(hatched(`M${n(x - 44)} ${n(y + 6)}h88v26h-88z`));
    g.push(R(x - 74, y + 44, 148, 12, { fill: C.paper, stroke: C.ink2, sw: 1.6 }));
    g.push(L(x - 60, y + 56, x - 60, y + 74, { stroke: C.ink2, sw: 1.4 }));
    g.push(L(x + 60, y + 56, x + 60, y + 74, { stroke: C.ink2, sw: 1.4 }));
    g.push(arrow(x, y - 62, 90, { size: 12, fill: C.red }));
    g.push(bolt(x - 52, y + 50, 5)); g.push(bolt(x + 52, y + 50, 5));
    subs.push({ hub: [x + 64, y + 54], svg: g.join(''), label: subLabel(x, y + 108, 'SUBSYSTEM 01', 'BUILDING', ['pressure applied downward,', 'on purpose, until a thing exists']) });
  }

  // 02 EXPERIMENTS — retort + condenser. Some of it works.
  {
    const x = 1064, y = 1424, g = [];
    g.push(P(`M${n(x - 34)} ${n(y - 44)}h68v34l26 30v34h-120v-34l26-30z`, { stroke: C.ink2, sw: 1.5, fill: C.paper }));
    g.push(hatched(`M${n(x - 44)} ${n(y + 22)}h88v32h-88z`, { dense: true }));
    g.push(L(x - 34, y - 44, x + 34, y - 44, { stroke: C.ink2, sw: 2 }));
    g.push(P(`M${n(x + 60)} ${n(y - 30)}q22 10 0 20q-22 10 0 20q22 10 0 20q-22 10 0 20`, { stroke: C.ink2, sw: 1.3, cls: 'flow-s' }));
    g.push(L(x + 34, y - 30, x + 60, y - 30, { stroke: C.ink2, sw: 1.3 }));
    g.push(CIR(x - 14, y + 36, 3, { fill: C.thin, stroke: 'none' }));
    g.push(CIR(x + 8, y + 42, 2.2, { fill: C.thin, stroke: 'none' }));
    g.push(R(x - 76, y + 54, 152, 10, { fill: C.paper, stroke: C.ink2, sw: 1.5 }));
    subs.push({ hub: [x - 66, y + 54], svg: g.join(''), label: subLabel(x, y + 108, 'SUBSYSTEM 02', 'EXPERIMENTS', ['unstable by design;', 'roughly half are abandoned']) });
  }

  // 03 SYSTEMS — cylinder and piston, cut away.
  {
    const x = 292, y = 1782, g = [];
    g.push(R(x - 84, y - 42, 168, 84, { stroke: C.ink2, sw: 1.6, fill: C.paper }));
    g.push(hatched(`M${n(x - 84)} ${n(y - 42)}h168v14h-168z`));
    g.push(hatched(`M${n(x - 84)} ${n(y + 28)}h168v14h-168z`));
    g.push(R(x - 30, y - 28, 44, 56, { fill: 'url(#hatchD)', stroke: C.ink2, sw: 1.4 }));
    g.push(L(x + 14, y, x + 84, y, { stroke: C.ink2, sw: 2.6 }));
    g.push(L(x - 84, y, x - 30, y, { stroke: C.red, sw: 1, dash: '7 5' }));
    g.push(L(x - 40, y - 60, x + 70, y - 60, { stroke: C.red, sw: .9 }));
    g.push(arrow(x + 76, y - 60, 0, { size: 11, fill: C.red }));
    g.push(T(x - 44, y - 66, 'STROKE', { size: 14, ls: 2, fill: C.red, anchor: 'end' }));
    subs.push({ hub: [x + 84, y], svg: g.join(''), label: subLabel(x, y + 84, 'SUBSYSTEM 03', 'SYSTEMS', ['kernels, sockets, memory —', 'the layer under the layer']) });
  }

  // 04 WEB — a branching distribution network.
  {
    const x = 1108, y = 1782, g = [];
    g.push(P(`M${n(x - 88)} ${n(y)}h56`, { stroke: C.ink2, sw: 2.4 }));
    [-58, -20, 20, 58].forEach((dy, i) => {
      g.push(P(`M${n(x - 32)} ${n(y)}Q${n(x + 2)} ${n(y)} ${n(x + 6)} ${n(y + dy)}L${n(x + 52)} ${n(y + dy)}`,
        { stroke: C.ink2, sw: 1.3 }));
      g.push(R(x + 52, y + dy - 9, 24, 18, { fill: C.paper, stroke: C.ink2, sw: 1.2 }));
      if (i === 1) g.push(CIR(x + 64, y + dy, 3.4, { fill: C.red, stroke: 'none', cls: 'led-b' }));
    });
    g.push(CIR(x - 32, y, 8, { fill: C.paper, stroke: C.ink2, sw: 1.6 }));
    g.push(pulse(`M${n(x - 88)} ${n(y)}L${n(x - 32)} ${n(y)}Q${n(x + 2)} ${n(y)} ${n(x + 6)} ${n(y - 20)}L${n(x + 52)} ${n(y - 20)}`, 4.2, { r: 3.2 }));
    subs.push({ hub: [x - 88, y], svg: g.join(''), label: subLabel(x, y + 84, 'SUBSYSTEM 04', 'WEB', ['one input, many outputs,', 'no guarantee of ordering']) });
  }

  // 05 DSA — a gear train. Every tooth meshes or none of them do.
  {
    const x = 372, y = 2118, g = [];
    g.push(centreMark(x - 46, y, 58));
    g.push(gear(x - 46, y, 46, 16, { cls: 'g-cw', spin: true, fill: C.paper }));
    g.push(gear(x + 44, y - 26, 32, 12, { cls: 'g-ccw', spin: true, fill: C.paper }));
    g.push(gear(x + 96, y + 22, 22, 10, { cls: 'g-fast', spin: true, fill: C.paper, spokes: false }));
    subs.push({ hub: [x + 44, y - 58], svg: g.join(''), label: subLabel(x, y + 92, 'SUBSYSTEM 05', 'DSA', ['700+ meshed teeth;', 'practice, not a streak']) });
  }

  // 06 AI — a sealed chamber with a readout that never settles.
  {
    const x = 1030, y = 2118, g = [];
    g.push(R(x - 76, y - 50, 152, 100, { stroke: C.ink2, sw: 1.6, fill: C.paper, rx: 6 }));
    g.push(R(x - 62, y - 36, 124, 46, { stroke: C.thin, sw: 1, fill: 'url(#stipple)' }));
    [22, 34, 14, 41, 27, 36, 18].forEach((b, i) =>
      g.push(L(x - 54 + i * 18, y + 6, x - 54 + i * 18, y + 6 - b, { stroke: C.ink2, sw: 4 })));
    g.push(L(x - 62, y + 6, x + 62, y + 6, { stroke: C.ink2, sw: 1.2 }));
    g.push(L(x - 62, y - 22, x + 62, y - 22, { stroke: C.red, sw: .9, dash: '6 5' }));
    g.push(T(x + 66, y - 18, 'p', { size: 15, fill: C.red }));
    g.push(CIR(x - 58, y + 32, 5, { fill: C.red, stroke: 'none', cls: 'led' }));
    g.push(T(x - 44, y + 37, 'INFERRING', { size: 15, ls: 2, fill: C.ink3 }));
    subs.push({ hub: [x, y - 50], svg: g.join(''), label: subLabel(x, y + 92, 'SUBSYSTEM 06', 'AI', ['confident output,', 'unverified internals']) });
  }

  subs.forEach((sub) => s.push(pipe(sub.hub[0], sub.hub[1], { pad: 0 }).svg));
  subs.forEach((sub) => s.push(sub.svg));
  subs.forEach((sub) => s.push(sub.label));

  /* ---------- the core itself ---------- */
  const { x: cx, y: cy, r } = CORE;
  const oct = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
    return `${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}`;
  }).join('L');
  s.push(P(`M${oct}Z`, { fill: C.paper, stroke: C.ink, sw: 2.4, join: 'round' }));
  s.push(P(`M${oct}Z`, { fill: 'none', stroke: C.faint, sw: .8, tf: `translate(${n(cx)} ${n(cy)}) scale(.9) translate(${n(-cx)} ${n(-cy)})` }));

  s.push(CIR(cx, cy, r - 34, { stroke: C.ink2, sw: 1.3 }));
  s.push(gear(cx, cy, r - 52, 24, { cls: 'g-ccw', spin: true, sw: 1.1, stroke: C.thin }));
  s.push(CIR(cx, cy, 78, { fill: C.paper, stroke: C.ink, sw: 2 }));
  s.push(CIR(cx, cy, 78, { fill: 'url(#hatch)', stroke: 'none', op: .45 }));
  s.push(CIR(cx, cy, 58, { fill: C.paper, stroke: C.ink2, sw: 1.2 }));
  s.push(T(cx, cy - 4, 'THE', { cls: 'disp', size: 20, ls: 6, anchor: 'middle', fill: C.ink3 }));
  s.push(T(cx, cy + 24, 'CORE', { cls: 'dispb', size: 30, ls: 3.6, anchor: 'middle', fill: C.ink }));
  s.push(CIR(cx, cy, 92, { stroke: C.red, sw: .8, dash: '3 7', op: .55, cls: 'soft' }));

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    s.push(bolt(cx + Math.cos(a) * (r - 17), cy + Math.sin(a) * (r - 17), 5.5));
  }

  s.push(leader(cx - 124, cy - 124, 448, 1226, -1, [
    'CORE — DJ / 01',
    'Curiosity about how things work,',
    'converted into things that run.',
    'Runs warm. No known off switch.',
  ], { size: 17 }));

  

  s.push(note(1168, 2252, ['this one', 'lies sometimes'], { rot: -6, size: 19 }));
  s.push(P('M1164 2242q-30 -16 -52 -48', { stroke: C.red, sw: 1, op: .8 }));

  s.push(note(IL, 2352, ['the pipes are not metaphorical —', 'remove one and something downstream stops'], { rot: .6, size: 18, fill: C.ink3 }));

  return s.join('');
}

/* ================================================================== *
 * PART 03 — PROJECTS AS MACHINES              y 2560 … 4820
 * ================================================================== *
 * Every project is a part bolted to the shaft. Order is roughly the
 * order they were built in: language first, then the layer under it,
 * then the things other people actually use.
 * ------------------------------------------------------------------ */

const byName = (nm) => DATA.nodes.find((d) => d.name === nm);

/** the mechanical vocabulary — one distinct form per project */
function form(kind, x, y) {
  const g = [];
  const box = (w, h, o = {}) => R(x - w / 2, y - h / 2, w, h, { fill: C.paper, stroke: C.ink2, sw: 1.5, ...o });

  switch (kind) {
    case 'lattice': { // recursive descent: one node, then its children, forever
      const node = (nx, ny, r) => CIR(nx, ny, r, { fill: C.paper, stroke: C.ink2, sw: 1.3 });
      g.push(L(x, y - 34, x, y + 34, { stroke: C.faint, sw: .7, dash: '3 4' }));
      g.push(P(`M${n(x)} ${n(y - 28)}L${n(x - 40)} ${n(y + 4)}M${n(x)} ${n(y - 28)}L${n(x + 40)} ${n(y + 4)}`, { stroke: C.ink2, sw: 1.2 }));
      g.push(P(`M${n(x - 40)} ${n(y + 4)}L${n(x - 62)} ${n(y + 34)}M${n(x - 40)} ${n(y + 4)}L${n(x - 20)} ${n(y + 34)}`, { stroke: C.thin, sw: 1 }));
      g.push(P(`M${n(x + 40)} ${n(y + 4)}L${n(x + 20)} ${n(y + 34)}M${n(x + 40)} ${n(y + 4)}L${n(x + 62)} ${n(y + 34)}`, { stroke: C.thin, sw: 1 }));
      [[-62, 34, 5], [-20, 34, 5], [20, 34, 5], [62, 34, 5], [-40, 4, 8], [40, 4, 8]].forEach(([dx, dy, r]) => g.push(node(x + dx, y + dy, r)));
      g.push(node(x, y - 28, 12));
      break;
    }
    case 'plate': { // an index plate: legible, or the part above is useless
      g.push(box(126, 56, { rx: 3 }));
      [0, 1, 2].forEach((i) => g.push(L(x - 48, y - 12 + i * 12, x + (i === 2 ? 18 : 48), y - 12 + i * 12, { stroke: C.thin, sw: 1.6 })));
      g.push(L(x - 63, y - 28, x - 63, y + 28, { stroke: C.ink2, sw: 3 }));
      break;
    }
    case 'manifold': { // many in, one broadcast out
      g.push(box(30, 76, { rx: 2 }));
      [-26, 0, 26].forEach((dy) => {
        g.push(L(x - 74, y + dy, x - 15, y + dy, { stroke: C.ink2, sw: 1.2 }));
        g.push(CIR(x - 74, y + dy, 5, { fill: C.paper, stroke: C.ink2, sw: 1.2 }));
      });
      g.push(L(x + 15, y, x + 66, y, { stroke: C.ink2, sw: 2.6 }));
      [16, 30, 44].forEach((r, i) => g.push(P(`M${n(x + 50)} ${n(y - r * .7)}Q${n(x + 50 + r * .5)} ${n(y)} ${n(x + 50)} ${n(y + r * .7)}`, { stroke: C.thin, sw: 1, op: 1 - i * .25 })));
      break;
    }
    case 'valve': { // bind, listen, accept, send, recv
      g.push(L(x - 68, y, x - 20, y, { stroke: C.ink2, sw: 2.2 }));
      g.push(L(x + 20, y, x + 68, y, { stroke: C.ink2, sw: 2.2 }));
      g.push(P(`M${n(x - 20)} ${n(y - 24)}L${n(x - 20)} ${n(y + 24)}L${n(x + 20)} ${n(y - 24)}L${n(x + 20)} ${n(y + 24)}Z`, { fill: C.paper, stroke: C.ink2, sw: 1.6 }));
      g.push(L(x, y, x, y - 34, { stroke: C.ink2, sw: 1.6 }));
      g.push(L(x - 16, y - 34, x + 16, y - 34, { stroke: C.ink2, sw: 2.4 }));
      g.push(arrow(x + 64, y, 0, { size: 9, fill: C.ink2 }));
      break;
    }
    case 'chamber': { // cut-away: you can only understand it opened up
      g.push(box(140, 78, { rx: 2 }));
      g.push(hatched(`M${n(x - 70)} ${n(y - 39)}h140v12h-140z`));
      g.push(hatched(`M${n(x - 70)} ${n(y + 27)}h140v12h-140z`));
      g.push(R(x - 50, y - 18, 34, 36, { stroke: C.thin, sw: 1 }));
      g.push(R(x - 8, y - 18, 34, 36, { stroke: C.thin, sw: 1 }));
      g.push(R(x + 34, y - 18, 30, 36, { fill: 'url(#hatchD)', stroke: C.thin, sw: 1 }));
      g.push(L(x - 70, y - 52, x + 70, y - 52, { stroke: C.red, sw: .9, dash: '12 4 2 4' }));
      break;
    }
    case 'rotor': {
      g.push(CIR(x, y, 38, { fill: C.paper, stroke: C.ink2, sw: 1.6 }));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.push(P(`M${n(x + Math.cos(a) * 12)} ${n(y + Math.sin(a) * 12)}Q${n(x + Math.cos(a + .5) * 30)} ${n(y + Math.sin(a + .5) * 30)} ${n(x + Math.cos(a + .2) * 37)} ${n(y + Math.sin(a + .2) * 37)}`, { stroke: C.thin, sw: 1.2 }));
      }
      g.push(CIR(x, y, 11, { fill: C.paper, stroke: C.ink2, sw: 1.4 }));
      g.push(L(x - 62, y, x - 38, y, { stroke: C.ink2, sw: 2 }));
      g.push(L(x + 38, y, x + 62, y, { stroke: C.ink2, sw: 2 }));
      break;
    }
    case 'gearbox': {
      g.push(box(150, 84, { rx: 3 }));
      g.push(gear(x - 32, y, 26, 12, { cls: 'g-cw', spin: true, sw: 1.1, spokes: false }));
      g.push(gear(x + 24, y - 6, 20, 10, { cls: 'g-ccw', spin: true, sw: 1.1, spokes: false }));
      g.push(gear(x + 58, y + 22, 13, 8, { cls: 'g-fast', spin: true, sw: 1, spokes: false }));
      [[-70, -42], [70, -42], [-70, 42], [70, 42]].forEach(([dx, dy]) => g.push(bolt(x + dx, y + dy, 4.4)));
      break;
    }
    case 'filter': { // intake, triage, resolution
      g.push(P(`M${n(x - 62)} ${n(y - 34)}h124l-40 42v26h-44v-26z`, { fill: C.paper, stroke: C.ink2, sw: 1.5 }));
      [0, 1, 2].forEach((i) => g.push(L(x - 44 + i * 8, y - 22, x + 44 - i * 8, y - 22 + i * 0, { stroke: C.thin, sw: .9, dash: '3 4' })));
      g.push(arrow(x, y - 44, 90, { size: 10, fill: C.red }));
      g.push(arrow(x, y + 46, 90, { size: 10, fill: C.ink2 }));
      break;
    }
    case 'escapement': { // a timer that will not wait for you
      g.push(CIR(x, y, 36, { fill: C.paper, stroke: C.ink2, sw: 1.5 }));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.push(L(x + Math.cos(a) * 30, y + Math.sin(a) * 30, x + Math.cos(a) * 36, y + Math.sin(a) * 36, { stroke: C.thin, sw: i % 3 ? .9 : 1.6 }));
      }
      g.push(`<g class="g-fast" style="transform-origin:${n(x)}px ${n(y)}px">` +
        L(x, y, x, y - 26, { stroke: C.red, sw: 2, cap: 'round' }) + `</g>`);
      g.push(L(x, y, x + 18, y + 12, { stroke: C.ink2, sw: 1.6, cap: 'round' }));
      g.push(CIR(x, y, 3.4, { fill: C.ink2, stroke: 'none' }));
      break;
    }
    case 'balance': { // a scale that outputs a probability, not a verdict
      g.push(L(x, y + 34, x, y - 26, { stroke: C.ink2, sw: 2.2 }));
      g.push(P(`M${n(x - 26)} ${n(y + 34)}h52`, { stroke: C.ink2, sw: 2.4 }));
      g.push(P(`M${n(x - 58)} ${n(y - 30)}L${n(x + 58)} ${n(y - 22)}`, { stroke: C.ink2, sw: 1.6 }));
      g.push(P(`M${n(x - 58)} ${n(y - 30)}l-12 22h24z`, { fill: C.paper, stroke: C.ink2, sw: 1.2 }));
      g.push(P(`M${n(x + 58)} ${n(y - 22)}l-12 22h24z`, { fill: 'url(#hatch)', stroke: C.ink2, sw: 1.2 }));
      g.push(CIR(x, y - 26, 5, { fill: C.paper, stroke: C.ink2, sw: 1.3 }));
      break;
    }
    case 'flask': { // shape not yet fixed
      g.push(P(`M${n(x - 14)} ${n(y - 36)}h28v22l30 50h-88l30-50z`, { fill: C.paper, stroke: C.ink2, sw: 1.5, dash: '7 4' }));
      g.push(hatched(`M${n(x - 40)} ${n(y + 16)}h80v20h-80z`));
      g.push(CIR(x - 8, y + 4, 3, { fill: C.thin, stroke: 'none' }));
      g.push(CIR(x + 10, y - 6, 2.2, { fill: C.thin, stroke: 'none' }));
      g.push(T(x + 52, y - 24, '?', { size: 26, fill: C.red, cls: 'disp' }));
      break;
    }
    case 'wheel': { // a different answer every time you spin it
      g.push(CIR(x, y, 36, { fill: C.paper, stroke: C.ink2, sw: 1.5 }));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.push(L(x, y, x + Math.cos(a) * 36, y + Math.sin(a) * 36, { stroke: C.thin, sw: .9 }));
      }
      g.push(CIR(x, y, 6, { fill: C.ink2, stroke: 'none' }));
      g.push(P(`M${n(x + 44)} ${n(y - 10)}l-14 10 14 10z`, { fill: C.paper, stroke: C.red, sw: 1.3 }));
      break;
    }
    case 'ratchet': { // only turns one way; that is the entire point
      g.push(CIR(x, y, 38, { fill: C.paper, stroke: C.ink2, sw: 1.5 }));
      let d = '';
      for (let i = 0; i < 14; i++) {
        const a0 = (i / 14) * Math.PI * 2, a1 = ((i + 1) / 14) * Math.PI * 2;
        d += (i ? 'L' : 'M') + `${n(x + Math.cos(a0) * 38)} ${n(y + Math.sin(a0) * 38)}` +
          `L${n(x + Math.cos(a0) * 27)} ${n(y + Math.sin(a0) * 27)}` +
          `L${n(x + Math.cos(a1) * 38)} ${n(y + Math.sin(a1) * 38)}`;
      }
      g.push(P(d + 'Z', { stroke: C.ink2, sw: 1.2 }));
      g.push(P(`M${n(x + 56)} ${n(y - 40)}L${n(x + 30)} ${n(y - 14)}`, { stroke: C.ink2, sw: 2.4, cap: 'round' }));
      g.push(CIR(x + 56, y - 40, 4, { fill: C.paper, stroke: C.ink2, sw: 1.2 }));
      g.push(CIR(x, y, 8, { fill: C.paper, stroke: C.ink2, sw: 1.3 }));
      break;
    }
  }
  return g.join('');
}

const PROJECTS = [
  { fig: '04', kind: 'lattice',    name: 'LAMB',                sub: 'INTERPRETED LANGUAGE',   note: 'lexer → parser → AST → resolver' },
  { fig: '05', kind: 'plate',      name: 'DOCS-LAMB',           sub: 'LANGUAGE SPEC',          note: 'nobody can use what they cannot read' },
  { fig: '06', kind: 'manifold',   name: 'CHATTERNET',          sub: 'MULTI-THREADED TCP CHAT', note: 'many clients in, one broadcast out' },
  { fig: '07', kind: 'valve',      name: 'WINSOCK ECHO',        sub: 'TCP ECHO SERVER',        note: 'bind · listen · accept · send · recv' },
  { fig: '08', kind: 'chamber',    name: 'XV6',                 sub: 'SYSCALL TRACING',        note: 'the only way in is to open it up' },
  { fig: '09', kind: 'rotor',      name: 'MY_PORTFOLIO',        sub: 'PERSONAL SITE',          note: 'rebuilt more often than necessary' },
  { fig: '10', kind: 'gearbox',    name: 'PROJECT CAMP',        sub: 'COLLAB PM BACKEND',      note: 'roles, tasks, subtasks, notes' },
  { fig: '11', kind: 'filter',     name: 'HOSTELFIX',           sub: 'MAINTENANCE PLATFORM',   note: 'complaint in, resolution out' },
  { fig: '12', kind: 'escapement', name: 'RAPID RECALL',        sub: 'MULTIPLAYER WORD GAME',  note: 'the clock does not negotiate' },
  { fig: '13', kind: 'balance',    name: 'PLACEMENT PREDICTOR', sub: 'SUPERVISED MODEL',       note: 'a probability, not a verdict' },
  { fig: '14', kind: 'flask',      name: 'ON_CLOUD_9',          sub: 'PYTHON EXPERIMENT',      note: 'shape not yet fixed' },
  { fig: '15', kind: 'wheel',      name: 'MOVIE RECOMMENDER',   sub: 'CHROME EXTENSION',       note: 'a different film on every popup' },
  { fig: '16', kind: 'ratchet',    name: '700+ PROBLEMS',       sub: 'DELIBERATE PRACTICE',    note: 'turns one way only' },
];

const P3_TOP = 2772, P3_PITCH = 166;

function part03() {
  const s = [];

  s.push(figHead(IL, 2586, 'FIG. 04 — 16', 'THE PARTS LIST', 'COMPONENTS BOLTED TO THE MAIN SHAFT'));
  s.push(T(IR, 2586, 'EVERY PART IS A REAL REPOSITORY', { size: 17, ls: 3, fill: C.ink3, anchor: 'end' }));
  s.push(L(IL, 2660, IR, 2660, { stroke: C.ink2, sw: 1.2 }));

  PROJECTS.forEach((p, i) => {
    const y = P3_TOP + i * P3_PITCH;
    const side = i % 2 === 0 ? -1 : 1;
    const cx = AXIS + side * 158;
    const data = byName(p.name) || {};

    // branch off the shaft
    s.push(L(AXIS, y, cx, y, { stroke: C.ink2, sw: 2, op: .9 }));
    s.push(CIR(AXIS, y, 5.5, { fill: C.paper, stroke: C.ink2, sw: 1.6 }));
    s.push(CIR(AXIS, y, 1.8, { fill: C.ink2, stroke: 'none' }));

    // the part
    s.push(form(p.kind, cx, y));

    // annotation, out in the gutter (372px — everything is sized to fit it)
    const tx = side < 0 ? 448 : W - 448;
    const anchor = side < 0 ? 'end' : 'start';
    const px = cx + side * 80;

    const st = (data.status || '').toUpperCase();
    const shipped = st === 'SHIPPED' || st === 'LIVE';
    const nameSize = p.name.length <= 13 ? 30 : 23;

    s.push(T(tx, y - 48, `FIG. ${p.fig}`, { size: 15, ls: 4, fill: C.red, anchor, weight: 600 }));
    if (st) {
      // status rides on the fig line, at the opposite end of the shelf
      const sx = side < 0 ? IL : IR;
      const sa = side < 0 ? 'start' : 'end';
      s.push(T(sx, y - 76, st, { size: 15, ls: 2.6, anchor: sa, weight: 600, fill: shipped ? C.ink3 : C.red }));
      s.push(L(sx, y - 68, sx - side * (st.length * 10.6), y - 68, { stroke: shipped ? C.ink3 : C.red, sw: 1.2, op: .75 }));
      if (!shipped) s.push(CIR(sx - side * (st.length * 10.6 + 14), y - 81, 3.6, { fill: C.red, stroke: 'none', cls: 'led-b' }));
    }
    s.push(T(tx, y - 16, p.name, { cls: 'disp', size: nameSize, ls: nameSize > 25 ? 2.4 : 1.6, fill: C.ink, anchor }));
    s.push(T(tx, y + 8, p.sub, { size: 16, ls: 1.8, fill: C.ink3, anchor }));
    s.push(T(tx, y + 32, (data.tech || '').replace(/\//g, '·'), { size: 16, ls: 1.4, fill: C.ink2, anchor }));
    s.push(T(tx, y + 58, p.note, { cls: 'hand', size: 18, fill: C.ink3, anchor, op: .85 }));
  });

  // margin notes that only pay off if you are actually reading
  s.push(note(IL + 6, 2876, ['fig. 05 exists only because', 'fig. 04 was unreadable without it'], { rot: -.7, size: 18 }));
  s.push(note(W - 100, 3372, ['do not optimise this'], { rot: 2.4, size: 20, anchor: 'end' }));
  s.push(note(IL + 6, 3870, ['works on my machine.', 'that was the whole bug.'], { rot: .9, size: 18 }));
  s.push(note(IL + 6, 4200, ['temporary component —', '14 revisions later'], { rot: -2, size: 18 }));
  s.push(note(W - 100, 4360, ['probably unnecessary.', 'built anyway.'], { rot: -1.2, size: 19, anchor: 'end' }));

  return s.join('');
}

/* ================================================================== *
 * PART 04 — EXPLODED VIEW                     y 4840 … 5770
 * ================================================================== */

/** an isometric plate, drawn with thickness */
function plate(cx, cy, hw, hd, t, o = {}) {
  const top = `M${n(cx - hw)} ${n(cy)}L${n(cx)} ${n(cy - hd)}L${n(cx + hw)} ${n(cy)}L${n(cx)} ${n(cy + hd)}Z`;
  const left = `M${n(cx - hw)} ${n(cy)}L${n(cx - hw)} ${n(cy + t)}L${n(cx)} ${n(cy + hd + t)}L${n(cx)} ${n(cy + hd)}Z`;
  const right = `M${n(cx + hw)} ${n(cy)}L${n(cx + hw)} ${n(cy + t)}L${n(cx)} ${n(cy + hd + t)}L${n(cx)} ${n(cy + hd)}Z`;
  return [
    P(left, { fill: 'url(#hatch)', stroke: C.ink2, sw: 1.3 }),
    P(right, { fill: C.tint, stroke: C.ink2, sw: 1.3 }),
    P(top, { fill: o.dashed ? 'none' : C.paper, stroke: o.stroke || C.ink, sw: 1.6, dash: o.dashed ? '9 6' : undefined }),
    o.inner || '',
  ].join('');
}

const P4 = [
  { no: '01', name: 'SYSTEMS', body: ['Read the layer below the one you are', 'standing on. Kernels, sockets, memory.'] },
  { no: '02', name: 'BUILD',   body: ['Make the thing. Badly first.', 'A parser is not real until it runs.'] },
  { no: '03', name: 'EXPERIMENT', body: ['Break it on purpose in a place', 'where breaking it costs nothing.'] },
  { no: '04', name: 'SHIP',    body: ['Push it where someone else can', 'find it. Unshipped work is a draft.'] },
  { no: '05', name: 'LEARN',   body: ['Return with what broke.', 'Feed it back into plate 01.'] },
];

const P4_TOP = 5010, P4_PITCH = 158;

function part04() {
  const s = [];

  s.push(figHead(IL, 4866, 'FIG. 17', 'EXPLODED VIEW', 'THE LOOP, PULLED APART FOR INSPECTION'));
  s.push(T(IR, 4866, 'SCALE 1:1 · NOT TO BE READ AS A LADDER', { size: 17, ls: 3, fill: C.ink3, anchor: 'end' }));

  // explosion centre-line runs the whole stack
  const yTop = P4_TOP - 66, yBot = P4_TOP + P4_PITCH * 4 + 90;
  s.push(L(AXIS, yTop, AXIS, yBot, { stroke: C.red, sw: .9, dash: '18 6 3 6', op: .55 }));

  P4.forEach((p, i) => {
    const y = P4_TOP + i * P4_PITCH;
    const side = i % 2 === 0 ? 1 : -1;
    const hw = 218 - i * 8;

    // per-plate interior detail so no two plates read the same
    let inner = '';
    if (i === 0) inner = Array.from({ length: 5 }, (_, k) =>
      L(AXIS - 120 + k * 60, y - 26 + k * 0, AXIS - 90 + k * 60, y + 10, { stroke: C.thin, sw: .9 })).join('');
    if (i === 1) inner = gear(AXIS, y, 30, 12, { cls: 'g-cw', spin: true, sw: 1, spokes: false, stroke: C.thin });
    if (i === 2) inner = CIR(AXIS, y, 26, { stroke: C.red, sw: 1, dash: '5 5' }) + T(AXIS, y + 8, '?', { size: 26, anchor: 'middle', fill: C.red, cls: 'disp' });
    if (i === 3) inner = arrow(AXIS + 40, y, 0, { size: 16, fill: C.ink2 }) + L(AXIS - 46, y, AXIS + 34, y, { stroke: C.ink2, sw: 2 });
    if (i === 4) inner = P(`M${n(AXIS - 40)} ${n(y + 4)}a40 22 0 1 1 80 0`, { stroke: C.ink2, sw: 1.6 }) +
      arrow(AXIS - 40, y + 4, 100, { size: 11, fill: C.ink2 });

    s.push(plate(AXIS, y, hw, 62, 13, { inner }));

    // exploded separation arrows between plates
    if (i < P4.length - 1) {
      const my = y + 88;
      s.push(L(AXIS, my - 12, AXIS, my + 12, { stroke: C.faint, sw: .8 }));
      s.push(arrow(AXIS, my + 16, 90, { size: 9, fill: C.faint }));
    }

    // label
    const tx = side < 0 ? IL + 6 : IR - 6;
    const anchor = side < 0 ? 'start' : 'end';
    const px = AXIS + side * (hw - 20);
    s.push(P(`M${n(px)} ${n(y - 12)}L${n(tx + (side < 0 ? 128 : -128))} ${n(y - 40)}L${n(tx)} ${n(y - 40)}`, { stroke: C.thin, sw: .9 }));
    s.push(CIR(px, y - 12, 2.8, { fill: C.thin, stroke: 'none' }));
    s.push(T(tx, y - 52, `${p.no} —`, { size: 17, ls: 4, fill: C.red, anchor, weight: 600 }));
    s.push(T(tx, y - 18, p.name, { cls: 'disp', size: 38, ls: 5, fill: C.ink, anchor }));
    s.push(TT(tx, y + 8, p.body, { size: 16, fill: C.ink3, anchor, lh: 22 }));
  });

  // the feedback path: down out of plate 05, along the margin, back into plate 01
  s.push(P(`M514 5652L514 5762L52 5762L52 5024L466 5024`,
    { stroke: C.red, sw: 1.1, dash: '9 7', op: .65 }));
  s.push(arrow(470, 5024, 0, { size: 11, fill: C.red }));
  s.push(CIR(514, 5652, 2.8, { fill: C.red, stroke: 'none' }));
  s.push(pulse('M514 5652L514 5762L52 5762L52 5024L466 5024', 11, { r: 3.2, op: .7 }));
  s.push(T(546, 5756, 'PLATE 05 RETURNS TO PLATE 01', { size: 16, ls: 3, fill: C.ink3 }));

  s.push(note(IL + 6, 5690, ['plate 03 is where most of the', 'sheet actually gets drawn'], { rot: -.6, size: 18, fill: C.ink3 }));

  return s.join('');
}

/* ================================================================== *
 * PART 08 — UNIDENTIFIED COMPONENT            y 5800 … 6280
 * ================================================================== *
 * ~66% down the sheet. Drawn in a different hand.
 * ------------------------------------------------------------------ */

function part08() {
  const s = [];
  const cx = 986, cy = 6042;

  // it is not connected to the shaft in any way the drawing explains
  s.push(P(`M${n(AXIS)} ${n(5946)}Q${n(820)} ${n(5960)} ${n(cx - 74)} ${n(cy - 26)}`,
    { stroke: C.red, sw: 1.1, dash: '6 7', op: .8, cls: 'flow' }));
  s.push(pulse(`M${n(AXIS)} ${n(5946)}Q${n(820)} ${n(5960)} ${n(cx - 74)} ${n(cy - 26)}`, 5.5, { r: 3.4, op: .8 }));

  // exclusion zone
  s.push(CIR(cx, cy, 152, { stroke: C.red, sw: .9, dash: '3 9', op: .5, cls: 'soft' }));

  // the component: an irregular solid that does not match the sheet's projection
  const pts = [[-78, -62], [16, -84], [89, -30], [78, 54], [5, 89], [-73, 51], [-97, -11]];
  const d = 'M' + pts.map(([dx, dy]) => `${n(cx + dx)} ${n(cy + dy)}`).join('L') + 'Z';
  s.push(P(d, { fill: C.paper, stroke: C.ink, sw: 2 }));
  s.push(P(d, { fill: 'url(#stipple)', stroke: 'none' }));
  // interior that refuses to resolve
  s.push(P(`M${n(cx - 40)} ${n(cy - 27)}L${n(cx + 35)} ${n(cy + 5)}L${n(cx - 16)} ${n(cy + 48)}Z`, { stroke: C.ink2, sw: 1.2, dash: '5 4' }));
  s.push(CIR(cx + 8, cy - 8, 20, { stroke: C.red, sw: 1.4 }));
  s.push(CIR(cx + 8, cy - 8, 6, { fill: C.red, stroke: 'none', cls: 'led' }));
  // part number, outside the outline where a part number belongs
  s.push(L(cx - 86, cy + 44, cx - 132, cy + 72, { stroke: C.thin, sw: .9 }));
  s.push(T(cx - 138, cy + 78, '07B', { cls: 'disp', size: 26, ls: 3, fill: C.ink, anchor: 'end' }));
  // the specification nobody could complete — small print, rewards zooming in
  s.push(TT(cx + 108, cy + 16, ['MATERIAL', 'MASS', 'TOLERANCE', 'FUNCTION'],
    { size: 13, ls: 1.6, fill: C.faint, lh: 20 }));
  s.push(TT(cx + 208, cy + 16, ['—', '—', '± ?', 'UNSTATED'],
    { size: 13, ls: 1.6, fill: C.ink3, lh: 20 }));
  // detail bubble: an enlargement that clarifies nothing
  s.push(CIR(cx - 122, cy - 58, 21, { stroke: C.ink2, sw: 1 }));
  s.push(L(cx - 106, cy - 44, cx - 62, cy - 22, { stroke: C.thin, sw: .8, dash: '4 4' }));
  s.push(P(`M${n(cx - 132)} ${n(cy - 62)}l10 -6 8 12 -9 7z`, { stroke: C.ink2, sw: .9 }));
  s.push(T(cx - 122, cy - 88, 'DETAIL Z', { size: 12, ls: 2, anchor: 'middle', fill: C.ink3 }));

  // hatched warning bar
  s.push(R(cx - 96, cy + 116, 192, 28, { fill: 'url(#hatchD)', stroke: C.red, sw: 1.4 }));
  s.push(R(cx - 72, cy + 121, 144, 19, { fill: C.paper, stroke: 'none' }));
  s.push(T(cx, cy + 136, 'DO NOT TOUCH', { size: 17, ls: 3.4, anchor: 'middle', fill: C.red, weight: 600 }));

  // the annotation, in the left gutter, deliberately far from everything
  s.push(T(IL, 5906, 'COMPONENT 07B', { size: 17, ls: 5, fill: C.red, weight: 600 }));
  s.push(L(IL, 5918, IL + 168, 5918, { stroke: C.red, sw: 1.4 }));
  s.push(T(IL, 5964, 'UNIDENTIFIED', { cls: 'disp', size: 44, ls: 5, fill: C.ink }));
  s.push(TT(IL, 6002, [
    'ORIGIN UNKNOWN. Present in every revision of this',
    'sheet, including the ones drawn before it was added.',
    '',
    'Removal attempted twice. Both times the drawing came',
    'back with it. It is not load-bearing. It is not inert.',
  ], { size: 17, fill: C.ink3, lh: 24 }));

  s.push(T(IL, 6172, 'DIAGNOSIS', { size: 15, ls: 3.4, fill: C.ink3 }));
  s.push(T(IL, 6200, '— PENDING SINCE REV 02 —', { size: 18, ls: 2.4, fill: C.ink2, weight: 600 }));

  s.push(note(cx + 108, cy - 118, ['I did touch it.', 'nothing happened.', 'probably.'], { rot: 3.4, size: 19 }));
  s.push(note(IL + 2, 6242, ['left in on purpose'], { rot: -1.4, size: 18, fill: C.ink3 }));

  return s.join('');
}

const ALT = "THE DEEBYANSHU BLUEPRINT — sheet DJ-0001, a 1400 by 8800 pixel engineering drawing of Deebyanshu Jha as a machine. Fig. 01 is the title block: name, designation 24BCT0213, status BUILDING, version 2026.08, drawn by D. Jha, checked by nobody. Fig. 02 is THE CORE, an octagonal assembly with six subsystems piped to it: BUILDING (a screw press), EXPERIMENTS (a retort), SYSTEMS (a cut-away piston), WEB (a branching distribution network), DSA (a gear train) and AI (a sealed chamber with an unsettled readout). Figs. 04 to 16 are the parts list: each real project drawn as a component bolted to the main shaft — Lamb, docs-lamb, ChatterNet, WinSock echo server, xv6, my_portfolio, Project Camp, HostelFix, Rapid Recall, placement predictor, On_Cloud_9, a movie-recommender extension and 700+ solved problems, each annotated with its stack and status. Fig. 17 is an exploded view of five plates: SYSTEMS, BUILD, EXPERIMENT, SHIP, LEARN — a loop, plate 05 returning to plate 01. Component 07B, roughly two thirds down, is UNIDENTIFIED and marked DO NOT TOUCH. Fig. 18 is the field record: a revision table from first commit to this sheet, over-stamped FIELD TESTED, COMPONENT VALIDATED and 700+. Fig. 19 is FUTURE COMPONENTS, drawn only in dashed construction lines: compilers, distributed systems, and one reserved bay marked with a question mark. Fig. 23 is SIGNAL OUTPUT, a terminal flange with nozzles for GitHub, LinkedIn and email, plus secondary channels. The sheet ends END OF BLUEPRINT, VERSION 01, with a line running off the bottom edge and the note SHEET 02 NOT YET DRAWN.";

/* ================================================================== *
 * PART 06 — FIELD RECORD / MODIFICATIONS      y 6320 … 7000
 * ================================================================== *
 * A real drawing carries its own revision history. Milestones are not
 * a timeline here — they are changes somebody made to the sheet.
 * ------------------------------------------------------------------ */

const REVS = [
  ['00', 'SHEET OPENED',   'First commit. Nothing on it yet but the frame.'],
  ['01', 'SOCKETS',        'WinSock echo server. bind/listen/accept, from the bottom up.'],
  ['02', 'CONCURRENCY',    'ChatterNet: multi-threaded TCP group chat, live broadcast.'],
  ['03', 'LANGUAGE',       'Lamb shipped — lexer, parser, AST, resolver, closures, classes.'],
  ['04', 'SPEC ADDED',     'docs-lamb published. Fig. 04 became readable.'],
  ['05', 'BACKEND',        'Project Camp: projects, tasks, subtasks, notes, role-based access.'],
  ['06', 'PRACTICE',       '700+ problems solved. Logged, not counted.'],
  ['07', 'KERNEL OPENED',  'xv6: traps, syscalls, scheduler. Still open. Deliberately.'],
  ['08', 'SHEET REDRAWN',  'This revision. 2026.08.'],
];

function part06() {
  const s = [];
  const TX = 980;

  s.push(figHead(IL, 6352, 'FIG. 18', 'FIELD RECORD', 'MODIFICATIONS MADE TO THIS SHEET'));

  const y0 = 6516, rowH = 40;
  // the table is a plate pinned over the drawing — it occludes the shaft behind it
  s.push(R(IL - 16, y0 - 62, TX - 24 - IL + 16, REVS.length * rowH + 76, { fill: C.paper, stroke: C.ink2, sw: 1.6 }));
  s.push(L(IL, y0 - 26, TX - 40, y0 - 26, { stroke: C.ink2, sw: 1.4 }));
  s.push(T(IL, y0 - 34, 'REV', { size: 15, ls: 3, fill: C.ink3 }));
  s.push(T(IL + 78, y0 - 34, 'CHANGE', { size: 15, ls: 3, fill: C.ink3 }));
  s.push(T(IL + 296, y0 - 34, 'DESCRIPTION', { size: 15, ls: 3, fill: C.ink3 }));

  REVS.forEach(([r, chg, desc], i) => {
    const y = y0 + i * rowH;
    const last = i === REVS.length - 1;
    s.push(T(IL, y, r, { size: 19, ls: 2, fill: last ? C.red : C.ink2, weight: 600 }));
    s.push(T(IL + 78, y, chg, { size: 17, ls: 2.4, fill: C.ink, weight: 600 }));
    s.push(T(IL + 296, y, desc, { size: 16, fill: C.ink3 }));
    s.push(L(IL, y + 12, TX - 40, y + 12, { stroke: C.faint, sw: .55, dash: '2 5', op: .9 }));
    if (last) s.push(CIR(IL - 18, y - 6, 4.4, { fill: C.red, stroke: 'none', cls: 'led' }));
  });

  s.push(T(IL, y0 + REVS.length * rowH + 46, 'NO ENTRY IN THIS TABLE WAS ADDED BY ANYONE ELSE.',
    { size: 16, ls: 2.4, fill: C.ink3 }));

  /* ---- stamps, pressed over the right margin ---- */
  s.push(stamp(1168, 6528, 300, 88, [
    { s: 'FIELD TESTED', big: true }, { s: 'CHATTERNET · CONCURRENT' },
  ], { rot: -5.5, op: .82 }));
  s.push(stamp(1162, 6716, 306, 88, [
    { s: 'COMPONENT VALIDATED' }, { s: 'LAMB — LANGUAGE COMPLETE' },
  ], { rot: 3.2, op: .68 }));
  s.push(stamp(1176, 6898, 252, 88, [
    { s: '700+', big: true }, { s: 'PROBLEMS · LOGGED' },
  ], { rot: -2.2, op: .74 }));

  s.push(note(1006, 6980, ['stamps are not achievements.', 'they are just proof it ran.'], { rot: 1.6, size: 18, fill: C.ink3 }));

  return s.join('');
}

/* ================================================================== *
 * PART 09 — FUTURE COMPONENTS                 y 7040 … 7940
 * ================================================================== *
 * The sheet stops being finished here. That is the honest part.
 * ------------------------------------------------------------------ */

function part09() {
  const s = [];

  s.push(figHead(IL, 7072, 'FIG. 19', 'FUTURE COMPONENTS', 'STATUS: UNDER CONSTRUCTION', { size: 40 }));
  s.push(T(IR, 7072, 'NOT YET DIMENSIONED', { size: 17, ls: 3, fill: C.red, anchor: 'end' }));

  // the shaft thins out and loses its second wall
  s.push(R(AXIS - 7, 7180, 14, 900, { fill: C.paperHi, stroke: 'none' }));
  s.push(L(AXIS - 7, 7180, AXIS - 7, 8080, { stroke: C.ink2, sw: 1.5, dash: '30 14', op: .7 }));
  s.push(L(AXIS + 7, 7180, AXIS + 7, 7460, { stroke: C.ink2, sw: 1.5, op: .5 }));
  s.push(L(AXIS + 7, 7460, AXIS + 7, 8080, { stroke: C.faint, sw: 1, dash: '8 12' }));

  const ghost = (x, y, w, h, code, name, tech, body, side) => {
    const g = [];
    g.push(R(x - w / 2, y - h / 2, w, h, { stroke: C.thin, sw: 1.4, dash: '11 7' }));
    // construction lines only — the part itself was never drawn
    g.push(L(x - w / 2, y - h / 2, x + w / 2, y + h / 2, { stroke: C.faint, sw: .6, dash: '3 6' }));
    g.push(L(x + w / 2, y - h / 2, x - w / 2, y + h / 2, { stroke: C.faint, sw: .6, dash: '3 6' }));
    g.push(centreMark(x, y, 20));
    g.push(L(AXIS, y, x + (x < AXIS ? w / 2 : -w / 2), y, { stroke: C.faint, sw: 1, dash: '6 8' }));
    const tx = side < 0 ? x - w / 2 : x + w / 2;
    const anchor = side < 0 ? 'end' : 'start';
    const ox = side < 0 ? -28 : 28;
    g.push(T(tx + ox, y - 30, code, { size: 15, ls: 4, fill: C.red, anchor, weight: 600 }));
    g.push(T(tx + ox, y, name, { cls: 'disp', size: 28, ls: 2.4, fill: C.ink2, anchor }));
    g.push(T(tx + ox, y + 24, tech, { size: 16, ls: 2, fill: C.ink3, anchor }));
    g.push(T(tx + ox, y + 50, body, { cls: 'hand', size: 18, fill: C.ink3, anchor, op: .85 }));
    return g.join('');
  };

  s.push(ghost(500, 7286, 216, 132, 'FIG. 20', 'COMPILERS', 'BYTECODE · VM · OPT',
    'stop walking the tree', -1));
  s.push(ghost(900, 7548, 216, 132, 'FIG. 21', 'DISTRIBUTED', 'CONSENSUS · RPC',
    'one server is never enough', 1));

  // an unnamed bay — the sheet does not know what goes here yet
  s.push(R(AXIS - 128, 7742, 256, 150, { stroke: C.faint, sw: 1.2, dash: '5 9' }));
  s.push(T(AXIS, 7828, '?', { cls: 'disp', size: 82, anchor: 'middle', fill: C.faint }));
  s.push(T(AXIS, 7866, 'FIG. 22 — RESERVED', { size: 15, ls: 3, anchor: 'middle', fill: C.faint }));

  // a revision cloud drawn round an area nobody has decided about yet
  {
    const rx = 344, ry = 7452, rw = 128, rh = 92, N = 22;
    let d = "";
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const ax = rx + Math.cos(a) * rw, ay = ry + Math.sin(a) * rh;
      const b = ((i - .5) / N) * Math.PI * 2;
      const qx = rx + Math.cos(b) * (rw + 15), qy = ry + Math.sin(b) * (rh + 15);
      d += i === 0 ? "M" + n(ax) + " " + n(ay)
                   : "Q" + n(qx) + " " + n(qy) + " " + n(ax) + " " + n(ay);
    }
    s.push(P(d, { stroke: C.red, sw: 1.1, op: .5 }));
    s.push(P("M" + n(rx + 106) + " " + n(ry - 94) + "l22 -30 22 30z", { stroke: C.red, sw: 1.1, fill: C.paper }));
    s.push(T(rx + 128, ry - 70, "?", { size: 17, anchor: "middle", fill: C.red, weight: 600 }));
    s.push(T(rx, ry - 4, "AREA RESERVED", { size: 15, ls: 3, anchor: "middle", fill: C.faint }));
    s.push(T(rx, ry + 22, "CHANGE NOT YET SPECIFIED", { size: 13, ls: 2, anchor: "middle", fill: C.faint }));
  }
  // a dimension nobody could fill in
  s.push(dimH(7660, 572, 828, "?", { ext: 8, stroke: C.faint }));

  // half-finished draughting: a circle abandoned mid-compass-sweep
  s.push(P(`M${n(300)} ${n(7700)}a96 96 0 0 1 150 -50`, { stroke: C.faint, sw: 1, dash: '4 5' }));
  s.push(CIR(300, 7700, 3, { fill: C.faint, stroke: 'none' }));
  s.push(note(206, 7772, ['stopped drawing this.', "didn't know what it was yet."], { rot: -1.8, size: 18, fill: C.ink3 }));

  s.push(T(1140, 7724, 'VERSION 0.1', { size: 16, ls: 3, fill: C.faint, anchor: 'end' }));
  s.push(note(1204, 7802, ['TODO: make this', 'less stupid'], { rot: 2.6, size: 19, anchor: 'end' }));

  return s.join('');
}

/* ================================================================== *
 * PART 10 — SIGNAL OUTPUT                     y 7980 … 8560
 * ================================================================== */

const PORTS = [
  ['GITHUB',   'github.com/deebyanshujha'],
  ['LINKEDIN', 'linkedin.com/in/deebyanshujha'],
  ['EMAIL',    'jhadeebyanshu@gmail.com'],
];
const SUB_PORTS = [
  ['LEETCODE', '/u/deebyanshujha'],
  ['HACKERRANK', '/profile/jhadeebyanshu'],
  ['CODOLIO', '/profile/deebyanshujha'],
];

function part10() {
  const s = [];

  s.push(figHead(AXIS, 8014, 'FIG. 23', 'SIGNAL OUTPUT', 'TERMINAL FLANGE — ALL CHANNELS OPEN', { anchor: 'middle', knockout: [AXIS - 330, 660] }));

  // the shaft opens into a manifold
  const my = 8168;
  s.push(P(`M${n(AXIS - 12)} ${n(8100)}L${n(360)} ${n(my - 20)}L${n(1040)} ${n(my - 20)}L${n(AXIS + 12)} ${n(8100)}Z`,
    { fill: C.paper, stroke: C.ink2, sw: 1.6 }));
  s.push(R(348, my - 20, 704, 34, { fill: C.paper, stroke: C.ink, sw: 2 }));
  s.push(R(348, my - 20, 704, 34, { fill: 'url(#hatch)', stroke: 'none', op: .35 }));
  for (let i = 0; i < 9; i++) s.push(bolt(374 + i * 82, my - 3, 5));

  PORTS.forEach(([name, addr], i) => {
    const x = 400 + i * 300;
    // nozzle
    s.push(P(`M${n(x - 30)} ${n(my + 14)}L${n(x - 20)} ${n(my + 52)}L${n(x + 20)} ${n(my + 52)}L${n(x + 30)} ${n(my + 14)}Z`,
      { fill: C.paper, stroke: C.ink2, sw: 1.5 }));
    s.push(L(x - 20, my + 52, x + 20, my + 52, { stroke: C.ink, sw: 3 }));
    s.push(pulse(`M${n(x)} ${n(my + 16)}L${n(x)} ${n(my + 92)}`, 3.2, { begin: -i * 1.1, r: 3.6 }));
    s.push(L(x, my + 56, x, my + 96, { stroke: C.faint, sw: .8, dash: '4 6' }));
    s.push(T(x, my + 138, name, { cls: 'disp', size: 32, ls: 3.4, anchor: 'middle', fill: C.ink }));
    s.push(L(x - 130, my + 152, x + 130, my + 152, { stroke: C.ink2, sw: 1.2 }));
    s.push(T(x, my + 176, addr, { size: 15, ls: .4, anchor: 'middle', fill: C.ink3 }));
  });

  // secondary channels
  s.push(L(348, my + 234, 1052, my + 234, { stroke: C.faint, sw: .8 }));
  s.push(T(348, my + 226, 'SECONDARY CHANNELS', { size: 15, ls: 3, fill: C.ink3 }));
  SUB_PORTS.forEach(([name, addr], i) => {
    const x = 372 + i * 234;
    s.push(T(x, my + 262, name, { size: 17, ls: 2.2, fill: C.ink2, weight: 600 }));
    s.push(T(x, my + 286, addr, { size: 14, fill: C.ink3 }));
  });

  s.push(note(IR, my + 132, ['GitHub will not click', 'an SVG — real links', 'are below the image'], { rot: -2, size: 17, fill: C.ink3, anchor: 'end' }));

  return s.join('');
}

/* ------------------------------------------------------------------ *
 * END OF SHEET
 * ------------------------------------------------------------------ */

function partEnd() {
  const s = [];
  const y = 8560;
  s.push(L(IL, y, IR, y, { stroke: C.ink2, sw: 1.6 }));
  s.push(T(IL, y + 34, 'END OF BLUEPRINT', { cls: 'disp', size: 34, ls: 8, fill: C.ink }));
  s.push(T(IL, y + 62, 'VERSION 01 · SHEET DJ-0001 · REV 08', { size: 16, ls: 3, fill: C.ink3 }));
  s.push(T(IR, y + 34, '2026.08', { size: 20, ls: 3, fill: C.ink3, anchor: 'end' }));

  // the drawing does not actually stop; it just runs off the sheet
  s.push(L(AXIS, y + 92, AXIS, FB + 40, { stroke: C.ink2, sw: 1.5 }));
  s.push(T(AXIS, y + 152, '· · ·', { size: 30, ls: 8, anchor: 'middle', fill: C.ink3 }));
  s.push(T(AXIS, y + 186, 'SHEET 02 NOT YET DRAWN', { size: 15, ls: 4, anchor: 'middle', fill: C.faint }));
  return s.join('');
}

/* ------------------------------------------------------------------ *
 * PART 07 — SIDE NOTES
 * Placed in whichever gutter is empty at that height.
 * ------------------------------------------------------------------ */

const OBS = [
  [1, 1010, '01', ['Prefers understanding systems', 'rather than treating them', 'as black boxes.']],
  [1, 3040, '02', ['Frequently builds things', 'that probably could have', 'been simpler.']],
  [-1, 3208, '03', ['Still thinks debugging is a', 'valid form of entertainment.']],
  [1, 4040, '04', ['Will read the source before', 'reading the documentation,', 'then complain about both.']],
  [1, 7176, '05', ['Assumes the interesting part', 'is always one layer further down.']],
];

function part07() {
  return OBS.map(([side, y, no, lines]) => {
    const x = side < 0 ? IL : IR;
    const a = side < 0 ? 'start' : 'end';
    return [
      T(x, y, `OBSERVATION ${no}`, { size: 15, ls: 4, fill: C.red, anchor: a, weight: 600 }),
      L(x, y + 12, x - side * 148, y + 12, { stroke: C.red, sw: 1.1, op: .7 }),
      TT(x, y + 40, lines, { size: 17, fill: C.ink2, anchor: a, lh: 24 }),
    ].join('');
  }).join('');
}

/* ================================================================== *
 * ASSEMBLE
 * ================================================================== */

const doc = [
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" `,
  `viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" `,
  `aria-label="${esc(ALT)}">`,
  `<title>THE DEEBYANSHU BLUEPRINT — sheet DJ-0001</title>`,
  defs(),
  sheet(),
  spine(),
  part01(),
  part02(),
  part03(),
  part04(),
  part08(),
  part06(),
  part09(),
  part10(),
  part07(),
  partEnd(),
  spineSignal(),
  '</svg>',
].join('');

mkdirSync(resolve(ROOT, 'assets'), { recursive: true });
writeFileSync(resolve(ROOT, 'assets/blueprint.svg'), doc, 'utf8');
console.log(`assets/blueprint.svg  ${W}×${H}  ${(doc.length / 1024).toFixed(1)} KB`);
