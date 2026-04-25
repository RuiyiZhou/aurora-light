import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Platform, RefreshControl,
} from 'react-native';
import Svg, {
  Defs, RadialGradient as SvgRadial, Stop, Filter, FeGaussianBlur,
  Circle, Line, G, Text as SvgText,
} from 'react-native-svg';
import { fetchCurrentKp } from '../services/noaa';
import { auroraLatitudeBoundary } from '../utils/visibility';

const SCREEN_W = Dimensions.get('window').width;
const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO  = Platform.OS === 'ios' ? 'Menlo'   : 'monospace';

const PALETTE = {
  quiet:  { glow: '#0d3a2c', accent: '#1a7d5a', text: '#5eead4' },
  active: { glow: '#0e6b4a', accent: '#10b981', text: '#6ee7b7' },
  storm:  { glow: '#16a34a', accent: '#34d399', text: '#a7f3d0' },
  severe: { glow: '#facc15', accent: '#fb923c', text: '#fde68a' },
};
function pal(kp: number) {
  if (kp >= 7) return PALETTE.severe;
  if (kp >= 5) return PALETTE.storm;
  if (kp >= 2) return PALETTE.active;
  return PALETTE.quiet;
}

// Design canvas — we use viewBox so it scales to any screen width
const VB_W = 402, VB_H = 460;
const cx = VB_W / 2;
const cy = VB_H / 2 - 10;
const r  = 150;

