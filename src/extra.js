// Learning + finding + adding: formatted text, notes, steps, "Today" summary, Find tab, Add-assignment form.
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, courseColor } from './lib';
import { AppCtx } from './ctx';
import { AppBar, Btn } from './widgets';
import { DAY, Icon, SectionHeader, WorkRow, bucketOf, isWork, kindOf, shortDue, startOfToday } from './ui';

/* ---------- readable text: bullets, headings, tappable links ---------- */
function linkify(t) {
  return t.split(/(https?:\/\/[^\s)]+)/g).map((p, k) => (/^https?:\/\//.test(p)
    ? <Text key={k} style={x.link} onPress={() => Linking.openURL(p)}>{p.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}</Text>
    : p));
}
export function RichText({ text }) {
  const lines = String(text || '').split('\n');
  return (
    <View style={{ paddingHorizontal: 16 }}>
      {lines.map((raw, i) => {
        const t = raw.replace(/\s+$/, '');
        if (!t.trim()) return <View key={i} style={{ height: 10 }} />;
        const b = t.match(/^\s*([-•*–·]|\d{1,2}[.)])\s+(.*)$/);
        if (b) return (
          <View key={i} style={x.bulletRow}>
            <Text style={x.bullet}>{/\d/.test(b[1]) ? b[1] : '•'}</Text>
            <Text style={[x.body, { flex: 1 }]} selectable>{linkify(b[2])}</Text>
          </View>
        );
        const tt = t.trim();
        const head = (tt.length < 60 && /:$/.test(tt)) || (/^[A-Z0-9][A-Z0-9 &:/'’-]{3,50}$/.test(tt) && /[A-Z]{3}/.test(tt));
        return <Text key={i} selectable style={[x.body, head && x.head]}>{linkify(t)}</Text>;
      })}
    </View>
  );
}

/* ---------- my notes (saved on the device, per assignment) ---------- */
export function NotesCard({ item }) {
  const { updateItem } = useContext(AppCtx);
  const [v, setV] = useState(item.notes || '');
  useEffect(() => {
    if (v === (item.notes || '')) return undefined;
    const t = setTimeout(() => updateItem(item.id, { notes: v }), 600);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={x.card}>
      <View style={x.cardHead}><Icon n="create-outline" s={18} c={C.blue} /><Text style={x.cardTitle}>My notes</Text></View>
      <TextInput multiline value={v} onChangeText={setV} placeholder="What do you need to remember? Key ideas, questions, what the teacher said…" placeholderTextColor={C.sub} style={x.notes} />
    </View>
  );
}

/* ---------- steps: break the work into small checkable pieces ---------- */
export function StepsCard({ item }) {
  const { updateItem } = useContext(AppCtx);
  const steps = item.steps || [];
  const [v, setV] = useState('');
  const set = (n) => updateItem(item.id, { steps: n });
  const add = () => { const t = v.trim(); if (!t) return; set([...steps, { t, done: false }]); setV(''); };
  const done = steps.filter((p) => p.done).length;
  return (
    <View style={x.card}>
      <View style={x.cardHead}>
        <Icon n="list-outline" s={18} c={C.blue} /><Text style={x.cardTitle}>Steps</Text>
        {steps.length > 0 && <Text style={x.cardCount}>{done}/{steps.length}</Text>}
      </View>
      {steps.length > 0 && <View style={x.bar}><View style={[x.barFill, { width: `${Math.round((done / steps.length) * 100)}%` }]} /></View>}
      {steps.map((p, i) => (
        <Pressable key={i} onPress={() => set(steps.map((q, k) => (k === i ? { ...q, done: !q.done } : q)))} onLongPress={() => set(steps.filter((_, k) => k !== i))} style={x.step}>
          <Icon n={p.done ? 'checkbox' : 'square-outline'} s={22} c={p.done ? C.green : C.sub} />
          <Text style={[x.stepTxt, p.done && { textDecorationLine: 'line-through', color: C.sub }]}>{p.t}</Text>
        </Pressable>
      ))}
      <View style={x.addRow}>
        <TextInput value={v} onChangeText={setV} onSubmitEditing={add} placeholder="Add a step (hold a step to remove it)" placeholderTextColor={C.sub} style={x.addInput} returnKeyType="done" />
        <Pressable onPress={add} hitSlop={8}><Icon n="add-circle" s={30} c={C.blue} /></Pressable>
      </View>
    </View>
  );
}

/* ---------- Today summary at the top of Classes ---------- */
export function TodayCard({ onOpen }) {
  const { items, openItem } = useContext(AppCtx);
  const sum = useMemo(() => {
    const open = items.filter((i) => isWork(i) && !i.submitted);
    const b = (n) => open.filter((i) => bucketOf(i) === n).length;
    const updated = items.filter((i) => (i.changeNote || i.change_note) && (i.changed_at || 0) > Date.now() - 7 * DAY);
    const next = open.filter((i) => i.dueAt && i.dueAt >= startOfToday()).sort((a, c) => a.dueAt - c.dueAt).slice(0, 3);
    const late = open.filter((i) => bucketOf(i) === 'Overdue').sort((a, c) => c.dueAt - a.dueAt).slice(0, 2);
    return { overdue: b('Overdue'), today: b('Today'), week: b('Today') + b('Tomorrow') + b('This week'), total: open.length, updated, next, late };
  }, [items]);
  return (
    <View style={x.today}>
      <View style={x.tiles}>
        {[['Overdue', sum.overdue, sum.overdue ? C.red : C.sub], ['Due today', sum.today, sum.today ? C.amber : C.sub], ['This week', sum.week, C.blue], ['All open', sum.total, C.text]].map(([l, n, c]) => (
          <View key={l} style={x.tile}><Text style={[x.tileN, { color: c }]}>{n}</Text><Text style={x.tileL}>{l}</Text></View>
        ))}
      </View>
      {sum.updated.length > 0 && (
        <View style={x.upd}>
          <Text style={x.updHead}>Updates</Text>
          {sum.updated.slice(0, 4).map((i) => (
            <Pressable key={i.id} onPress={() => openItem(i.id)} style={x.updRow}>
              <Icon n="notifications" s={16} c={C.red} />
              <Text style={x.updTxt} numberOfLines={2}><Text style={{ fontWeight: '700' }}>{i.title}</Text> · {i.changeNote || i.change_note}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {[...sum.late, ...sum.next].length > 0 && (
        <View style={{ marginTop: 6 }}>
          {[...sum.late, ...sum.next].map((i) => (
            <Pressable key={i.id} onPress={() => openItem(i.id)} style={x.nextRow}>
              <View style={[x.dot, { backgroundColor: courseColor(i.course) }]} />
              <Text style={x.nextTitle} numberOfLines={1}>{i.title}</Text>
              <Text style={[x.nextDue, i.dueAt < Date.now() && { color: C.red }]}>{shortDue(i)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/* ---------- Find: search everything, filter, files ---------- */
const KINDS = ['All', 'Classwork', 'Materials', 'Announcements', 'Files'];
export function SearchScreen() {
  const { items, openItem, openPreview } = useContext(AppCtx);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('All');
  const [cls, setCls] = useState('All classes');
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState('Newest');
  const names = useMemo(() => ['All classes', ...[...new Set(items.map((i) => i.course || 'Other'))].sort()], [items]);
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = useMemo(() => {
    const hay = (i) => `${i.title} ${i.course} ${i.body} ${i.notes || ''} ${(i.files || []).map((f) => f.name).join(' ')}`.toLowerCase();
    const out = items.filter((i) => (cls === 'All classes' || (i.course || 'Other') === cls)
      && (kind === 'All' || (kind === 'Files' ? (i.files || []).length > 0 : kindOf(i) === kind))
      && (!open || (isWork(i) && !i.submitted))
      && toks.every((t) => hay(i).includes(t)));
    return out.sort(sort === 'Due soon' ? (a, c) => (a.dueAt || 9e15) - (c.dueAt || 9e15) : (a, c) => (c.posted_at || c.created_at || 0) - (a.posted_at || a.created_at || 0));
  }, [items, q, kind, cls, open, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const fileRows = useMemo(() => {
    if (kind !== 'Files') return [];
    const rows = list.flatMap((i) => (i.files || []).map((f) => ({ f, i, all: i.files })));
    const byName = (r) => Number(toks.every((t) => r.f.name.toLowerCase().includes(t)));
    return toks.length ? rows.sort((a, b) => byName(b) - byName(a)) : rows;
  }, [list, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const Chip = ({ label, on, onPress }) => (
    <Pressable onPress={onPress} style={[x.chip, on && x.chipOn]}><Text style={[x.chipTxt, on && { color: C.blue, fontWeight: '700' }]} numberOfLines={1}>{label}</Text></Pressable>
  );
  return (
    <View style={{ flex: 1 }}>
      <AppBar title="Find" subtitle={`${kind === 'Files' ? fileRows.length + ' file' + (fileRows.length === 1 ? '' : 's') : list.length + ' result' + (list.length === 1 ? '' : 's')}`} />
      <View style={x.searchWrap}>
        <Icon n="search" s={18} c={C.sub} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search titles, instructions, files, your notes" placeholderTextColor={C.sub} style={x.search} autoCorrect={false} autoCapitalize="none" />
        {!!q && <Pressable onPress={() => setQ('')} hitSlop={10}><Icon n="close-circle" s={18} c={C.sub} /></Pressable>}
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={x.chips}>
          {KINDS.map((k) => <Chip key={k} label={k} on={kind === k} onPress={() => setKind(k)} />)}
          <Chip label={open ? 'Open work only ✓' : 'Open work only'} on={open} onPress={() => setOpen(!open)} />
          <Chip label={'Sort: ' + sort} onPress={() => setSort(sort === 'Newest' ? 'Due soon' : 'Newest')} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[x.chips, { paddingTop: 0 }]}>
          {names.map((n) => <Chip key={n} label={n} on={cls === n} onPress={() => setCls(n)} />)}
        </ScrollView>
      </View>
      {kind === 'Files' ? (
        <FlatList data={fileRows} keyExtractor={(r) => r.f.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Text style={x.empty}>No files match.</Text>}
          renderItem={({ item: r }) => (
            <Pressable onPress={() => openPreview(r.f, r.all)} style={x.fileRow}>
              <View style={[x.fileBadge, { backgroundColor: courseColor(r.i.course) }]}><Text style={x.fileExt}>{(r.f.name.split('.').pop() || 'file').slice(0, 4).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={x.fileName} numberOfLines={2}>{r.f.name}</Text>
                <Text style={x.fileSub} numberOfLines={1}>{r.i.course} · {r.i.title}</Text>
              </View>
              <Icon n="eye-outline" s={20} c={C.sub} />
            </Pressable>
          )} />
      ) : (
        <FlatList data={list} keyExtractor={(i) => i.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Text style={x.empty}>{q ? 'No matches. Try fewer words.' : 'Nothing here yet.'}</Text>}
          renderItem={({ item }) => <WorkRow item={item} color={courseColor(item.course)} showCourse onPress={() => openItem(item.id)} />} />
      )}
    </View>
  );
}

/* ---------- Add your own assignment ---------- */
const DUE = [['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7], ['No date', null]];
const endOf = (d) => { const t = new Date(startOfToday() + d * DAY); t.setHours(23, 59, 0, 0); return t.getTime(); };
function parseDate(v) {
  const m = String(v).trim().match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (!m) return null;
  const d = new Date(); d.setMonth(Number(m[1]) - 1, Number(m[2])); d.setHours(23, 59, 0, 0);
  if (d.getTime() < startOfToday()) d.setFullYear(d.getFullYear() + 1);
  return d.getMonth() === Number(m[1]) - 1 ? d.getTime() : null;
}
export function AddModal({ classes, onSave, onClose }) {
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState(classes[0] || '');
  const [custom, setCustom] = useState('');
  const [due, setDue] = useState(1);
  const [typed, setTyped] = useState('');
  const [kind, setKind] = useState('assignment');
  const [body, setBody] = useState('');
  const dueAt = parseDate(typed) || (due == null ? 0 : endOf(due));
  const cls = (custom.trim() || course || 'My work').trim();
  const ok = title.trim().length > 0;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <AppBar title="Add to my work" onBack={onClose} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Text style={x.lbl}>What is it?</Text>
          <View style={x.row2}>
            {[['assignment', 'Assignment'], ['material', 'Study / material']].map(([k, l]) => (
              <Pressable key={k} onPress={() => setKind(k)} style={[x.chip, kind === k && x.chipOn]}><Text style={[x.chipTxt, kind === k && { color: C.blue, fontWeight: '700' }]}>{l}</Text></Pressable>
            ))}
          </View>
          <Text style={x.lbl}>Title</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Read chapter 4, Quiz study guide" placeholderTextColor={C.sub} style={x.field} autoFocus />
          <Text style={x.lbl}>Class</Text>
          <View style={x.wrap}>
            {classes.map((c) => <Pressable key={c} onPress={() => { setCourse(c); setCustom(''); }} style={[x.chip, !custom.trim() && course === c && x.chipOn]}><Text style={[x.chipTxt, !custom.trim() && course === c && { color: C.blue, fontWeight: '700' }]}>{c}</Text></Pressable>)}
          </View>
          <TextInput value={custom} onChangeText={setCustom} placeholder="…or type a new class name" placeholderTextColor={C.sub} style={[x.field, { marginTop: 10 }]} />
          {kind === 'assignment' && (<>
            <Text style={x.lbl}>Due</Text>
            <View style={x.wrap}>
              {DUE.map(([l, d]) => <Pressable key={l} onPress={() => { setDue(d); setTyped(''); }} style={[x.chip, !typed && due === d && x.chipOn]}><Text style={[x.chipTxt, !typed && due === d && { color: C.blue, fontWeight: '700' }]}>{l}</Text></Pressable>)}
            </View>
            <TextInput value={typed} onChangeText={setTyped} placeholder="…or type a date like 11/20" placeholderTextColor={C.sub} style={[x.field, { marginTop: 10 }]} keyboardType="numbers-and-punctuation" />
            <Text style={x.hint}>{dueAt ? 'Due ' + shortDue({ dueAt }).replace(/, 11:59 PM/, '') : 'No due date'}</Text>
          </>)}
          <Text style={x.lbl}>Notes (optional)</Text>
          <TextInput value={body} onChangeText={setBody} multiline placeholder="Instructions, pages, what to study…" placeholderTextColor={C.sub} style={[x.field, { minHeight: 90, textAlignVertical: 'top' }]} />
          <View style={{ marginTop: 22 }}><Btn icon="checkmark" label="Add" disabled={!ok} onPress={() => onSave({ title: title.trim(), course: cls, dueAt: kind === 'assignment' ? dueAt : 0, body: body.trim(), kind })} /></View>
          <Text style={x.hint}>Stays on this device. You can attach files, add steps and notes, and tick it off like any other assignment.</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const x = StyleSheet.create({
  body: { fontSize: 16, lineHeight: 25, color: C.text },
  head: { fontWeight: '700', marginTop: 6, color: C.blueDark },
  link: { color: C.blue, textDecorationLine: 'underline' },
  bulletRow: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  bullet: { fontSize: 16, lineHeight: 25, color: C.sub, minWidth: 18 },
  card: { marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, flex: 1 },
  cardCount: { fontSize: 13, color: C.sub, fontWeight: '600' },
  notes: { minHeight: 90, fontSize: 15.5, lineHeight: 22, color: C.text, textAlignVertical: 'top', padding: 0 },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#e8eaed', marginBottom: 6, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: C.green },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  stepTxt: { flex: 1, fontSize: 15.5, color: C.text },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  addInput: { flex: 1, fontSize: 15, color: C.text, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  today: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: C.bg },
  tileN: { fontSize: 24, fontWeight: '700' },
  tileL: { fontSize: 11.5, color: C.sub, marginTop: 1 },
  upd: { marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#fce8e6' },
  updHead: { fontSize: 12, fontWeight: '800', color: C.red, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  updRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 5 },
  updTxt: { flex: 1, fontSize: 13.5, color: C.text },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  dot: { width: 10, height: 10, borderRadius: 5 },
  nextTitle: { flex: 1, fontSize: 14.5, color: C.text, fontWeight: '500' },
  nextDue: { fontSize: 12.5, color: C.sub },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 14, marginBottom: 2, paddingHorizontal: 14, height: 44, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  search: { flex: 1, fontSize: 15, color: C.text },
  chips: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', maxWidth: 240 },
  chipOn: { backgroundColor: '#e8f0fe', borderColor: '#d2e3fc' },
  chipTxt: { fontSize: 13, color: C.sub },
  empty: { textAlign: 'center', color: C.sub, marginTop: 60, paddingHorizontal: 30, lineHeight: 21 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  fileBadge: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fileExt: { color: '#fff', fontWeight: '800', fontSize: 12 },
  fileName: { fontSize: 14.5, color: C.text, fontWeight: '500' },
  fileSub: { fontSize: 12.5, color: C.sub, marginTop: 2 },
  lbl: { fontSize: 13, fontWeight: '700', color: C.blueDark, marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  field: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, fontSize: 15.5, color: C.text },
  row2: { flexDirection: 'row', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 12.5, color: C.sub, marginTop: 8, lineHeight: 18 },
});
