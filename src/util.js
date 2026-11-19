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
  if (/graded|returned/.test(s) || (i.grade && !/missing/.test(s))) return 'graded';
  if (i.turnin === 'done' || /turned in|handed in/.test(s)) return 'turnedin';
  if (i.submitted) return 'done';
  if (/missing/.test(s) || (i.dueAt && i.dueAt < Date.now())) return 'late';
  return 'open';
}
export const isDone = (i) => ['turnedin', 'graded', 'done'].includes(workState(i));
export const isOpen = (i) => isWork(i) && !isDone(i);
export const STATE_LABEL = { turnedin: 'Turned in', graded: 'Graded', done: 'Done', late: 'Missing', open: 'Assigned' };
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
