import { Platform } from 'react-native';
import { zipSync, strToU8 } from 'fflate';
import { parseZip } from './zipparse';
import { resolveLocal } from './files';

const FS = () => require('expo-file-system/legacy');
const toBytes = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const toB64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const safe = (s) => String(s).replace(/[^\w.\- ]+/g, '_').slice(0, 80);

/** Reads a zip (from Messages' share sheet or the file picker), saves its files inside the app, returns library items. */
export async function importZipFile(uri) {
  if (Platform.OS === 'web') throw new Error('Zip import needs the installed app');
  const fs = FS();
  const b64 = await fs.readAsStringAsync(uri, { encoding: 'base64' });
  const { items, more } = parseZip(toBytes(b64));
  const out = [];
  out.more = more || 0; // the bot says how many more items are waiting for the next text
  for (const it of items) {
    const dir = fs.documentDirectory + 'attachments/' + safe(it.id) + '/';
    await fs.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const files = [];
    for (const f of it.fileData) {
      const path = dir + safe(f.name);
      await fs.writeAsStringAsync(path, toB64(f.bytes), { encoding: 'base64' });
      files.push({ id: 'local-' + it.id + '-' + safe(f.name), name: f.name, size: f.bytes.length, local: path });
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
