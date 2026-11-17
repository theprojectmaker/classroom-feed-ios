import { Platform } from 'react-native';
import { zipSync, strToU8 } from 'fflate';
import { parseZip, openZip } from './zipparse';
import { resolveLocal } from './files';

const FS = () => require('expo-file-system/legacy');
const toBytes = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const toB64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const safe = (s) => String(s).replace(/[^\w.\- ]+/g, '_').slice(0, 80);

/** Reads a zip (from Messages' share sheet or the file picker), saves its files inside the app, returns library items. */
/** Reads the zip's raw bytes. Catch-up zips are ~40 MB, so go straight to bytes (the old base64 route made 3+ copies as
 *  huge strings and ran the iPad out of memory); fall back to base64 only if the byte API is unavailable. */
async function readZipBytes(uri) {
  const errs = [];
  try {
    const { File } = require('expo-file-system');
    return await new File(uri).bytes();
  } catch (e) { errs.push('bytes: ' + (e && e.message || e)); }
  try {
    const fs = FS();
    const tmp = fs.cacheDirectory + 'incoming-' + Date.now() + '.zip';
    await fs.copyAsync({ from: uri, to: tmp }); // a copy inside the app's own cache is always readable
    const b64 = await fs.readAsStringAsync(tmp, { encoding: 'base64' });
    fs.deleteAsync(tmp, { idempotent: true }).catch(() => {});
    return toBytes(b64);
  } catch (e) { errs.push('copy: ' + (e && e.message || e)); }
  try { return toBytes(await FS().readAsStringAsync(uri, { encoding: 'base64' })); }
  catch (e) { errs.push('read: ' + (e && e.message || e)); }
  throw new Error('open failed (' + errs.join(' | ').slice(0, 220) + ')');
}

async function writeBytes(path, bytes) {
  try {
    const { File } = require('expo-file-system');
    new File(path).write(bytes); // raw bytes, no base64 string
    return;
  } catch {}
  await FS().writeAsStringAsync(path, toB64(bytes), { encoding: 'base64' });
}

export async function importZipFile(uri) {
  if (Platform.OS === 'web') throw new Error('Zip import needs the installed app');
  const fs = FS();
  const raw = await readZipBytes(uri);
  const out = [];
  out.failed = 0;
  let z = null;
  try { z = openZip(raw); } catch (e) { throw new Error('bad zip (' + (e && e.message || e) + ')'); }
  if (z) {
    out.more = z.more || 0; // the bot says how many more items are waiting for the next text
    for (const it of z.items) {
      const dir = fs.documentDirectory + 'attachments/' + safe(it.id) + '/';
      await fs.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      const files = [];
      for (const f of it.fileRefs) {
        try {
          const bytes = z.read(f.path);
          if (!bytes) { out.failed++; continue; }
          const path = dir + safe(f.name).replace(/ +/g, '_');
          await writeBytes(path, bytes);
          files.push({ id: 'local-' + it.id + '-' + safe(f.name), name: f.name, size: bytes.length, local: path });
        } catch { out.failed++; } // one bad file never sinks the rest of the zip
      }
      const { fileRefs, ...rest } = it;
      out.push({ ...rest, files });
    }
    return out;
  }
  let parsed;
  try { parsed = parseZip(raw); } catch (e) { throw new Error('bad zip (' + (e && e.message || e) + ')'); }
  const { items, more } = parsed;
  out.more = more || 0;
  for (const it of items) {
    const dir = fs.documentDirectory + 'attachments/' + safe(it.id) + '/';
    await fs.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const files = [];
    for (const f of it.fileData) {
      try {
        const path = dir + safe(f.name).replace(/ +/g, '_');
        await writeBytes(path, f.bytes);
        files.push({ id: 'local-' + it.id + '-' + safe(f.name), name: f.name, size: f.bytes.length, local: path });
      } catch { out.failed++; }
    }
    const { fileData, ...rest } = it;
    out.push({ ...rest, files });
  }
  return out;
}

/** Packs the whole library into the same zip format (manifest.json v2) so another device can open it. */
export async function exportLibraryZip(items) {
  const fs = FS();
  const entries = {};
  const manifest = [];
  for (const it of items) {
    const dir = safe(it.course || 'Other') + '/' + safe(it.title);
    const mf = [];
    for (const f of it.files || []) {
      if (!f.local) continue;
      try {
        const b64 = await fs.readAsStringAsync(resolveLocal(f.local),{ encoding: 'base64' });
        entries[dir + '/' + safe(f.name)] = [toBytes(b64), { level: 0 }];
        mf.push({ name: f.name, path: dir + '/' + safe(f.name), size: f.size || 0, mime: '' });
      } catch {}
    }
    manifest.push({ id: it.id, type: it.kind || 'assignment', course: it.course, title: it.title, due: it.due || '', dueAt: it.dueAt || 0, postedAt: it.posted_at || it.created_at || 0, body: it.body || '', url: it.url || '', files: mf });
  }
  entries['manifest.json'] = strToU8(JSON.stringify({ version: 2, generated: Date.now(), items: manifest }));
  const zipped = zipSync(entries);
  const dest = fs.cacheDirectory + 'Classroom Feed library.zip';
  await fs.writeAsStringAsync(dest, toB64(zipped), { encoding: 'base64' });
  return dest;
}
