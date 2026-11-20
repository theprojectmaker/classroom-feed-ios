// Google Classroom's own typeface: Google Sans (it is open source now). Three weights are enough: 400 for text, 500 for
// labels, buttons, tabs and list titles, 700 for the few bold bits. Each weight is imported on its own so only those three
// font files go into the app.
//
// `Text` here is a drop-in for React Native's Text: it turns the usual fontWeight into the right Google Sans file (React Native
// cannot pick a weight out of a custom font by itself) and leaves everything else alone. Until the fonts are loaded — and if
// they ever fail to load — it simply behaves like the normal Text, so the app is never blocked by a font.
import React from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import { useFonts } from 'expo-font';
import { GoogleSans_400Regular } from '@expo-google-fonts/google-sans/400Regular';
import { GoogleSans_500Medium } from '@expo-google-fonts/google-sans/500Medium';
import { GoogleSans_700Bold } from '@expo-google-fonts/google-sans/700Bold';

const FILES = { GoogleSans_400Regular, GoogleSans_500Medium, GoogleSans_700Bold };
let ready = false;

/**
 * Loads the fonts. Returns true once they are loaded, have failed, or 3 seconds have passed (the app then carries on with the
 * system font and switches to Google Sans by itself when the fonts do arrive) — so a font can never leave the screen blank.
 */
export function useAppFonts() {
  const [ok, err] = useFonts(FILES);
  const [late, setLate] = React.useState(false);
  React.useEffect(() => { const t = setTimeout(() => setLate(true), 3000); return () => clearTimeout(t); }, []);
  if (ok) ready = true;
  return !!(ok || err || late);
}

const familyFor = (w) => {
  const n = w === 'bold' ? 700 : !w || w === 'normal' ? 400 : Number(w) || 400;
  return n >= 650 ? 'GoogleSans_700Bold' : n >= 450 ? 'GoogleSans_500Medium' : 'GoogleSans_400Regular';
};

export const Text = React.forwardRef(function Text({ style, ...rest }, ref) {
  if (!ready) return <RNText ref={ref} style={style} {...rest} />;
  const flat = StyleSheet.flatten(style) || {};
  const { fontWeight, fontFamily, letterSpacing, ...others } = flat;
  return <RNText ref={ref} {...rest} style={[others, { fontFamily: fontFamily || familyFor(fontWeight), letterSpacing: letterSpacing && letterSpacing > 0 ? letterSpacing : 0 }]} />;
});
