import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, Dimensions, Platform,
} from 'react-native';
import Svg, {
  Defs, ClipPath, LinearGradient as SvgGradient, Stop,
  Path, Line, Circle, Rect, G, Text as SvgText,
} from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { fetchCurrentKp, fetchKpForecast, KpReading } from '../services/noaa';
import { auroraLatitudeBoundary, getVisibility, kpLabel } from '../utils/visibility';
import { getActiveCity } from '../storage/cities';
import { GeoCity } from '../services/geocoding';

const SCREEN_W = Dimensions.get('window').width;
const CHART_W  = SCREEN_W - 56;
const CHART_H  = 168;
const SERIF = Platform.OS === 'ios' ? 'Georgia'    : 'serif';
const MONO  = Platform.OS === 'ios' ? 'Menlo'      : 'monospace';

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

// Synthetic fallback series offsets (24 points: 8 history + 16 forecast)
const OFFSETS = [
  -0.4, -0.2,  0.1, -0.3,  0.0,  0.2, -0.1,  0.0,
   0.4,  0.2,  0.6,  0.9,  0.7,  0.4,  0.0, -0.3,
  -0.5, -0.3,  0.1,  0.3,  0.5,  0.2, -0.2, -0.4,
];
function clamp(v: number) { return Math.max(0, Math.min(9, v)); }

