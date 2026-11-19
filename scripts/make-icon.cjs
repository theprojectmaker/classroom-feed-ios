#!/usr/bin/env node
/* Draws the home-screen icon + splash art and renders them to PNG.
   The icon is the SAME mark the app shows next to its name (App.js, the sidebar): a blue gradient tile with the white
   double tick. The tick is not redrawn by hand: its outline is read straight out of the icon font the app uses
   (Ionicons "checkmark-done"), so the home screen and the app can never drift apart.
   Dev tool only (not a dependency): uses the copy of `sharp` that lives in ../remote-control.
   Run: node scripts/make-icon.cjs */
const path = require('path');
const fs = require('fs');
const sharp = require(path.resolve(__dirname, '..', '..', 'remote-control', 'node_modules', 'sharp'));

const root = path.resolve(__dirname, '..');
const FONT = path.join(root, 'node_modules', '@expo', 'vector-icons', 'build', 'vendor', 'react-native-vector-icons', 'Fonts', 'Ionicons.ttf');
const GLYPHS = path.join(root, 'node_modules', '@expo', 'vector-icons', 'build', 'vendor', 'react-native-vector-icons', 'glyphmaps', 'Ionicons.json');

// Keep these three in step with the mark in App.js (styles `mark` + the LinearGradient + the Icon size).
const GRADIENT = ['#3D8BFF', '#173FB8'];
const TILE = 36, GLYPH = 20;
const NAME = 'checkmark-done';

/** Reads one glyph's outline from a TrueType font: an SVG path in font units (y up), plus the font's metrics. */
function readGlyph(file, codepoint) {
  const b = fs.readFileSync(file);
  const tables = {};
  for (let i = 0, n = b.readUInt16BE(4); i < n; i++) {
    const o = 12 + i * 16;
    tables[b.toString('latin1', o, o + 4)] = { off: b.readUInt32BE(o + 8), len: b.readUInt32BE(o + 12) };
  }
  for (const t of ['head', 'hhea', 'hmtx', 'cmap', 'loca', 'glyf']) if (!tables[t]) throw new Error(`the font has no ${t} table`);
  const upm = b.readUInt16BE(tables.head.off + 18);
  const longLoca = b.readInt16BE(tables.head.off + 50) === 1;
  const asc = b.readInt16BE(tables.hhea.off + 4), desc = b.readInt16BE(tables.hhea.off + 6);
  const nHM = b.readUInt16BE(tables.hhea.off + 34);

  // character -> glyph number
  let gid = 0;
  const cm = tables.cmap.off;
  for (let i = 0, n = b.readUInt16BE(cm + 2); i < n && !gid; i++) {
    const sub = cm + b.readUInt32BE(cm + 4 + i * 8 + 4);
    const fmt = b.readUInt16BE(sub);
    if (fmt === 4) {
      const segs = b.readUInt16BE(sub + 6) / 2;
      const end = sub + 14, start = end + segs * 2 + 2, delta = start + segs * 2, range = delta + segs * 2;
      for (let s = 0; s < segs; s++) {
        if (b.readUInt16BE(end + s * 2) < codepoint) continue;
        const st = b.readUInt16BE(start + s * 2);
        if (st > codepoint) break;
        const ro = b.readUInt16BE(range + s * 2), dl = b.readUInt16BE(delta + s * 2);
        if (!ro) gid = (codepoint + dl) & 0xffff;
        else { const g = b.readUInt16BE(range + s * 2 + ro + (codepoint - st) * 2); gid = g ? (g + dl) & 0xffff : 0; }
        break;
      }
    } else if (fmt === 12) {
      for (let g = 0, n2 = b.readUInt32BE(sub + 12); g < n2; g++) {
        const o = sub + 16 + g * 12, a = b.readUInt32BE(o), z = b.readUInt32BE(o + 4);
        if (codepoint >= a && codepoint <= z) { gid = b.readUInt32BE(o + 8) + (codepoint - a); break; }
      }
    }
  }
  if (!gid) throw new Error('the font has no glyph for that character');

  const adv = b.readUInt16BE(tables.hmtx.off + Math.min(gid, nHM - 1) * 4);
  const loc = (g) => (longLoca ? b.readUInt32BE(tables.loca.off + g * 4) : b.readUInt16BE(tables.loca.off + g * 2) * 2);
  let p = tables.glyf.off + loc(gid);
  if (loc(gid + 1) === loc(gid)) throw new Error('that glyph is empty');
  const nContours = b.readInt16BE(p);
  if (nContours < 0) throw new Error('compound glyphs are not handled');
  const box = { xMin: b.readInt16BE(p + 2), yMin: b.readInt16BE(p + 4), xMax: b.readInt16BE(p + 6), yMax: b.readInt16BE(p + 8) };
  p += 10;
  const ends = [];
  for (let i = 0; i < nContours; i++, p += 2) ends.push(b.readUInt16BE(p));
  p += 2 + b.readUInt16BE(p); // skip the hinting instructions
  const nPts = ends[ends.length - 1] + 1;
  const flags = [];
  while (flags.length < nPts) {
    const f = b[p++]; flags.push(f);
    if (f & 8) { for (let r = b[p++]; r > 0; r--) flags.push(f); }
  }
  const xs = [], ys = [];
  let v = 0;
  for (const f of flags) {
    if (f & 2) { const d = b[p++]; v += f & 16 ? d : -d; } else if (!(f & 16)) { v += b.readInt16BE(p); p += 2; }
    xs.push(v);
  }
  v = 0;
  for (const f of flags) {
    if (f & 4) { const d = b[p++]; v += f & 32 ? d : -d; } else if (!(f & 32)) { v += b.readInt16BE(p); p += 2; }
    ys.push(v);
  }

  // TrueType outlines are quadratic curves; two control points in a row imply a point on the curve halfway between them.
  const n2 = (x) => Math.round(x * 100) / 100;
  let d = '', from = 0;
  for (const end of ends) {
    const pts = [];
    for (let i = from; i <= end; i++) pts.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) });
    from = end + 1;
    if (pts.length < 2) continue;
    let k = pts.findIndex((q) => q.on);
    let first;
    if (k < 0) { first = { x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2 }; k = -1; } else first = pts[k];
    const rest = k < 0 ? pts : [...pts.slice(k + 1), ...pts.slice(0, k)];
    d += `M${n2(first.x)} ${n2(first.y)}`;
    let ctl = null;
    for (const q of rest) {
      if (q.on) { d += ctl ? `Q${n2(ctl.x)} ${n2(ctl.y)} ${n2(q.x)} ${n2(q.y)}` : `L${n2(q.x)} ${n2(q.y)}`; ctl = null; }
      else { if (ctl) d += `Q${n2(ctl.x)} ${n2(ctl.y)} ${n2((ctl.x + q.x) / 2)} ${n2((ctl.y + q.y) / 2)}`; ctl = q; }
    }
    d += ctl ? `Q${n2(ctl.x)} ${n2(ctl.y)} ${n2(first.x)} ${n2(first.y)}Z` : 'Z';
  }
  return { d, upm, asc, desc, adv, box };
}

