import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from './lib';
import { Icon } from './ui';

export const Btn = ({ label, onPress, kind = 'solid', disabled, icon }) => (
  <Pressable onPress={onPress} disabled={disabled} style={[s.btn, kind === 'ghost' && s.btnGhost, kind === 'outline' && s.btnOutline, disabled && { opacity: 0.5 }]}>
    {icon ? <Icon n={icon} s={18} c={kind === 'solid' ? '#fff' : C.blue} /> : null}
    <Text style={[s.btnTxt, kind !== 'solid' && { color: C.blue }]}>{label}</Text>
  </Pressable>
);

export function AppBar({ title, subtitle, color, onBack, right }) {
  const onColor = !!color;
  return (
    <View style={[s.bar, onColor && { backgroundColor: color, borderBottomWidth: 0 }]}>
      {onBack ? <Pressable onPress={onBack} hitSlop={12} style={s.barBack}><Icon n="arrow-back" s={24} c={onColor ? '#fff' : C.text} /></Pressable> : null}
      <View style={{ flex: 1 }}>
        <Text style={[s.barTitle, onColor && { color: '#fff' }]} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={[s.barSub, onColor && { color: '#ffffffcc' }]} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  btn: { backgroundColor: C.blue, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  btnGhost: { backgroundColor: 'transparent' },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line },
  btnTxt: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  barBack: { marginLeft: -4 },
  barTitle: { fontSize: 20, fontWeight: '500', color: C.text },
  barSub: { fontSize: 12, color: C.sub, marginTop: 1 },
});
