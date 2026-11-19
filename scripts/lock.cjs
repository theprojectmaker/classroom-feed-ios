#!/usr/bin/env node
/* Locks / unlocks the built .ipa while it sits in GitHub's artifact storage.
   This repository is public, so anyone signed in to GitHub could download a plain artifact — and the TestFlight build
   carries the app's private iCloud connection details. The key is the ARTIFACT_KEY repository secret.
     node scripts/lock.cjs enc <in> <out>
     node scripts/lock.cjs dec <in> <out>                                                                        */
const crypto = require('crypto');
const fs = require('fs');

const [mode, src, dst] = process.argv.slice(2);
const pass = process.env.ARTIFACT_KEY || '';
if (!['enc', 'dec'].includes(mode) || !src || !dst) { console.error('usage: lock.cjs enc|dec <in> <out>'); process.exit(2); }
if (pass.length < 16) { console.error('ARTIFACT_KEY is missing or too short'); process.exit(2); }
const key = crypto.createHash('sha256').update(pass).digest();

if (mode === 'enc') {
  const iv = crypto.randomBytes(16);
  const out = fs.createWriteStream(dst);
  out.write(iv);
  fs.createReadStream(src).pipe(crypto.createCipheriv('aes-256-ctr', key, iv)).pipe(out)
    .on('finish', () => console.log(`locked ${fs.statSync(dst).size} bytes`))
    .on('error', (e) => { console.error(e.message); process.exit(1); });
} else {
  const fd = fs.openSync(src, 'r');
  const iv = Buffer.alloc(16);
  fs.readSync(fd, iv, 0, 16, 0);
  fs.closeSync(fd);
  fs.createReadStream(src, { start: 16 }).pipe(crypto.createDecipheriv('aes-256-ctr', key, iv)).pipe(fs.createWriteStream(dst))
    .on('finish', () => {
      const head = Buffer.alloc(2); const f = fs.openSync(dst, 'r'); fs.readSync(f, head, 0, 2, 0); fs.closeSync(f);
      if (head.toString('latin1') !== 'PK') { console.error('unlock failed: the result is not an .ipa (wrong key?)'); process.exit(1); }
      console.log(`unlocked ${fs.statSync(dst).size} bytes`);
    })
    .on('error', (e) => { console.error(e.message); process.exit(1); });
}