const code = JSON.parse(fs.readFileSync(GLYPHS, 'utf8'))[NAME];
const g = readGlyph(FONT, code);

/** The tick placed exactly where the app's text layout puts it: its line box centred on (cx, cy), `size` px per em. */
const tick = (cx, cy, size, fill = '#ffffff', extra = '') => {
  const s = size / g.upm;
  return `<path d="${g.d}" fill="${fill}" ${extra} transform="translate(${cx - (g.adv / 2) * s} ${cy + ((g.asc + g.desc) / 2) * s}) scale(${s} ${-s})"/>`;
};

const S = 1024;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GRADIENT[0]}"/><stop offset="1" stop-color="${GRADIENT[1]}"/></linearGradient></defs>
  <rect width="${S}" height="${S}" fill="url(#bg)"/>
  ${tick(S / 2, S / 2, (GLYPH / TILE) * S)}
</svg>`;

// Splash: the same white tick, alone, on a transparent square (the blue behind it comes from app.json).
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${tick(S / 2, S / 2, 0.42 * S)}</svg>`;

(async () => {
  const out = path.join(root, 'assets');
  await sharp(Buffer.from(icon)).resize(S, S).flatten({ background: GRADIENT[1] }).png().toFile(path.join(out, 'icon.png'));
  await sharp(Buffer.from(splash)).resize(S, S).png().toFile(path.join(out, 'splash.png'));
  const meta = await sharp(path.join(out, 'icon.png')).metadata();
  const w = ((g.box.xMax - g.box.xMin) / g.upm) * (GLYPH / TILE);
  console.log(`icon.png ${meta.width}x${meta.height} alpha=${meta.hasAlpha} · ${fs.statSync(path.join(out, 'icon.png')).size} bytes`);
  console.log(`glyph U+${code.toString(16).toUpperCase()} · ${g.upm} units/em · advance ${g.adv} · ascent ${g.asc} descent ${g.desc} · box ${JSON.stringify(g.box)} · tick spans ${(w * 100).toFixed(0)}% of the tile`);
  if (process.argv[2]) { // optional: also write small previews (as the home screen shows it) for a visual check
    const dir = path.resolve(process.argv[2]);
    const mask = (px) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}"><rect width="${px}" height="${px}" rx="${px * 0.2237}" fill="#fff"/></svg>`);
    for (const px of [1024, 180, 120, 60]) await sharp(path.join(out, 'icon.png')).resize(px, px).composite([{ input: mask(px), blend: 'dest-in' }]).png().toFile(path.join(dir, `icon-home-${px}.png`));
    await sharp({ create: { width: 600, height: 600, channels: 4, background: '#1F5FEE' } }).composite([{ input: await sharp(path.join(out, 'splash.png')).resize(600, 600).toBuffer() }]).png().toFile(path.join(dir, 'splash-preview.png'));
  }
})();
