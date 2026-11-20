// To-do (Assigned / Missing / Done, with an "All classes" filter, as in Google Classroom), a week Calendar, and Search.
import React, { useContext, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppCtx } from '../ctx';
import { T } from '../theme';
import { AppBar, Chip, Dropdown, Empty, FileBadge, GroupHead, IconBtn, MIcon, PAST_BUCKETS, Tabs, Text, WorkRow, isDone, isNew, isOpen, isWork, kindOf, niceCourse, pastBucketOf, sameDay, startOfWeek, workState } from '../ui';
import { fmtBytes } from '../lib';

const DAY = 86400000;

/** The classes, with what is open in each (for the menu). */
export function useClasses(items) {
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
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);
}

/** Classroom's groups for work that is still to do. */
const ASSIGNED = ['No due date', 'This week', 'Next week', 'Later'];
function assignedBucket(i) {
  if (!i.dueAt) return 'No due date';
  const w0 = startOfWeek();
  return i.dueAt < w0 + 7 * DAY ? 'This week' : i.dueAt < w0 + 14 * DAY ? 'Next week' : 'Later';
}

/* ---------- To-do ---------- */
export function TodoScreen() {
  const e = useContext(AppCtx);
  const { items, openItem, refresh, refreshing, todoSeg, setTodoSeg } = e;
  const [cls, setCls] = useState('');
  const [fold, setFold] = useState({});
  const work = useMemo(() => items.filter(isWork), [items]);
  const names = useMemo(() => [...new Set(work.map((i) => i.course || 'Other'))].sort(), [work]);
  const groups = useMemo(() => {
    const list = work.filter((i) => !cls || (i.course || 'Other') === cls);
    const pinFirst = (a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0);
    if (todoSeg === 'missing') {
      const late = list.filter((i) => isOpen(i) && workState(i) === 'late').sort((a, b) => (b.dueAt || 0) - (a.dueAt || 0));
      return PAST_BUCKETS.map((b) => [b, late.filter((i) => pastBucketOf(i) === b)]).filter(([, g]) => g.length);
    }
    if (todoSeg === 'done') {
      const done = list.filter(isDone).sort((a, b) => (b.dueAt || b.posted_at || b.created_at || 0) - (a.dueAt || a.posted_at || a.created_at || 0)).slice(0, 150);
      return PAST_BUCKETS.map((b) => [b, done.filter((i) => pastBucketOf(i) === b)]).filter(([, g]) => g.length);
    }
    const open = list.filter((i) => isOpen(i) && workState(i) !== 'late');
    return ASSIGNED.map((b) => [b, open.filter((i) => assignedBucket(i) === b).sort((a, c) => pinFirst(a, c) || (a.dueAt || 9e15) - (c.dueAt || 9e15))]).filter(([, g]) => g.length);
  }, [work, todoSeg, cls]);
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <AppBar brand crumb="To-do" onMenu={e.openDrawer} right={<IconBtn mi="plus" onPress={e.openAdd} color={T.sub} />} />
      <Tabs options={[['todo', 'Assigned'], ['missing', 'Missing'], ['done', 'Done']]} value={todoSeg} onChange={setTodoSeg} />
      <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.faint} />}>
        <View style={s.wrap}>
          <Dropdown value={cls} onChange={setCls} style={{ width: '100%', maxWidth: 340 }} options={[['', 'All classes'], ...names.map((n) => [n, niceCourse(n)])]} />
          {groups.length === 0 && (
            <Empty icon={todoSeg === 'done' ? 'file-tray-outline' : 'checkmark-done'} title={todoSeg === 'todo' ? 'No work assigned' : todoSeg === 'missing' ? 'Nothing missing' : 'Nothing done yet'}
              text={todoSeg === 'todo' ? 'You’re all caught up.' : todoSeg === 'missing' ? 'Nice — nothing is overdue.' : 'Work you turn in shows up here.'} />
          )}
          {groups.map(([title, g]) => {
            const key = todoSeg + title;
            return (
              <View key={key} style={{ marginTop: 12 }}>
                <GroupHead title={title} count={g.length} open={!fold[key]} onToggle={() => setFold((f) => ({ ...f, [key]: !f[key] }))} />
                {!fold[key] && g.map((i, k) => <WorkRow key={i.id} item={i} showCourse={!cls} last={k === g.length - 1} onPress={() => openItem(i.id)} onLongPress={() => e.togglePin(i)} />)}
                <View style={s.rule} />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/* ---------- Calendar ---------- */
export function CalendarScreen() {
  const e = useContext(AppCtx);
  const { items, openItem, refresh, refreshing } = e;
  const [week, setWeek] = useState(0); // 0 = this week
  const start = startOfWeek() + week * 7 * DAY;
  const days = useMemo(() => {
    const work = items.filter((i) => isWork(i) && i.dueAt);
    return Array.from({ length: 7 }, (_, k) => {
      const t = new Date(start); t.setDate(t.getDate() + k);
      return { t: t.getTime(), list: work.filter((i) => sameDay(i.dueAt, t)).sort((a, b) => a.dueAt - b.dueAt) };
    });
  }, [items, start]);
  const total = days.reduce((n, d) => n + d.list.length, 0);
  const label = (ms, o) => new Date(ms).toLocaleDateString([], o);
  const range = `${label(start, { month: 'short', day: 'numeric' })} – ${label(start + 6 * DAY, { month: 'short', day: 'numeric' })}`;
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <AppBar brand crumb="Calendar" onMenu={e.openDrawer} />
      <View style={s.weekBar}>
        <IconBtn mi="chevron-left" onPress={() => setWeek(week - 1)} color={T.sub} />
        <Pressable onPress={() => setWeek(0)} style={({ pressed }) => [s.weekMid, pressed && { opacity: 0.5 }]}>
          <Text style={s.weekTxt}>{range}</Text>
          <Text style={s.weekSub}>{week === 0 ? 'This week' : week === 1 ? 'Next week' : week === -1 ? 'Last week' : 'Tap for this week'} · {total ? `${total} due` : 'nothing due'}</Text>
        </Pressable>
        <IconBtn mi="chevron-right" onPress={() => setWeek(week + 1)} color={T.sub} />
      </View>
      <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.faint} />}>
        <View style={s.wrap}>
          {days.map((d) => {
            const today = sameDay(d.t, Date.now());
            return (
              <View key={d.t} style={s.day}>
                <View style={s.dayHead}>
                  <View style={[s.dayNum, today && { backgroundColor: T.brand }]}><Text style={[s.dayNumTxt, today && { color: '#fff' }]}>{new Date(d.t).getDate()}</Text></View>
                  <Text style={[s.dayName, today && { color: T.brand }]}>{label(d.t, { weekday: 'long' })}{today ? ' · Today' : ''}</Text>
                </View>
                {d.list.length === 0 ? <Text style={s.dayNone}>Nothing due</Text>
                  : d.list.map((i, k) => <WorkRow key={i.id} item={i} showCourse last={k === d.list.length - 1} onPress={() => openItem(i.id)} onLongPress={() => e.togglePin(i)} />)}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/* ---------- Search ---------- */
const KINDS = ['All', 'Classwork', 'Materials', 'Announcements', 'Files'];
export function FindScreen() {
  const { items, openItem, openPreview, pop } = useContext(AppCtx);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('All');
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = useMemo(() => {
    const hay = (i) => `${i.title} ${i.course} ${i.body} ${i.notes || ''} ${(i.files || []).map((f) => f.name).join(' ')}`.toLowerCase();
    return items.filter((i) => (kind === 'All' || (kind === 'Files' ? (i.files || []).length > 0 : kindOf(i) === kind)) && toks.every((t) => hay(i).includes(t))).slice(0, 200);
  }, [items, q, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const fileRows = useMemo(() => (kind !== 'Files' ? [] : list.flatMap((i) => (i.files || []).filter((f) => !toks.length || toks.every((t) => (f.name + ' ' + i.title + ' ' + i.course).toLowerCase().includes(t))).map((f) => ({ f, i })))), [list, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <AppBar onBack={pop} title="Search" />
      <View style={s.searchWrap}>
        <MIcon n="magnify" s={22} c={T.sub} />
        <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Titles, instructions, file names, your notes" placeholderTextColor={T.faint} style={s.search} autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
        {!!q && <Pressable onPress={() => setQ('')} hitSlop={10}><MIcon n="close" s={20} c={T.sub} /></Pressable>}
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
          {KINDS.map((k) => <Chip key={k} label={k === 'Announcements' ? 'Posts' : k} on={kind === k} onPress={() => setKind(k)} />)}
        </ScrollView>
      </View>
      {kind === 'Files' ? (
        <FlatList data={fileRows} keyExtractor={(r) => r.f.id} keyboardShouldPersistTaps="handled" contentContainerStyle={s.listPad}
          ListEmptyComponent={<Empty icon="document-outline" title="No files match" />}
          renderItem={({ item: r }) => (
            <Pressable onPress={() => openPreview(r.f, r.i.files)} style={({ pressed }) => [s.fileRow, pressed && { backgroundColor: T.tonal }]}>
              <FileBadge name={r.f.name} />
              <View style={{ flex: 1 }}>
                <Text style={s.fileName} numberOfLines={2}>{r.f.name}</Text>
                <Text style={s.fileSub} numberOfLines={1}>{niceCourse(r.i.course)} · {r.i.title}</Text>
              </View>
              <Text style={s.fileSub}>{fmtBytes(r.f.size)}</Text>
            </Pressable>
          )} />
      ) : (
        <FlatList data={list} keyExtractor={(i) => i.id} keyboardShouldPersistTaps="handled" contentContainerStyle={s.listPad}
          ListEmptyComponent={<Empty icon="search-outline" title={q ? 'No matches' : 'Nothing here yet'} text={q ? 'Try fewer words.' : ''} />}
          renderItem={({ item }) => <WorkRow item={item} showCourse last onPress={() => openItem(item.id)} />} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },
  wrap: { width: '100%', maxWidth: 960, alignSelf: 'center' },
  rule: { height: 1, backgroundColor: T.line },
  weekBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: T.line },
  weekMid: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  weekTxt: { fontSize: 16, fontWeight: '500', color: T.ink },
  weekSub: { fontSize: 12, color: T.sub, marginTop: 1 },
  day: { marginBottom: 14 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4, paddingVertical: 4 },
  dayNum: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: T.tonal },
  dayNumTxt: { fontSize: 15, fontWeight: '500', color: T.ink },
  dayName: { fontSize: 16, fontWeight: '500', color: T.ink },
  dayNone: { fontSize: 14, color: T.faint, paddingLeft: 44, paddingBottom: 6 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 16, height: 48, borderRadius: 24, backgroundColor: T.tonal2 },
  search: { flex: 1, fontSize: 16, color: T.ink, fontFamily: 'GoogleSans_400Regular', outlineStyle: 'none' },
  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  listPad: { paddingHorizontal: 16, paddingBottom: 120 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  fileName: { fontSize: 15, color: T.ink },
  fileSub: { fontSize: 12, color: T.sub, marginTop: 2 },
});
