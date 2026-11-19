// To-do (Assigned / Missing / Done, like Google Classroom), Calendar (what is due each day of a week), and Search.
import React, { useContext, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppCtx } from '../ctx';
import { T, classPair } from '../theme';
import { BUCKETS, Card, Chip, Empty, FileBadge, GroupLabel, Header, Icon, IconBtn, LargeTitle, PAST_BUCKETS, Seg, WorkRow, bucketOf, isDone, isNew, isOpen, isWork, kindOf, pastBucketOf, sameDay, startOfWeek, workState } from '../ui';
import { fmtBytes } from '../lib';

const DAY = 86400000;

/** The classes, with what is open in each (for the sidebar). */
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

/* ---------- To-do ---------- */
export function TodoScreen() {
  const e = useContext(AppCtx);
  const { items, openItem, refresh, refreshing, todoSeg, setTodoSeg, openAdd } = e;
  const [cls, setCls] = useState('');
  const work = useMemo(() => items.filter(isWork), [items]);
  const names = useMemo(() => [...new Set(work.map((i) => i.course || 'Other'))].sort(), [work]);
  const counts = useMemo(() => ({ todo: work.filter((i) => isOpen(i) && workState(i) !== 'late').length, missing: work.filter((i) => isOpen(i) && workState(i) === 'late').length }), [work]);
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
    return BUCKETS.map((b) => [b, open.filter((i) => bucketOf(i) === b).sort((a, c) => pinFirst(a, c) || (a.dueAt || 9e15) - (c.dueAt || 9e15))]).filter(([, g]) => g.length);
  }, [work, todoSeg, cls]);
  return (
    <View style={{ flex: 1 }}>
      <LargeTitle title="To-do" right={<View style={{ paddingBottom: 6 }}><IconBtn icon="add" onPress={openAdd} /></View>} />
      <View style={s.pad}><Seg value={todoSeg} onChange={setTodoSeg} options={[['todo', 'Assigned', counts.todo], ['missing', 'Missing', counts.missing], ['done', 'Done']]} /></View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          <Chip label="All classes" on={!cls} onPress={() => setCls('')} />
          {names.map((n) => <Chip key={n} label={n} on={cls === n} color={classPair(n)[0]} onPress={() => setCls(cls === n ? '' : n)} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.faint} />}>
        <View style={s.wrap}>
          {groups.length === 0 && (
            <Empty icon={todoSeg === 'done' ? 'file-tray-outline' : 'checkmark-done'} title={todoSeg === 'todo' ? 'No work assigned' : todoSeg === 'missing' ? 'Nothing missing' : 'Nothing done yet'}
              text={todoSeg === 'todo' ? 'You’re all caught up.' : todoSeg === 'missing' ? 'Nice — nothing is overdue.' : 'Work you turn in shows up here.'} />
          )}
          {groups.map(([title, g]) => (
            <View key={title} style={{ marginBottom: 20 }}>
              <GroupLabel title={title} count={g.length} tone={todoSeg === 'missing' ? 'red' : undefined} />
              <Card>{g.map((i, k) => <WorkRow key={i.id} item={i} showCourse={!cls} last={k === g.length - 1} onPress={() => openItem(i.id)} onLongPress={() => e.togglePin(i)} />)}</Card>
            </View>
          ))}
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
    <View style={{ flex: 1 }}>
      <LargeTitle title="Calendar" subtitle={week === 0 ? 'This week' : week === 1 ? 'Next week' : week === -1 ? 'Last week' : range} />
      <View style={[s.pad, s.weekBar]}>
        <IconBtn icon="chevron-back" onPress={() => setWeek(week - 1)} bg="#fff" />
        <Pressable onPress={() => setWeek(0)} style={({ pressed }) => [s.weekMid, pressed && { opacity: 0.5 }]}>
          <Text style={s.weekTxt}>{range}</Text>
          <Text style={s.weekSub}>{total ? `${total} due` : 'Nothing due'}{week !== 0 ? ' · tap for this week' : ''}</Text>
        </Pressable>
        <IconBtn icon="chevron-forward" onPress={() => setWeek(week + 1)} bg="#fff" />
      </View>
      <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.faint} />}>
        <View style={s.wrap}>
          {days.map((d) => {
            const today = sameDay(d.t, Date.now());
            return (
              <View key={d.t} style={s.day}>
                <View style={s.dayHead}>
                  <View style={[s.dayNum, today && { backgroundColor: T.redFill }]}><Text style={[s.dayNumTxt, today && { color: '#fff' }]}>{new Date(d.t).getDate()}</Text></View>
                  <Text style={[s.dayName, today && { color: T.red }]}>{label(d.t, { weekday: 'long' })}{today ? ' · Today' : ''}</Text>
                </View>
                {d.list.length === 0 ? <Text style={s.dayNone}>Nothing due</Text>
                  : <Card>{d.list.map((i, k) => <WorkRow key={i.id} item={i} showCourse last={k === d.list.length - 1} onPress={() => openItem(i.id)} onLongPress={() => e.togglePin(i)} />)}</Card>}
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
    <View style={{ flex: 1 }}>
      <Header title="Search" onBack={pop} backLabel="Back" />
      <View style={s.searchWrap}>
        <Icon n="search" s={18} c={T.faint} />
        <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Titles, instructions, file names, your notes" placeholderTextColor={T.faint} style={s.search} autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
        {!!q && <Pressable onPress={() => setQ('')} hitSlop={10}><Icon n="close-circle" s={18} c={T.faint} /></Pressable>}
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
          {KINDS.map((k) => <Chip key={k} label={k === 'Announcements' ? 'Posts' : k} on={kind === k} onPress={() => setKind(k)} />)}
        </ScrollView>
      </View>
      {kind === 'Files' ? (
        <FlatList data={fileRows} keyExtractor={(r) => r.f.id} keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}
          ListEmptyComponent={<Empty icon="document-outline" title="No files match" />}
          renderItem={({ item: r }) => (
            <Pressable onPress={() => openPreview(r.f, r.i.files)} style={({ pressed }) => [s.fileRow, pressed && { opacity: 0.6 }]}>
              <FileBadge name={r.f.name} />
              <View style={{ flex: 1 }}>
                <Text style={s.fileName} numberOfLines={2}>{r.f.name}</Text>
                <Text style={s.fileSub} numberOfLines={1}>{r.i.course} · {r.i.title}</Text>
              </View>
              <Text style={s.fileSub}>{fmtBytes(r.f.size)}</Text>
            </Pressable>
          )} />
      ) : (
        <FlatList data={list} keyExtractor={(i) => i.id} keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}
          ListEmptyComponent={<Empty icon="search-outline" title={q ? 'No matches' : 'Nothing here yet'} text={q ? 'Try fewer words.' : ''} />}
          renderItem={({ item }) => <View style={s.findRow}><WorkRow item={item} showCourse last onPress={() => openItem(item.id)} /></View>} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  wrap: { width: '100%', maxWidth: 820, alignSelf: 'center' },
  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  weekBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 6 },
  weekMid: { flex: 1, alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 7 },
  weekTxt: { fontSize: 16, fontWeight: '600', color: T.ink, letterSpacing: -0.2 },
  weekSub: { fontSize: 12.5, color: T.sub, marginTop: 1 },
  day: { marginBottom: 16 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8, paddingHorizontal: 4 },
  dayNum: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  dayNumTxt: { fontSize: 15, fontWeight: '600', color: T.ink },
  dayName: { fontSize: 16, fontWeight: '600', color: T.ink, letterSpacing: -0.2 },
  dayNone: { fontSize: 14.5, color: T.faint, paddingHorizontal: 43, marginTop: -4 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 10, height: 38, borderRadius: 10, backgroundColor: T.fill },
  search: { flex: 1, fontSize: 17, color: T.ink, outlineStyle: 'none' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#fff', borderRadius: T.radius, marginBottom: 10 },
  fileName: { fontSize: 15.5, color: T.ink, fontWeight: '500' },
  fileSub: { fontSize: 13, color: T.sub, marginTop: 2 },
  findRow: { backgroundColor: '#fff', borderRadius: T.radius, marginBottom: 10, overflow: 'hidden' },
});
