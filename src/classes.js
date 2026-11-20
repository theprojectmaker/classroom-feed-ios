// The classes as a list: in the order Classroom's own menu shows them (what the PC read off it; any class it does not list comes after,
// alphabetically), with what is open in each. Also: a class's section line and the line under its name in the top bar.
import { useContext, useMemo } from 'react';
import { AppCtx } from './ctx';
import { classMeta, classMetaList } from './theme';
import { isNew, isOpen, niceName, realName, teacherOf, workState } from './util';

const rank = (name) => { const m = classMeta(name); return m ? m.k : 1e6; };
export const byClassroomOrder = (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);

/** "P3", "Period 9", "Mr. Cisario": the line Classroom prints under a class's name ('' when the class has none). */
export const classSection = (name) => { const m = classMeta(name); return m ? m.sec : ''; };

export function useClassList(items) {
  const { remote } = useContext(AppCtx);
  const meta = remote && remote.classes;
  return useMemo(() => {
    const m = new Map();
    items.forEach((i) => {
      const k = i.course || 'Other';
      const c = m.get(k) || { name: k, todo: 0, count: 0, fresh: 0, late: 0 };
      c.count++;
      if (isNew(i)) c.fresh++;
      if (isOpen(i)) { c.todo++; if (workState(i) === 'late') c.late++; }
      m.set(k, c);
    });
    for (const c of classMetaList()) if (!m.has(c.name)) m.set(c.name, { name: c.name, todo: 0, count: 0, fresh: 0, late: 0 }); // a class with no posts yet still has its place
    return [...m.values()].sort(byClassroomOrder);
  }, [items, meta]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The teacher of a class: the People page's first name when the PC has read it, else whoever posted most. */
export function teacherName(remote, items, name) {
  const mine = items.filter((i) => (i.course || 'Other') === name);
  const u = (mine.find((i) => i.url) || {}).url || '';
  const cid = (u.match(/\/c\/([^/]+)/) || [])[1] || '';
  const roster = remote && remote.people && cid && remote.people[cid];
  if (roster && roster.t && roster.t.length) return niceName(roster.t[0]);
  const t = teacherOf(mine);
  return realName(t) ? t : '';
}

/** What goes under a class's name in the top bar: "P3 · Catherine Leong". */
export const classLine = (remote, items, name) => [classSection(name), teacherName(remote, items, name)].filter(Boolean).join(' · ');
