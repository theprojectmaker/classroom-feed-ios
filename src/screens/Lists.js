// The list screens: To-do, Classes, one class, Find.
import React, { useContext, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { AppCtx } from '../ctx';
import { T, WIDE, classPair, shadowSm } from '../theme';
import { BUCKETS, Card, Chip, Empty, FileBadge, Header, Icon, LargeTitle, LinearGradient, Pill, Seg, WorkRow, bucketOf, isDone, isNew, isOpen, isWork, kindOf, shortDue, workState } from '../ui';
import { fmtBytes } from '../lib';

const SIDEBAR = 264;
const useContentWidth = () => { const { width } = useWindowDimensions(); return width >= WIDE ? width - SIDEBAR : width; };

/* ---------- To-do ---------- */
export function TodoScreen() {
  const { items, openItem, refresh, refreshing, todoSeg, setTodoSeg, openAdd } = useContext(AppCtx);
  const [cls, setCls] = useState('');
  const work = useMemo(() => items.filter(isWork), [items]);
  const names = useMemo(() => [...new Set(work.map((i) => i.course || 'Other'))].sort(), [work]);
  const counts = useMemo(() => ({ todo: work.filter((i) => isOpen(i) && workState(i) !== 'late').length, missing: work.filter((i) => workState(i) === 'late').length }), [work]);
  const groups = useMemo(() => {
    const list = work.filter((i) => !cls || (i.course || 'Other') === cls);
    if (todoSeg === 'missing') { const g = list.filter((i) => workState(i) === 'late').sort((a, b) => (b.dueAt || 0) - (a.dueAt || 0)); return g.length ? [['Missing or overdue', g]] : []; }
    if (todoSeg === 'done') { const g = list.filter(isDone).sort((a, b) => (b.posted_at || b.created_at || 0) - (a.posted_at || a.created_at || 0)).slice(0, 120); return g.length ? [['Done', g]] : []; }
    const open = list.filter((i) => isOpen(i) && workState(i) !== 'late');
    return BUCKETS.map((b) => [b, open.filter((i) => bucketOf(i) === b).sort((a, c) => (a.dueAt || 9e15) - (c.dueAt || 9e15))]).filter(([, g]) => g.length);
  }, [work, todoSeg, cls]);
  return (
    <View style={{ flex: 1 }}>
      <LargeTitle title="To-do" right={<Pressable onPress={openAdd} hitSlop={10} style={s.roundBtn}><Icon n="add" s={24} c={T.brand} /></Pressable>} />
      <View style={{ paddingHorizontal: 16 }}>
        <Seg value={todoSeg} onChange={setTodoSeg} options={[['todo', 'To do', counts.todo], ['missing', 'Missing', counts.missing], ['done', 'Done']]} />
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          <Chip label="All classes" on={!cls} onPress={() => setCls('')} />
          {names.map((n) => <Chip key={n} label={n} on={cls === n} color={classPair(n)[0]} onPress={() => setCls(cls === n ? '' : n)} />)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.brand} />}>
        {groups.length === 0 && (
          <Empty icon={todoSeg === 'done' ? 'file-tray-outline' : 'checkmark-done'} title={todoSeg === 'todo' ? 'Nothing to do' : todoSeg === 'missing' ? 'Nothing missing' : 'Nothing done yet'}
            text={todoSeg === 'todo' ? 'You’re all caught up.' : todoSeg === 'missing' ? 'Nice — nothing is overdue.' : 'Work you turn in shows up here.'} />
        )}
        {groups.map(([title, g]) => (
          <View key={title} style={{ marginBottom: 18 }}>
            <View style={s.groupHead}><Text style={[s.groupTitle, title.startsWith('Missing') && { color: T.red }]}>{title}</Text><Text style={s.groupCount}>{g.length}</Text></View>
            <Card>{g.map((i, k) => <WorkRow key={i.id} item={i} showCourse={!cls} last={k === g.length - 1} onPress={() => openItem(i.id)} />)}</Card>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/* ---------- Classes ---------- */
export function useClasses(items) {
  return useMemo(() => {
    const m = new Map();
    items.forEach((i) => {
      const k = i.course || 'Other';
      const c = m.get(k) || { name: k, todo: 0, next: 0, count: 0, fresh: 0, late: 0 };
      c.count++;
      if (isNew(i)) c.fresh++;
      if (isOpen(i)) { c.todo++; if (workState(i) === 'late') c.late++; else if (i.dueAt && (!c.next || i.dueAt < c.next)) c.next = i.dueAt; }
      m.set(k, c);
    });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);
}

export function ClassesScreen() {
  const { items, openClass, refresh, refreshing } = useContext(AppCtx);
  const cw = useContentWidth();
  const cols = cw >= 980 ? 3 : cw >= 600 ? 2 : 1;
  const classes = useClasses(items);
  const w = (cw - 32 - 14 * (cols - 1)) / cols;
  return (
    <View style={{ flex: 1 }}>
      <LargeTitle title="Classes" subtitle={`${classes.length} class${classes.length === 1 ? '' : 'es'}`} />
      <ScrollView contentContainerStyle={[s.page, { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={T.brand} />}>
        {classes.length === 0 && <View style={{ width: '100%' }}><Empty icon="school-outline" title="No classes yet" text="They appear after the first sync." /></View>}
        {classes.map((c) => (
          <Pressable key={c.name} onPress={() => openClass(c.name)} style={({ pressed }) => [s.classCard, shadowSm, { width: w }, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={classPair(c.name)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.classBanner}>
              <View style={s.classGlow} />
              <Text style={s.classTitle} numberOfLines={2}>{c.name}</Text>
              <View style={s.avatar}><Text style={[s.avatarTxt, { color: classPair(c.name)[0] }]}>{c.name.replace(/^P\d+\s+/i, '').trim().charAt(0).toUpperCase()}</Text></View>
            </LinearGradient>
            <View style={s.classBody}>
              <Text style={[s.classDue, c.todo > 0 && { color: T.ink, fontWeight: '600' }]} numberOfLines={1}>
                {c.todo === 0 ? 'All caught up' : `${c.todo} to do${c.next ? ' · next ' + shortDue({ dueAt: c.next }) : ''}`}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {c.late > 0 && <Pill label={`${c.late} missing`} tone="red" />}
                {c.fresh > 0 && <Pill label={`${c.fresh} new`} tone="blue" />}
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/* ---------- One class ---------- */
export function ClassScreen({ name }) {
  const { items, openItem, pop } = useContext(AppCtx);
  const [tab, setTab] = useState('Classwork');
  const mine = useMemo(() => items.filter((i) => (i.course || 'Other') === name), [items, name]);
  const count = (k) => mine.filter((i) => kindOf(i) === k).length;
  const groups = useMemo(() => {
    const list = mine.filter((i) => kindOf(i) === tab);
    if (tab !== 'Classwork') { const g = [...list].sort((a, b) => (b.posted_at || b.created_at || 0) - (a.posted_at || a.created_at || 0)); return g.length ? [['', g]] : []; }
    const late = list.filter((i) => workState(i) === 'late').sort((a, b) => (b.dueAt || 0) - (a.dueAt || 0));
    const open = list.filter((i) => isOpen(i) && workState(i) !== 'late').sort((a, b) => (a.dueAt || 9e15) - (b.dueAt || 9e15));
    const done = list.filter(isDone).sort((a, b) => (b.posted_at || b.created_at || 0) - (a.posted_at || a.created_at || 0));
    return [['Missing', late], ['To do', open], ['Done', done]].filter(([, g]) => g.length);
  }, [mine, tab]);
  return (
    <View style={{ flex: 1 }}>
      <Header title={name} subtitle={`${mine.length} post${mine.length === 1 ? '' : 's'}`} pair={classPair(name)} onBack={pop} />
      <View style={{ padding: 16, paddingBottom: 6 }}>
        <Seg value={tab} onChange={setTab} options={[['Classwork', 'Classwork', count('Classwork')], ['Materials', 'Materials', count('Materials')], ['Announcements', 'Posts', count('Announcements')]]} />
      </View>
      <ScrollView contentContainerStyle={s.page}>
        {groups.length === 0 && <Empty icon="file-tray-outline" title={`No ${tab === 'Announcements' ? 'posts' : tab.toLowerCase()} yet`} />}
        {groups.map(([title, g]) => (
          <View key={title || 'all'} style={{ marginBottom: 18 }}>
            {!!title && <View style={s.groupHead}><Text style={[s.groupTitle, title === 'Missing' && { color: T.red }]}>{title}</Text><Text style={s.groupCount}>{g.length}</Text></View>}
            <Card>{g.map((i, k) => <WorkRow key={i.id} item={i} last={k === g.length - 1} onPress={() => openItem(i.id)} />)}</Card>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/* ---------- Find ---------- */
const KINDS = ['All', 'Classwork', 'Materials', 'Announcements', 'Files'];
export function FindScreen() {
  const { items, openItem, openPreview } = useContext(AppCtx);
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
      <LargeTitle title="Find" />
      <View style={s.searchWrap}>
        <Icon n="search" s={19} c={T.faint} />
        <TextInput value={q} onChangeText={setQ} placeholder="Titles, instructions, file names, your notes" placeholderTextColor={T.faint} style={s.search} autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
        {!!q && <Pressable onPress={() => setQ('')} hitSlop={10}><Icon n="close-circle" s={19} c={T.faint} /></Pressable>}
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {KINDS.map((k) => <Chip key={k} label={k === 'Announcements' ? 'Posts' : k} on={kind === k} onPress={() => setKind(k)} />)}
        </ScrollView>
      </View>
      {kind === 'Files' ? (
        <FlatList data={fileRows} keyExtractor={(r) => r.f.id} keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}
          ListEmptyComponent={<Empty icon="document-outline" title="No files match" />}
          renderItem={({ item: r }) => (
            <Pressable onPress={() => openPreview(r.f, r.i.files)} style={({ pressed }) => [s.fileRow, shadowSm, pressed && { opacity: 0.8 }]}>
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
          renderItem={({ item }) => <View style={[s.findRow, shadowSm]}><WorkRow item={item} showCourse last onPress={() => openItem(item.id)} /></View>} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 120 },
  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  roundBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.brandSoft, alignItems: 'center', justifyContent: 'center' },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 },
  groupTitle: { fontSize: 15, fontWeight: '800', color: T.ink },
  groupCount: { fontSize: 13, color: T.faint, fontWeight: '700' },
  classCard: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden' },
  classBanner: { height: 104, padding: 16, flexDirection: 'row', alignItems: 'flex-end', overflow: 'hidden' },
  classGlow: { position: 'absolute', right: -40, top: -50, width: 170, height: 170, borderRadius: 85, backgroundColor: '#ffffff1f' },
  classTitle: { flex: 1, color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  avatarTxt: { fontSize: 19, fontWeight: '800' },
  classBody: { paddingHorizontal: 16, paddingVertical: 13, gap: 8, minHeight: 58, justifyContent: 'center' },
  classDue: { fontSize: 13.5, color: T.sub },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 16, paddingHorizontal: 14, height: 46, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: T.line },
  search: { flex: 1, fontSize: 15.5, color: T.ink, outlineStyle: 'none' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#fff', borderRadius: 16, marginBottom: 10 },
  fileName: { fontSize: 14.5, color: T.ink, fontWeight: '600' },
  fileSub: { fontSize: 12.5, color: T.sub, marginTop: 2 },
  findRow: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 10, overflow: 'hidden' },
});
