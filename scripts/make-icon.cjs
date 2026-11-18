#!/usr/bin/env node
/* Draws the app icon + splash art as SVG and renders them to PNG.
   Dev tool only (not a dependency): uses the copy of `sharp` that lives in ../remote-control.
   Run: node scripts/make-icon.cjs */
const path = require('path');
const fs = require('fs');
const sharp = require(path.resolve(__dirname, '..', '..', 'remote-control', 'node_modules', 'sharp'));

// The mark: a small stack of class cards (the "feed") with the top one ticked off.
const mark = (shadow = true) => `
  <g ${shadow ? 'filter="url(#soft)"' : ''}>
    <g transform="rotate(11 512 560)"><rect x="286" y="232" width="452" height="590" rx="70" fill="#ffffff" fill-opacity="0.26"/></g>
    <g transform="rotate(3 512 560)"><rect x="286" y="232" width="452" height="590" rx="70" fill="#ffffff" fill-opacity="0.5"/></g>
  </g>
  <g ${shadow ? 'filter="url(#deep)"' : ''} transform="rotate(-6 512 560)">
    <rect x="278" y="226" width="468" height="604" rx="72" fill="url(#paper)"/>
    <rect x="278" y="226" width="468" height="150" rx="72" fill="url(#band)"/>
    <rect x="278" y="306" width="468" height="70" fill="url(#band)"/>
    <circle cx="352" cy="301" r="26" fill="#ffffff" fill-opacity="0.95"/>
    <rect x="398" y="282" width="210" height="38" rx="19" fill="#ffffff" fill-opacity="0.95"/>
    <rect x="336" y="436" width="352" height="34" rx="17" fill="#C9D8F8"/>
    <rect x="336" y="506" width="352" height="34" rx="17" fill="#C9D8F8"/>
    <rect x="336" y="576" width="226" height="34" rx="17" fill="#C9D8F8"/>
  </g>
  <g ${shadow ? 'filter="url(#deep)"' : ''}>
    <circle cx="704" cy="728" r="148" fill="url(#ok)"/>
    <circle cx="704" cy="728" r="148" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="6"/>
    <path d="M634 732 L686 784 L782 676" fill="none" stroke="#ffffff" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;

const defs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3D8BFF"/><stop offset="0.5" stop-color="#1F5FEE"/><stop offset="1" stop-color="#112F9C"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.24" cy="0.14" r="0.95">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/><stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#E9F0FF"/></linearGradient>
    <linearGradient id="band" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1B9E5A"/><stop offset="1" stop-color="#12B886"/></linearGradient>
    <linearGradient id="ok" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34D27B"/><stop offset="1" stop-color="#0EA65A"/></linearGradient>
    <filter id="deep" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="26" stdDeviation="28" flood-color="#04174F" flood-opacity="0.42"/></filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#04174F" flood-opacity="0.22"/></filter>
  </defs>`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${defs}
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
  <circle cx="900" cy="980" r="330" fill="#ffffff" fill-opacity="0.05"/>
  <circle cx="110" cy="80" r="210" fill="#ffffff" fill-opacity="0.05"/>
  ${mark(true)}
</svg>`;

// Splash: just the mark on a transparent square (the splash background colour comes from app.json).
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${defs}${mark(true)}</svg>`;

(async () => {
  const out = path.resolve(__dirname, '..', 'assets');
  await sharp(Buffer.from(icon)).resize(1024, 1024).flatten({ background: '#1F5FEE' }).png().toFile(path.join(out, 'icon.png'));
  await sharp(Buffer.from(splash)).resize(1024, 1024).png().toFile(path.join(out, 'splash.png'));
  const meta = await sharp(path.join(out, 'icon.png')).metadata();
  console.log(`icon.png ${meta.width}x${meta.height} alpha=${meta.hasAlpha} · ${fs.statSync(path.join(out, 'icon.png')).size} bytes`);
})();
