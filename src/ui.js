// Shared look-and-feel helpers (Google-Classroom-style): colours, due-date wording, grouping, small widgets.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from './lib';

export const DAY = 86400000;
export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

export const Icon = ({ n, s = 22, c = C.text }) => <Ionicons name={n} size={s} color={c} />;

export const isWork = (i) => !['material', 'announcement', 'email'].includes(i.kind);
export const kindOf = (i) => (i.kind === 'announcement' ? 'Announcements' : i.kind === 'material' || i.kind === 'email' ? 'Materials' : 'Classwork');
export const statusOf = (i) => (i.submitted ? 'done' : i.dueAt && i.dueAt < Date.now() ? 'overdue' : 'assigned');

export function shortDue(item) {
  if (!item.dueAt) return item.due ? String(item.due).replace(/^Due\s*/i, '') : 'No due date';
  const d = new Date(item.dueAt);
  const days = Math.floor((item.dueAt - startOfToday()) / DAY);
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return 'Today, ' + t;
  if (days === 1) return 'Tomorrow, ' + t;
  if (days === -1) return 'Yesterday, ' + t;
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

export const BUCKETS = ['Overdue', 'This week', 'Next week', 'Later', 'No due date'];
export function bucketOf(i) {
  if (!i.dueAt) return 'No due date';
  if (i.dueAt < Date.now()) return 'Overdue';
  const days = Math.floor((i.dueAt - startOfToday()) / DAY);
  return days < 0 ? 'Overdue' : days < 7 ? 'This week' : days < 14 ? 'Next week' : 'Later';
}

/** Round coloured icon used on every list row (assignment / material / announcement). */
export function RowIcon({ item, color }) {
  const name = item.kind === 'announcement' ? 'megaphone' : item.kind === 'material' || item.kind === 'email' ? 'book' : 'document-text';
  return <View style={[st.rowIcon, { backgroundColor: item.submitted ? '#9aa0a6' : color }]}><Icon n={name} s={20} c="#fff" /></View>;
}

/** One list row, like Classroom's classwork list: icon, title, subtitle, status on the right. */
export function WorkRow({ item, color, onPress, showCourse }) {
  const status = statusOf(item);
  const sub = isWork(item) ? shortDue(item) : postedLabel(item);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && { backgroundColor: '#f1f3f4' }]}>
      <RowIcon item={item} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={[st.rowTitle, item.submitted && { color: C.sub }]} numberOfLines={2}>{item.title}</Text>
        <Text style={st.rowSub} numberOfLines={1}>{showCourse ? `${item.course} · ` : ''}{sub}</Text>
      </View>
      {isWork(item) && status === 'done' && <Icon n="checkmark-circle" s={22} c={C.green} />}
      {isWork(item) && status === 'overdue' && <Text style={st.overdue}>Overdue</Text>}
      {(item.files || []).length > 0 && status !== 'overdue' && status !== 'done' && <Icon n="attach" s={18} c={C.sub} />}
    </Pressable>
  );
}

export function SectionHeader({ title, count, color }) {
  return (
    <View style={st.secHead}>
      <Text style={[st.secTitle, color && { color }]}>{title}</Text>
      {count != null && <Text style={st.secCount}>{count}</Text>}
    </View>
  );
}

export const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, color: C.text, fontWeight: '500' },
  rowSub: { fontSize: 12.5, color: C.sub, marginTop: 2 },
  overdue: { color: C.red, fontSize: 12, fontWeight: '700' },
  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8, backgroundColor: C.bg },
  secTitle: { fontSize: 14, fontWeight: '700', color: C.blueDark },
  secCount: { fontSize: 13, color: C.sub },
});