export default function MapScreen() {
  const [kp,         setKp]         = useState(0);
  const [hemi,       setHemi]       = useState<'north' | 'south'>('north');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const readings = await fetchCurrentKp();
    if (readings.length > 0) setKp(readings[readings.length - 1].kp);
  }, []);

  useEffect(() => { loadData().finally(() => setLoading(false)); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const C         = pal(kp);
  const intensity = Math.min(1, Math.max(0.18, kp / 9));
  // Oval shrinks toward pole as Kp rises (design formula)
  const ovalR     = 50 + (9 - Math.min(9, kp)) * 7;
  const ovalRing  = 14 + intensity * 8;
  const latBoundary = auroraLatitudeBoundary(kp);
  const coverage    = Math.round(45 + intensity * 35);

  // Procedural probability patches — LCG seed driven by Kp
  const patches = useMemo(() => {
    const arr: { x: number; y: number; rad: number; op: number }[] = [];
    let s = 13 + Math.round(kp * 7);
    const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < 26; i++) {
      const a  = (i / 26) * Math.PI * 2 + rand() * 0.15;
      const dr = ovalR + (rand() - 0.5) * ovalRing * 1.4;
      arr.push({
        x:   cx  + Math.cos(a) * dr,
        y:   cy  + Math.sin(a) * dr,
        rad: 14  + rand() * 18,
        op:  0.25 + rand() * 0.6,
      });
    }
    return arr;
  }, [kp, ovalR, ovalRing]);

  const ovalH = SCREEN_W * (VB_H / VB_W);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
    >
      {/* ── Editorial header ── */}
      <View style={styles.header}>
        <Text style={[styles.mono10, { color: C.text, opacity: 0.8, marginBottom: 12 }]}>
          OVATION Live · NOAA SWPC
        </Text>
        <Text style={styles.headline}>
          {hemi === 'north' ? 'Northern' : 'Southern'} oval.
        </Text>
      </View>

      {/* ── Hemisphere toggle — underline tab style ── */}
      <View style={styles.toggleRow}>
        {(['north', 'south'] as const).map(h => (
          <TouchableOpacity key={h} onPress={() => setHemi(h)} style={styles.toggleBtn} activeOpacity={0.7}>
            <Text style={[styles.toggleLabel, { color: hemi === h ? C.text : '#475569' }]}>
              {h === 'north' ? 'Northern' : 'Southern'}
            </Text>
            <View style={[styles.toggleUnderline, { backgroundColor: hemi === h ? C.accent : 'transparent' }]} />
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Polar projection SVG ── */}
      <View style={[styles.ovalWrap, { height: ovalH }]}>
        <Svg viewBox={`0 0 ${VB_W} ${VB_H}`} width={SCREEN_W} height={ovalH}>
          <Defs>
            <SvgRadial id="oval-glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%"   stopColor={C.accent} stopOpacity="0" />
              <Stop offset="60%"  stopColor={C.accent} stopOpacity={String(0.32 * intensity)} />
              <Stop offset="82%"  stopColor={C.accent} stopOpacity={String(0.55 * intensity)} />
              <Stop offset="100%" stopColor={C.glow}   stopOpacity="0" />
            </SvgRadial>
            <SvgRadial id="patch-grad" cx="50%" cy="50%" r="50%">
              <Stop offset="0%"   stopColor={C.text}   stopOpacity="0.9" />
              <Stop offset="60%"  stopColor={C.accent} stopOpacity="0.5" />
              <Stop offset="100%" stopColor={C.glow}   stopOpacity="0" />
            </SvgRadial>
            <Filter id="patch-blur" x="-50%" y="-50%" width="200%" height="200%">
              <FeGaussianBlur stdDeviation="6" />
            </Filter>
          </Defs>

          {/* Background disc */}
          <Circle cx={cx} cy={cy} r={r * 1.25} fill="#07070f" />

          {/* Latitude rings */}
          {[r, r * 0.78, r * 0.55, r * 0.32, r * 0.12].map((rr, i) => (
            <Circle key={i} cx={cx} cy={cy} r={rr}
              fill="none" stroke="#0e0e18" strokeWidth={0.5}
              strokeDasharray={i === 0 ? undefined : '2 4'} />
          ))}

          {/* Meridians (8) */}
          {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5].map(deg => {
            const rad = (deg * Math.PI) / 180;
            return (
              <Line key={deg}
                x1={cx + Math.cos(rad) * r} y1={cy + Math.sin(rad) * r}
                x2={cx - Math.cos(rad) * r} y2={cy - Math.sin(rad) * r}
                stroke="#0e0e18" strokeWidth={0.5} strokeDasharray="2 4" />
            );
          })}

          {/* Annular glow ring */}
          <Circle cx={cx} cy={cy} r={ovalR + 14} fill="url(#oval-glow)" />

          {/* Blurred probability patches */}
          <G filter="url(#patch-blur)">
            {patches.map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={p.rad}
                fill="url(#patch-grad)" opacity={p.op * intensity} />
            ))}
          </G>

          {/* Crisp oval ring */}
          <Circle cx={cx} cy={cy} r={ovalR}
            fill="none" stroke={C.accent} strokeWidth={1.2}
            opacity={0.6 + intensity * 0.4} />

          {/* Pole crosshair */}
          <Line x1={cx - 6} y1={cy} x2={cx + 6} y2={cy} stroke="#475569" strokeWidth={0.8} />
          <Line x1={cx} y1={cy - 6} x2={cx} y2={cy + 6} stroke="#475569" strokeWidth={0.8} />

          {/* Compass labels */}
          <SvgText x={cx}         y={28}          fill="#334155" fontFamily={MONO} fontSize={10} textAnchor="middle">N</SvgText>
          <SvgText x={cx}         y={VB_H - 12}   fill="#334155" fontFamily={MONO} fontSize={10} textAnchor="middle">S</SvgText>
          <SvgText x={VB_W - 16}  y={cy + 4}      fill="#334155" fontFamily={MONO} fontSize={10} textAnchor="middle">E</SvgText>
          <SvgText x={16}         y={cy + 4}      fill="#334155" fontFamily={MONO} fontSize={10} textAnchor="middle">W</SvgText>

          {/* Latitude annotations */}
          <SvgText x={cx + r + 4}      y={cy + 4} fill="#334155" fontFamily={MONO} fontSize={8}>40°</SvgText>
          <SvgText x={cx + ovalR + 4}  y={cy + 4} fill={C.text}  fontFamily={MONO} fontSize={8}>
            {latBoundary}°
          </SvgText>
        </Svg>
      </View>

      {/* ── Caption strip ── */}
      <View style={styles.caption}>
        {[
          { k: 'Boundary', v: `${latBoundary}°` },
          { k: 'Coverage', v: `${coverage}%`    },
          { k: 'Hemi',     v: hemi === 'north' ? 'N' : 'S' },
        ].map((item, i, arr) => (
          <View key={item.k} style={[styles.captionCell, i < arr.length - 1 && styles.captionCellBorder]}>
            <Text style={styles.captionKey}>{item.k}</Text>
            <Text style={styles.captionVal}>{item.v}</Text>
          </View>
        ))}
      </View>

      {/* ── Probability legend ── */}
      <View style={styles.legendSection}>
        <Text style={[styles.mono10, { color: '#475569', marginBottom: 16 }]}>
          Visibility probability
        </Text>
        {[
          { p: '> 80%',  label: 'Overhead',  c: C.text    },
          { p: '50–80%', label: 'High',       c: C.accent  },
          { p: '10–50%', label: 'Moderate',   c: C.glow    },
          { p: '< 10%',  label: 'Trace',      c: '#334155' },
        ].map((row, i, arr) => (
          <View key={row.label} style={[styles.legendRow, i < arr.length - 1 && styles.legendBorder]}>
            <View style={[styles.legendDot, {
              backgroundColor: row.c,
              shadowColor: row.c,
            }]} />
            <Text style={styles.legendLabel}>{row.label}</Text>
            <Text style={styles.legendPct}>{row.p}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020207' },
  content:   { paddingBottom: 120 },

  header:   { paddingHorizontal: 28, paddingTop: 28 },
  headline: {
    fontFamily: SERIF, fontSize: 40, lineHeight: 46,
    letterSpacing: -1.2, fontStyle: 'italic', fontWeight: '400',
    color: '#f8fafc', marginBottom: 28,
  },

  toggleRow: { flexDirection: 'row', gap: 24, paddingHorizontal: 28, paddingBottom: 8 },
  toggleBtn: { paddingVertical: 6 },
  toggleLabel: {
    fontFamily: MONO, fontSize: 11,
    letterSpacing: 1.8, textTransform: 'uppercase',
  },
  toggleUnderline: { height: 1, marginTop: 4 },

  ovalWrap: { marginTop: 8 },

  caption: {
    flexDirection: 'row',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: '#15151f',
    marginHorizontal: 28,
  },
  captionCell: { flex: 1, paddingVertical: 18 },
  captionCellBorder: {
    borderRightWidth: 1, borderRightColor: '#15151f',
    paddingRight: 16, marginRight: 16,
  },
  captionKey: {
    fontFamily: MONO, fontSize: 9, letterSpacing: 1.8,
    textTransform: 'uppercase', color: '#475569', marginBottom: 6,
  },
  captionVal: {
    fontFamily: SERIF, fontSize: 28, lineHeight: 28,
    letterSpacing: -0.6, color: '#f8fafc',
  },

  legendSection: { paddingHorizontal: 28, paddingTop: 24 },
  legendRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  legendBorder:  { borderBottomWidth: 1, borderBottomColor: '#15151f' },
  legendDot: {
    width: 10, height: 10, borderRadius: 99,
    marginRight: 14,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 4, elevation: 4,
  },
  legendLabel: {
    flex: 1, fontFamily: SERIF, fontSize: 18,
    letterSpacing: -0.2, color: '#f8fafc',
  },
  legendPct: {
    fontFamily: MONO, fontSize: 11, color: '#475569',
  },

  mono10: {
    fontFamily: MONO, fontSize: 10,
    letterSpacing: 2.2, textTransform: 'uppercase',
  },
});
