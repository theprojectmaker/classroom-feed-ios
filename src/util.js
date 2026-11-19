// Plain helpers (no React): wording for dates, what state a piece of work is in, grouping.
export const DAY = 86400000;
export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

// "P3 BIOLOGY H 2026-27 P3" -> "P3 BIOLOGY H": one name per class whichever route it came by.
export const niceCourse = (s) => (String(s || '').replace(/\s*20\d{2}-\d{2}.*$/, '').trim() || String(s || 'Other').trim());

export const isWork = (i) => !['material', 'announcement', 'email'].includes(i.kind);
export const kindOf = (i) => (i.kind === 'announcement' ? 'Announcements' : i.kind === 'material' || i.kind === 'email' ? 'Materials' : 'Classwork');

/**
 * Where a piece of work stands, using what Google Classroom itself says (status, grade), the turn-in this app did,
 * and your own tick: 'turnedin' | 'graded' | 'done' (ticked off on your list only) | 'late' | 'open'.
 */
export function workState(i) {
  const s = String(i.status || '').toLowerCase();
  if (/turned in|handed in/.test(s)) return 'turnedin'; // in the teacher's hands — also after a resubmit, while an older grade still shows
  if (/excused/.test(s)) return 'excused'; // your teacher let you off this one: nothing to hand in
  if (/graded|returned/.test(s) || (i.grade && !/missing/.test(s))) return 'graded';
  if (i.turnin === 'done') return 'turnedin';
  if (i.submitted) return 'done';
  if (/missing/.test(s) || (i.dueAt && i.dueAt < Date.now())) return 'late';
  return 'open';
}
export const DONE_STATES = ['turnedin', 'graded', 'excused', 'done'];
export const isDone = (i) => DONE_STATES.includes(workState(i));
export const isOpen = (i) => isWork(i) && !isDone(i);
export const STATE_LABEL = { turnedin: 'Turned in', graded: 'Graded', excused: 'Excused', done: 'Done', late: 'Missing', open: 'Assigned' };
// Kept for older call sites: 'done' | 'overdue' | 'assigned'.
export const statusOf = (i) => (isDone(i) ? 'done' : workState(i) === 'late' ? 'overdue' : 'assigned');

export function shortDue(item) {
  if (!item.dueAt) return item.due ? String(item.due).replace(/^Due\s*/i, '') : 'No due date';
  const d = new Date(item.dueAt);
  const days = Math.floor((item.dueAt - startOfToday()) / DAY);
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return 'Today, ' + t;
  if (days === 1) return 'Tomorrow, ' + t;
  if (days === -1) return 'Yesterday, ' + t;
  if (days > 1 && days < 7) return d.toLocaleDateString([], { weekday: 'long' }) + ', ' + t;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + t;
}