export default function ForecastScreen() {
  const [history,    setHistory]    = useState<KpReading[]>([]);
  const [forecast,   setForecast]   = useState<KpReading[]>([]);
  const [city,       setCity]       = useState<GeoCity | null>(null);
  const [latitude,   setLatitude]   = useState<number | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLocation = useCallback(async () => {
    const active = await getActiveCity();
    if (active) { setCity(active); setLatitude(active.latitude); return; }
    setCity(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    setLatitude(loc.coords.latitude);
  }, []);

  const loadData = useCallback(async () => {
    const [hist, fore] = await Promise.all([fetchCurrentKp(), fetchKpForecast()]);
    setHistory(hist.slice(-8));
    const now = Date.now();
    setForecast(fore.filter((r) => r.time.getTime() > now).slice(0, 16));
  }, []);

  useEffect(() => {
    Promise.allSettled([loadLocation(), loadData()]).finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { loadLocation(); }, [loadLocation]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([loadLocation(), loadData()]);
    setRefreshing(false);
  }, [loadLocation, loadData]);

  const currentKp = history.length > 0 ? history[history.length - 1].kp : 0;
  const C = pal(currentKp);

  // Combine history + forecast; fall back to synthetic series when no data yet
  const series = useMemo((): number[] => {
    if (history.length === 0) return OFFSETS.map(s => clamp(currentKp + s));
    return [...history.map(r => r.kp), ...forecast.map(r => r.kp)];
  }, [history, forecast, currentKp]);

  const nowIdx = history.length > 0 ? history.length - 1 : 7;
  const stepX  = series.length > 1 ? CHART_W / (series.length - 1) : CHART_W;

  const linePath = series.map((v, i) =>
    `${i === 0 ? 'M' : 'L'} ${i * stepX} ${CHART_H - (v / 9) * CHART_H}`
  ).join(' ');
  const areaPath = `${linePath} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;

  // Next 8 windows for the upcoming list
  const upcoming = useMemo(() => {
    const rows = forecast.slice(0, 8).map((r, i) => ({
      kp: r.kp,
      hour: (i + 1) * 3,
      vis: latitude != null ? getVisibility(r.kp, latitude) : null,
      peak: false,
    }));
    if (rows.length > 0) {
      const maxKp = Math.max(...rows.map(u => u.kp));
      rows.forEach(u => { u.peak = u.kp >= maxKp - 0.05; });
    }
    return rows;
  }, [forecast, latitude]);

  const peakForecast = forecast.length > 0
    ? Math.max(...forecast.map(r => r.kp)).toFixed(1)
    : currentKp.toFixed(1);

  const latBoundary = auroraLatitudeBoundary(currentKp);

  const locationLabel = city
    ? `${city.name} (${Math.abs(city.latitude).toFixed(1)}°N)`
    : latitude != null
    ? `${Math.abs(latitude).toFixed(1)}°${latitude >= 0 ? 'N' : 'S'} (GPS)`
    : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
    >
      {/* ── Editorial header ── */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={[styles.mono10, { color: C.text }]}>Forecast · 48 hours</Text>
          {loading && <ActivityIndicator size="small" color={C.accent} />}
        </View>
        <Text style={[styles.headline, { color: '#f8fafc' }]}>
          {'A ' + kpLabel(currentKp).toLowerCase() + ',\nthen a lull.'}
        </Text>
        <Text style={styles.headlineBody}>
          NOAA SWPC predicts activity peaking near{' '}
          <Text style={{ color: C.text, fontWeight: '500' }}>Kp {peakForecast}</Text>
          {' '}in the next 24 hours, then settling overnight tomorrow.
        </Text>
      </View>

      {/* ── Chart ── */}
      <View style={styles.chartSection}>
        <View style={styles.chartMeta}>
          <Text style={styles.mono10gray}>Planetary Kp</Text>
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: '#475569' }]} />
              <Text style={styles.legendLabel}>History</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: C.accent }]} />
              <Text style={styles.legendLabel}>Forecast</Text>
            </View>
          </View>
        </View>

        <Svg width={CHART_W} height={CHART_H + 36}>
          <Defs>
            <SvgGradient id="fc-area" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%"   stopColor={C.accent} stopOpacity="0.35" />
              <Stop offset="100%" stopColor={C.accent} stopOpacity="0" />
            </SvgGradient>
            <ClipPath id="fc-past">
              <Rect x={0} y={0} width={nowIdx * stepX} height={CHART_H} />
            </ClipPath>
            <ClipPath id="fc-future">
              <Rect x={nowIdx * stepX} y={0} width={CHART_W} height={CHART_H} />
            </ClipPath>
          </Defs>

          {/* Y-axis grid lines + labels */}
          {[1, 3, 5, 7, 9].map(k => {
            const y = CHART_H - (k / 9) * CHART_H;
            return (
              <G key={k}>
                <Line x1={0} y1={y} x2={CHART_W} y2={y}
                  stroke="#15151f" strokeWidth={0.5}
                  strokeDasharray={k === 5 ? undefined : '2 3'} />
                <SvgText x={CHART_W - 2} y={y - 3}
                  fontFamily={MONO} fontSize={8} fill="#334155" textAnchor="end">
                  Kp {k}
                </SvgText>
              </G>
            );
          })}

          {/* History portion — muted */}
          <G clipPath="url(#fc-past)">
            <Path d={areaPath} fill="#1e293b" opacity="0.35" />
            <Path d={linePath} fill="none" stroke="#475569" strokeWidth={1.2} />
          </G>

          {/* Forecast portion — accent */}
          <G clipPath="url(#fc-future)">
            <Path d={areaPath} fill="url(#fc-area)" />
            <Path d={linePath} fill="none" stroke={C.accent} strokeWidth={1.5}
              strokeLinecap="round" strokeLinejoin="round" />
          </G>

          {/* NOW dashed line */}
          <Line x1={nowIdx * stepX} y1={0} x2={nowIdx * stepX} y2={CHART_H}
            stroke={C.text} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
          <SvgText x={nowIdx * stepX + 6} y={12}
            fontFamily={MONO} fontSize={9} fill={C.text}>NOW</SvgText>

          {/* NOW dot */}
          <Circle
            cx={nowIdx * stepX}
            cy={CHART_H - (series[nowIdx] / 9) * CHART_H}
            r={3.5} fill={C.text} stroke="#020207" strokeWidth={1.5}
          />

          {/* X-axis labels */}
          {[
            { x: 0,                      label: '−24h', anchor: 'start'  },
            { x: nowIdx * stepX,         label: 'NOW',  anchor: 'middle' },
            { x: (nowIdx + 8) * stepX,   label: '+24h', anchor: 'middle' },
            { x: CHART_W,                label: '+48h', anchor: 'end'    },
          ].map((l, i) => (
            <SvgText key={i} x={l.x} y={CHART_H + 18}
              fontFamily={MONO} fontSize={9}
              fill={l.label === 'NOW' ? C.text : '#475569'}
              textAnchor={l.anchor as any}>
              {l.label}
            </SvgText>
          ))}
        </Svg>
      </View>

      {/* ── Section divider ── */}
      <View style={styles.divider} />

      {/* ── Upcoming windows ── */}
      <View style={styles.upcomingSection}>
        <Text style={[styles.mono10gray, { marginBottom: 18 }]}>Upcoming windows</Text>
        {upcoming.length === 0 && (
          <Text style={styles.emptyNote}>Forecast data loading…</Text>
        )}
        {upcoming.map((u, i) => {
          const dim = !u.vis || u.vis.label === 'No chance' || u.vis.label === 'Unlikely';
          const intPart  = Math.floor(u.kp);
          const decPart  = Math.round((u.kp - intPart) * 10);
          return (
            <View key={i} style={[
              styles.upcomingRow,
              i < upcoming.length - 1 && styles.upcomingBorder,
            ]}>
              <Text style={styles.hourLabel}>+{String(u.hour).padStart(2, '0')}H</Text>

              <View style={styles.kpBlock}>
                <View style={styles.kpNumRow}>
                  <Text style={[styles.kpInt, {
                    color: dim ? '#64748b' : '#f8fafc',
                    fontStyle: u.peak ? 'italic' : 'normal',
                  }]}>
                    {intPart}
                  </Text>
                  <Text style={[styles.kpDec, {
                    color: dim ? '#64748b' : '#f8fafc',
                    fontStyle: u.peak ? 'italic' : 'normal',
                  }]}>
                    .{decPart}
                  </Text>
                </View>
                <Text style={styles.kpDesc}>
                  {kpLabel(u.kp)}
                  {u.peak && (
                    <Text style={{ color: C.text }}> · peak</Text>
                  )}
                </Text>
              </View>

              <Text style={[styles.visLabel, { color: dim ? '#475569' : C.text }]}>
                {u.vis ? u.vis.label : '—'}
              </Text>
            </View>
          );
        })}
      </View>

      {/* ── Footer ── */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {locationLabel
            ? `Visibility evaluated for ${locationLabel}. Equatorward boundary tonight: ${latBoundary}°.`
            : `Equatorward aurora boundary tonight: ${latBoundary}°.`}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020207' },
  content:   { paddingBottom: 120 },

  header:       { paddingHorizontal: 28, paddingTop: 28, paddingBottom: 8 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headline: {
    fontFamily: SERIF, fontSize: 48, lineHeight: 46,
    letterSpacing: -1.7, fontStyle: 'italic', fontWeight: '400',
    color: '#f8fafc', marginBottom: 16,
  },
  headlineBody: {
    fontSize: 14, lineHeight: 22, color: '#94a3b8',
  },

  chartSection: { paddingHorizontal: 28, paddingTop: 28, paddingBottom: 8 },
  chartMeta:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 },
  chartLegend:  { flexDirection: 'row', gap: 18 },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine:   { width: 10, height: 1 },
  legendLabel:  { fontFamily: MONO, fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 },

  divider: { height: 1, backgroundColor: '#15151f', marginHorizontal: 28, marginTop: 24 },

  upcomingSection: { paddingHorizontal: 28, paddingTop: 24 },
  upcomingRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  upcomingBorder:{ borderBottomWidth: 1, borderBottomColor: '#15151f' },
  hourLabel:     { fontFamily: MONO, fontSize: 10, color: '#475569', width: 52 },
  kpBlock:       { flex: 1 },
  kpNumRow:      { flexDirection: 'row', alignItems: 'baseline' },
  kpInt:         { fontFamily: SERIF, fontSize: 28, lineHeight: 30, letterSpacing: -0.6 },
  kpDec:         { fontFamily: SERIF, fontSize: 18, lineHeight: 24, opacity: 0.55 },
  kpDesc:        { fontSize: 11, color: '#475569', marginTop: 3 },
  visLabel:      { fontFamily: MONO, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', textAlign: 'right' },
  emptyNote:     { color: '#334155', fontSize: 13, fontStyle: 'italic' },

  footer:     { paddingHorizontal: 28, paddingVertical: 20, borderTopWidth: 1, borderTopColor: '#15151f', marginTop: 8 },
  footerText: { fontFamily: SERIF, fontSize: 13, color: '#475569', fontStyle: 'italic' },

  mono10:     { fontFamily: MONO, fontSize: 10, letterSpacing: 2.2, textTransform: 'uppercase' },
  mono10gray: { fontFamily: MONO, fontSize: 10, letterSpacing: 2.2, textTransform: 'uppercase', color: '#475569' },
});
