#!/usr/bin/env node
/* Guards against the "dyld Symbol not found … ExpoModulesJSI … ExpoFont.framework"
   launch crash: an expo-* package from a DIFFERENT SDK gets hoisted over expo's own
   (e.g. a transitive peer like expo-symbols: "expo-font": "*"). SDK 57 ships several
   expo-* packages as prebuilt xcframeworks compiled against one exact ExpoModulesCore,
   so a mismatched major links fine but crashes instantly at launch.
   Run before every native build. Exits 1 on a mismatch. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const modDir = path.join(root, 'node_modules');

function readPkg(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(modDir, name, 'package.json'), 'utf8'));
  } catch (e) {
    return null;
  }
}

const expo = readPkg('expo');
if (!expo) {
  console.error('check-sdk: node_modules/expo not found — run npm install first.');
  process.exit(1);
}
const expoMajor = parseInt(String(expo.version).split('.')[0], 10);
console.log(`check-sdk: expo is ${expo.version} (SDK major ${expoMajor}).`);

let bad = [];
let names = [];
try {
  names = fs.readdirSync(modDir).filter((n) => n === 'expo-font' || /^expo-/.test(n));
} catch (e) {}

for (const name of names) {
  const pkg = readPkg(name);
  if (!pkg || !pkg.version) continue;
  // Only compare packages that are versioned to the SDK (57.x.y style).
  const major = parseInt(String(pkg.version).split('.')[0], 10);
  if (!Number.isNaN(major) && major >= 50 && major !== expoMajor) {
    bad.push(`${name}@${pkg.version} (major ${major} ≠ ${expoMajor})`);
  }
}

if (bad.length) {
  console.error('check-sdk: FAIL — these expo-* packages are from a different SDK:');
  bad.forEach((b) => console.error('  - ' + b));
  console.error('Pin them to the expo SDK (direct dependency + package.json "overrides").');
  process.exit(1);
}
console.log('check-sdk: OK — all expo-* packages match the SDK.');