export function postedLabel(item) {
  const ms = item.posted_at || item.created_at;
  if (!ms) return '';
  const days = Math.floor((startOfToday() - new Date(ms).setHours(0, 0, 0, 0)) / DAY);
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  return 'Posted ' + new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** When it reached your library, e.g. "Added today, 8:12 AM". */
export function addedDetail(item) {
  const ms = item.created_at;
  if (!ms) return '';
  const days = Math.floor((startOfToday() - new Date(ms).setHours(0, 0, 0, 0)) / DAY);
  const day = days <= 0 ? 'today' : days === 1 ? 'yesterday' : new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
  return 'Added ' + day + ', ' + new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** When it was posted on Google Classroom, with the clock time whenever Classroom gave one. */
export function postedDetail(item) {
  const t = String(item.posted_text || '').trim();
  const ms = item.posted_at || item.created_at || 0;
  const clock = /^\d{1,2}:\d{2}\s?[AP]M/i.test(t);
  if (!ms && !t) return '';
  if (!clock && t && !/^(today|yesterday)/i.test(t) && !ms) return 'Posted ' + t;
  const days = Math.floor((startOfToday() - new Date(ms).setHours(0, 0, 0, 0)) / DAY);
  const day = /^yesterday/i.test(t) ? 'yesterday' : /^today/i.test(t) && !clock ? 'today' : days <= 0 ? 'today' : days === 1 ? 'yesterday' : new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const time = clock ? ', ' + new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  return 'Posted ' + day + time;
}

/** "8:30 AM", "Tomorrow, 8:00 AM", "Mon, 8:00 AM", "Nov 12, 3:10 PM". */
export function whenLabel(ms) {
  if (!ms) return '';
  const time = new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((new Date(ms).setHours(0, 0, 0, 0) - startOfToday()) / DAY);
  if (days === 0) return time;
  if (days === 1) return 'Tomorrow, ' + time;
  if (days === -1) return 'Yesterday, ' + time;
  if (days > 1 && days < 7) return new Date(ms).toLocaleDateString([], { weekday: 'short' }) + ', ' + time;
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + time;
}
export function agoLabel(ms, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  return h < 36 ? h + ' h ago' : Math.round(h / 24) + ' days ago';
}

export const BUCKETS = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Next week', 'Later', 'No due date'];
export function bucketOf(i) {
  if (!i.dueAt) return 'No due date';
  if (i.dueAt < Date.now()) return 'Overdue';
  const days = Math.floor((i.dueAt - startOfToday()) / DAY);
  return days < 0 ? 'Overdue' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 7 ? 'This week' : days < 14 ? 'Next week' : 'Later';
}

export const snippetOf = (item) => String(item.body || '').split('\n').map((x) => x.trim()).find((x) => x && !/^(LINKS|•)/.test(x)) || '';
export const isNew = (item) => (item.created_at || 0) > Date.now() - DAY;
export const hasUpdate = (item) => !!(item.change_note || item.changeNote) && (item.changed_at || 0) > Date.now() - 7 * DAY;
export const fileExt = (name = '') => { const e = (String(name).split('.').pop() || '').toLowerCase(); return e && e.length <= 5 && e !== String(name).toLowerCase() ? e : ''; };

/* ---------- grouping the way Google Classroom does ---------- */
const startOfWeek = (ms = Date.now()) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d.getTime(); }; // Sunday
export { startOfWeek };
/** For the Missing and Done lists: how long ago it was due (or posted). */
export const PAST_BUCKETS = ['This week', 'Last week', 'Earlier'];
export function pastBucketOf(i) {
  const t = i.dueAt || i.posted_at || i.created_at || 0;
  const w = startOfWeek();
  return t >= w ? 'This week' : t >= w - 7 * DAY ? 'Last week' : 'Earlier';
}
export const monthKey = (i) => { const d = new Date(i.posted_at || i.created_at || 0); return d.getFullYear() * 12 + d.getMonth(); };
export const monthLabel = (i) => new Date(i.posted_at || i.created_at || 0).toLocaleDateString([], { month: 'long', year: 'numeric' });
export const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * Classroom's own header lines sometimes come along at the top of a post's text (its topic, "•", "2 points", "|",
 * "Due …"). This takes them off and hands back the points, when there are any.
 */
export function cleanBody(body) {
  const L = String(body || '').split('\n');
  const junk = (x) => /^(•|\||Due\b.*|No due date|Ungraded|\(?Edited.*)$/i.test(x);
  const pts = (x) => /^\d+(\.\d+)? points?$/i.test(x);
  let k = L.length > 1 && L[1].trim() === '•' ? 1 : 0; // a topic line is only recognisable by the bullet after it
  let points = '';
  for (; k < L.length && k < 9; k++) {
    const x = L[k].trim();
    if (pts(x)) points = x; else if (x && !junk(x)) break;
  }
  return { text: L.slice(k).join('\n').trim(), points };
}

/** "CATHERINE LEONG (North High)" -> "Catherine Leong": a teacher's name the way you would write it. */
export const niceName = (s) => String(s || '').replace(/\s*\(.*?\)\s*$/, '').trim().toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
/** Classroom prints "Unknown User" for an account it cannot name: that is not a person to show. */
export const realName = (s) => !!String(s || '').trim() && !/^unknown user$/i.test(String(s).trim());
/** The teacher of a class: whoever posted most of what is in it. */
export function teacherOf(items) {
  const n = {};
  for (const i of items) if (realName(i.author)) n[i.author] = (n[i.author] || 0) + 1;
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return top ? niceName(top[0]) : '';
}
/** "12/15" -> { got: 12, of: 15 }; null when the grade is not a score. */
export function gradeParts(g) {
  const m = String(g || '').match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  return m && Number(m[2]) > 0 ? { got: Number(m[1]), of: Number(m[2]) } : null;
}
/** The graded work in a list, added up: points earned out of points possible (not weighted). */
export function gradeSummary(items) {
  let got = 0, of = 0, n = 0;
  for (const i of items) { const g = gradeParts(i.grade); if (g) { got += g.got; of += g.of; n++; } }
  const r = (x) => Math.round(x * 10) / 10;
  return { n, got: r(got), of: r(of), pct: of ? r((got / of) * 100) : null };
}

/** The private-comment thread as Classroom shows it ("NAME • date", then the text, repeated) -> [{who, when, text}]. */
export function parseThread(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (/^(more_vert|More options)$/.test(line.trim())) continue; // the menu button Classroom puts on your own comments
    const m = line.match(/^(.{1,70}?) • (.{1,40})$/);
    if (m) out.push({ who: m[1].trim(), when: m[2].trim(), text: '' });
    else if (out.length) out[out.length - 1].text += (out[out.length - 1].text ? '\n' : '') + line;
  }
  return out.filter((c) => c.text.trim());
}
