// Pure zip -> library items (no React Native imports, so it is unit-testable in Node).
import { unzipSync, strFromU8 } from 'fflate';

const norm = (p) => p.replace(/\\/g, '/');

/** Returns { items: [{...libraryItem, fileData:[{name, bytes}]}] }. Handles the bot's manifest.json zips
 *  (version 2) and falls back to the "Class/Assignment/files" folder layout for any other zip. */
export function parseZip(bytes) {
  const entries = unzipSync(bytes);
  const names = Object.keys(entries).map(norm).filter((n) => !n.endsWith('/') && !n.startsWith('__MACOSX/'));
  const byName = Object.fromEntries(Object.keys(entries).map((k) => [norm(k), entries[k]]));
  const mName = names.find((n) => n === 'manifest.json' || n.endsWith('/manifest.json'));
  const now = Date.now();

  if (mName) {
    const m = JSON.parse(strFromU8(byName[mName]));
    const prefix = mName.slice(0, mName.length - 'manifest.json'.length);
    return {
      items: (m.items || []).map((it) => ({
        id: it.id || 'zip-' + now + '-' + Math.random().toString(36).slice(2, 8),
        kind: it.type || 'assignment',
        course: it.course || 'Other',
        title: it.title || 'Untitled',
        due: it.due || '',
        dueAt: it.dueAt || 0,
        posted_at: it.postedAt || now,
        posted_text: it.postedText || '',
        created_at: now,
        body: it.body || '',
        url: it.url || '',
        files: [],
        fileData: (it.files || []).map((f) => ({ name: f.name, bytes: byName[prefix + f.path] })).filter((f) => f.bytes),
      })),
    };
  }

  // Fallback: Class/Assignment/<files> (first two folders = class + title).
  const groups = new Map();
  for (const n of names) {
    const parts = n.split('/');
    if (parts.length < 3) continue;
    const key = parts[0] + '/' + parts[1];
    if (!groups.has(key)) groups.set(key, { course: parts[0], title: parts[1], files: [], details: null });
    const g = groups.get(key);
    const file = parts.slice(2).join('/');
    if (/^(details|instructions)\.txt$/i.test(file)) g.details = strFromU8(byName[n]);
    else g.files.push({ name: file, bytes: byName[n] });
  }
  return {
    items: [...groups.values()].map((g) => ({
      id: 'zip-' + g.course + '-' + g.title,
      kind: 'assignment', course: g.course, title: g.title, due: '', dueAt: 0, posted_at: now, created_at: now,
      body: g.details || '', url: '', files: [], fileData: g.files,
    })),
  };
}
