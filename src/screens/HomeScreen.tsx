import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl,
  ActivityIndicator, Dimensions, TouchableOpacity, Modal, Platform,
  StyleSheet,
} from 'react-native';
import Svg, {
  Path, Defs, LinearGradient as SvgGrad, RadialGradient as SvgRadial,
  Stop, Circle, Line, Text as SvgText, Rect,
} from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { fetchCurrentKp, fetchSolarWind, fetchKpForecast, KpReading, SolarWind } from '../services/noaa';
import { getVisibility, kpLabel, auroraLatitudeBoundary } from '../utils/visibility';
import { getActiveCity } from '../storage/cities';

// ─── Constants ───────────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HERO_H = Math.min(500, Math.round(SCREEN_H * 0.60));

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO  = Platform.OS === 'ios' ? 'Menlo'   : 'monospace';

const SKYLINE_PATH =
  'M 0 100 L 0 82 L 22 82 L 22 73 L 38 73 L 38 63 L 52 63 L 52 51 ' +
  'L 60 51 L 60 39 L 68 39 L 68 25 L 72 25 L 72 17 L 74 17 ' +
  'L 74 8 L 76 8 L 76 3 L 78 3 L 78 8 L 80 8 ' +
  'L 80 17 L 82 17 L 82 25 L 86 25 ' +
  'L 86 35 L 94 35 L 94 27 L 106 27 ' +
  'L 106 39 L 116 39 L 116 31 L 128 31 ' +
  'L 128 47 L 140 47 L 140 37 L 154 37 ' +
  'L 154 51 L 166 51 L 166 41 L 178 41 ' +
  'L 178 57 L 192 57 L 192 47 L 206 47 ' +
  'L 206 63 L 222 63 L 222 73 L 240 73 ' +
  'L 240 81 L 260 81 L 260 88 L 284 88 ' +
  'L 284 93 L 316 93 L 316 96 L 356 96 ' +
  'L 356 100 L 400 100 Z';

const HOTSPOTS = [
  { name: 'Svalbard',    country: 'Norway',      lat:  78.2 },
  { name: 'Tromsø',      country: 'Norway',      lat:  69.6 },
  { name: 'Abisko',      country: 'Sweden',      lat:  68.4 },
  { name: 'Fairbanks',   country: 'Alaska',      lat:  64.8 },
  { name: 'Reykjavik',   country: 'Iceland',     lat:  64.1 },
  { name: 'Yellowknife', country: 'Canada',      lat:  62.5 },
  { name: 'Anchorage',   country: 'Alaska',      lat:  61.2 },
  { name: 'Whitehorse',  country: 'Canada',      lat:  60.7 },
  { name: 'Inverness',   country: 'Scotland',    lat:  57.5 },
  { name: 'Ushuaia',     country: 'Argentina',   lat: -54.8 },
  { name: 'Dunedin',     country: 'New Zealand', lat: -45.9 },
  { name: 'Hobart',      country: 'Australia',   lat: -42.9 },
];

const LEVEL_ORDER: Record<string, number> = { extreme: 4, high: 3, medium: 2, low: 1, none: 0 };

// ─── Stars (deterministic, module-level) ─────────────────────────────────────

const STARS = (() => {
  const out: { x: number; y: number; r: number; o: number }[] = [];
  let s = 11;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < 90; i++) {
    out.push({
      x: rand() * 100,
      y: rand() * 65,
      r: rand() < 0.92 ? 0.5 + rand() * 0.6 : 1 + rand() * 0.8,
      o: 0.25 + rand() * 0.7,
    });
  }
  return out;
})();

// ─── Color palette ───────────────────────────────────────────────────────────

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

function skyColors(kp: number): readonly [string, string, string] {
  const c = pal(kp);
  return [`${c.glow}44`, '#04040a', '#020207'];
}

// ─── Ribbon path helper ───────────────────────────────────────────────────────

function ribbonPath(w: number, h: number, yOffset: number, amp: number, phase: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 7; i++)
    pts.push([(i / 7) * w, yOffset + Math.sin((i / 7) * Math.PI * 2 + phase) * amp]);
  let d = `M ${-20} ${pts[0][1]} `;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    d += `Q ${x1} ${y1}, ${(x1 + x2) / 2} ${(y1 + y2) / 2} `;
  }
  d += `T ${w + 20} ${pts[pts.length - 1][1]} `;
  d += `L ${w + 20} ${pts[pts.length - 1][1] + 60 + amp} `;
  for (let i = pts.length - 1; i >= 0; i--)
    d += `L ${pts[i][0]} ${pts[i][1] + 60 + amp * 0.6} `;
  d += `L ${-20} ${pts[0][1] + 60 + amp} Z`;
  return d;
}

// ─── Live map HTML ────────────────────────────────────────────────────────────

const LIVE_MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#020209}
#map{width:100%;height:100%}
.leaflet-container{background:#020209}
.leaflet-bar a{background:#0b0b1e!important;color:#8b5cf6!important;border-color:#1c1c3e!important}
#status{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  color:#8b5cf6;font-family:sans-serif;font-size:13px;z-index:1000;text-align:center;
  background:#030314;padding:16px 22px;border-radius:10px;border:1px solid #1c1c3e}
</style>
</head>
<body>
<p id="status">Loading aurora data…</p>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
<script>
var map=L.map('map',{center:[70,0],zoom:2,minZoom:1,maxZoom:8,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:19}).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:19,opacity:0.6}).addTo(map);
fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json')
  .then(function(r){return r.json();})
  .then(function(d){
    document.getElementById('status').style.display='none';
    var pts=[],coords=d.coordinates||[];
    for(var i=0;i<coords.length;i++){
      var lon=coords[i][0],lat=coords[i][1],p=coords[i][2];
      if(p>2) pts.push([lat,lon,p/100]);
    }
    L.heatLayer(pts,{radius:10,blur:8,maxZoom:8,max:1,
      gradient:{0:'#065f46',0.15:'#10b981',0.35:'#34d399',0.55:'#fbbf24',0.75:'#f97316',1:'#ef4444'}
    }).addTo(map);
  })
  .catch(function(){document.getElementById('status').textContent='Could not load aurora data';});
</script>
</body>
</html>`;

// ─── Divider ──────────────────────────────────────────────────────────────────

function Divider() {
  return <View style={{ height: 1, backgroundColor: '#15151f', marginHorizontal: 28 }} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HomeScreen() {
  const [readings, setReadings]       = useState<KpReading[]>([]);
  const [forecast, setForecast]       = useState<KpReading[]>([]);
  const [solarWind, setSolarWind]     = useState<SolarWind | null>(null);
  const [location, setLocation]       = useState<{ lat: number; lon: number } | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);

  const requestLocation = async () => {
    const active = await getActiveCity();
    if (active) {
      setLocation({ lat: active.latitude, lon: active.longitude });
      setLocationName(active.name);
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setLocationName(null); return; }
    const loc = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = loc.coords;
    setLocation({ lat: latitude, lon: longitude });
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const name = [place.city || place.subregion, place.region, place.country]
        .filter(Boolean).slice(0, 2).join(', ');
      setLocationName(name || null);
    } catch { setLocationName(null); }
  };

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [kp, wind, fore] = await Promise.all([
        fetchCurrentKp(),
        fetchSolarWind(),
        fetchKpForecast(),
      ]);
      setReadings(kp);
      setSolarWind(wind);
      setForecast(fore.filter(r => r.time.getTime() > Date.now()).slice(0, 8));
    } catch {
      setError('Failed to load space weather data. Pull to retry.');
    }
  }, []);

  useEffect(() => {
    Promise.allSettled([requestLocation(), loadData()]).finally(() => setDataLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { requestLocation(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([requestLocation(), loadData()]);
    setRefreshing(false);
  }, [loadData]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const current   = readings[readings.length - 1] ?? null;
  const kp        = current?.kp ?? 0;
  const c         = pal(kp);
  const vis       = location ? getVisibility(kp, location.lat) : null;
  const intensity = Math.min(1, Math.max(0.18, kp / 9));
  const lat       = location?.lat ?? 0;

  const bestSpots = HOTSPOTS
    .map(s => ({ ...s, vis: getVisibility(kp, s.lat) }))
    .sort((a, b) => {
      const ld = LEVEL_ORDER[b.vis.level] - LEVEL_ORDER[a.vis.level];
      return ld !== 0 ? ld : Math.abs(b.lat) - Math.abs(a.lat);
    })
    .slice(0, 5);

  // ── Forecast data ───────────────────────────────────────────────────────────

  const forecastData: number[] = forecast.length > 0
    ? forecast.map(r => r.kp)
    : [0, 0.3, -0.2, 0.6, 0.9, 0.4, -0.3, -0.5].map(s => Math.max(0, Math.min(9, kp + s)));

  // ── Aurora oval calculations ────────────────────────────────────────────────

  const mapW     = SCREEN_W - 56;
  const mapCx    = mapW / 2;
  const mapCy    = 100;
  const mapR     = Math.min(mapCx - 20, 88);
  const ovalBoundary = auroraLatitudeBoundary(kp);
  const ovalR    = mapR * (90 - ovalBoundary) / 50;

  // ── Forecast chart helpers ──────────────────────────────────────────────────

  const fcW      = SCREEN_W - 56;
  const fcChartH = 70;
  const fcTotalH = 70 + 20;
  const fcPtX    = (i: number) => (i / (forecastData.length - 1)) * fcW;
  const fcPtY    = (v: number) => fcChartH - (v / 9) * fcChartH;

  let fcLinePath = '';
  let fcAreaPath = '';
  if (forecastData.length > 0) {
    const pts = forecastData.map((v, i) => [fcPtX(i), fcPtY(v)] as [number, number]);
    fcLinePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
    fcAreaPath =
      `M ${pts[0][0]} ${fcChartH} ` +
      pts.map(([x, y]) => `L ${x} ${y}`).join(' ') +
      ` L ${pts[pts.length - 1][0]} ${fcChartH} Z`;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#020207' }}
        contentContainerStyle={{ paddingBottom: 0 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />
        }
      >
        {/* ══════════════════════════════════════════════════════════════
            HERO
        ══════════════════════════════════════════════════════════════ */}
        <View style={{ width: SCREEN_W, height: HERO_H, overflow: 'hidden' }}>

          {/* Layer 1 — sky gradient */}
          <LinearGradient
            colors={skyColors(kp)}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          {/* Layer 2 — stars */}
          <Svg
            width={SCREEN_W}
            height={HERO_H}
            viewBox="0 0 100 65"
            preserveAspectRatio="none"
            style={StyleSheet.absoluteFillObject as object}
          >
            {STARS.map((star, i) => (
              <Circle
                key={i}
                cx={star.x}
                cy={star.y}
                r={star.r * 0.18}
                fill="#f8fafc"
                opacity={star.o}
              />
            ))}
          </Svg>

          {/* Layer 3 — aurora glow + ribbons */}
          <Svg
            width={SCREEN_W}
            height={HERO_H}
            style={[StyleSheet.absoluteFillObject as object, { mixBlendMode: 'screen' } as object]}
          >
            <Defs>
              {/* Ribbon gradient */}
              <SvgGrad id="rib-a" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={c.text} stopOpacity={0} />
                <Stop offset="25%" stopColor={c.accent} stopOpacity={1} />
                <Stop offset="100%" stopColor={c.glow} stopOpacity={0} />
              </SvgGrad>
              {/* Halo radial gradient */}
              <SvgRadial id="halo" cx="50%" cy="45%" rx="60%" ry="50%">
                <Stop offset="0%"   stopColor={`${c.glow}bb`} />
                <Stop offset="50%"  stopColor={`${c.glow}44`} />
                <Stop offset="100%" stopColor="transparent" />
              </SvgRadial>
            </Defs>
            {/* Halo rect */}
            <Rect
              x={0} y={0} width={SCREEN_W} height={HERO_H}
              fill="url(#halo)"
              opacity={0.6 + Math.min(1, kp / 9) * 0.3}
            />
            {/* Ribbon 1 */}
            <Path
              d={ribbonPath(SCREEN_W, HERO_H, HERO_H * (200 / 560), HERO_H * (28 / 560), 0)}
              fill="url(#rib-a)"
              opacity={0.55 * intensity}
            />
            {/* Ribbon 2 */}
            <Path
              d={ribbonPath(SCREEN_W, HERO_H, HERO_H * (230 / 560), HERO_H * (38 / 560), 1.4)}
              fill="url(#rib-a)"
              opacity={0.40 * intensity}
            />
            {/* Ribbon 3 */}
            <Path
              d={ribbonPath(SCREEN_W, HERO_H, HERO_H * (268 / 560), HERO_H * (22 / 560), 2.7)}
              fill="url(#rib-a)"
              opacity={0.30 * intensity}
            />
          </Svg>

          {/* Layer 4 — skyline */}
          <Svg
            width={SCREEN_W}
            height={HERO_H * 0.22}
            viewBox="0 0 400 100"
            preserveAspectRatio="none"
            style={{ position: 'absolute', bottom: 0, left: 0 } as object}
          >
            <Path d={SKYLINE_PATH} fill="#020207" />
          </Svg>

          {/* Layer 5 — text overlay */}
          <View
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              justifyContent: 'space-between',
              paddingHorizontal: 28,
            }}
          >
            {/* Top row */}
            <View style={{ paddingTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 5, height: 5, borderRadius: 99, backgroundColor: c.accent }} />
              <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: '#cbd5e1' }}>
                {location
                  ? `${(locationName?.toUpperCase() ?? 'DETECTING…')} · ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`
                  : (locationName?.toUpperCase() ?? 'DETECTING…')}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontFamily: MONO, fontSize: 10, color: '#475569', letterSpacing: 1.5 }}>
                TONIGHT
              </Text>
            </View>

            {/* Bottom block */}
            <View style={{ paddingBottom: HERO_H * 0.22 + 16 }}>
              {/* Mono index line */}
              <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: c.text, marginBottom: 14 }}>
                {`\u2116 ${String(Math.round(kp * 10)).padStart(3, '0')} \u00B7 ${kpLabel(kp)}`}
              </Text>
              {/* Big headline */}
              {vis ? (
                <Text
                  style={{
                    fontFamily: SERIF,
                    fontStyle: 'italic',
                    fontWeight: '300',
                    fontSize: vis.label.length > 8 ? 60 : 72,
                    lineHeight: (vis.label.length > 8 ? 60 : 72) * 0.92,
                    letterSpacing: -1.5,
                    color: '#f8fafc',
                  }}
                >
                  {vis.label}.
                </Text>
              ) : (
                <Text
                  style={{
                    fontFamily: SERIF,
                    fontStyle: 'italic',
                    fontWeight: '300',
                    fontSize: 72,
                    lineHeight: 72 * 0.92,
                    letterSpacing: -1.5,
                    color: '#f8fafc',
                  }}
                >
                  {'\u2014'}
                </Text>
              )}
              {/* Description */}
              {vis && (
                <Text style={{ fontSize: 14, lineHeight: 14 * 1.5, color: '#cbd5e1', marginTop: 14, maxWidth: 300 }}>
                  {vis.description + ' The planetary index sits at '}
                  <Text style={{ color: c.text, fontWeight: '500' }}>Kp {kp.toFixed(1)}</Text>
                  {`, auroral oval reaching ${auroraLatitudeBoundary(kp)}\u00B0.`}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 1 — KP INDEX
        ══════════════════════════════════════════════════════════════ */}
        <View style={{ paddingVertical: 36, paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between' }}>
          {/* Left: big number */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
              <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: '#475569' }}>
                PLANETARY INDEX
              </Text>
              {dataLoading && (
                <ActivityIndicator size="small" color="#334155" style={{ marginLeft: 4 }} />
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text
                style={{
                  fontFamily: SERIF,
                  fontSize: 88,
                  lineHeight: 88 * 0.85,
                  letterSpacing: -3,
                  color: c.text,
                }}
              >
                {Math.floor(kp)}
              </Text>
              <Text
                style={{
                  fontFamily: SERIF,
                  fontSize: 36,
                  lineHeight: 36,
                  color: c.text,
                  opacity: 0.55,
                }}
              >
                {`.${Math.round((kp % 1) * 10)}`}
              </Text>
            </View>
          </View>

          {/* Right: threshold bars */}
          <View style={{ paddingTop: 28, gap: 5, alignItems: 'flex-end' }}>
            {[9, 7, 5, 3, 1].map(t => (
              <View
                key={t}
                style={{ flexDirection: 'row', gap: 8, opacity: kp >= t ? 1 : 0.3, alignItems: 'center' }}
              >
                <Text
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: kp >= t ? c.text : '#475569',
                    width: 14,
                    textAlign: 'right',
                  }}
                >
                  {t}
                </Text>
                <View
                  style={{
                    height: 2,
                    width: kp >= t ? 28 : 14,
                    backgroundColor: kp >= t ? c.accent : '#1e293b',
                  }}
                />
              </View>
            ))}
          </View>
        </View>

        <Divider />

        {/* ══════════════════════════════════════════════════════════════
            SECTION 2 — FORECAST STRIP
        ══════════════════════════════════════════════════════════════ */}
        <View style={{ paddingVertical: 20, paddingHorizontal: 28 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: '#475569' }}>
              TONIGHT & TOMORROW
            </Text>
            <Text style={{ fontFamily: MONO, fontSize: 9, color: '#475569' }}>24H →</Text>
          </View>

          {/* SVG area chart */}
          <Svg width={fcW} height={fcTotalH}>
            <Defs>
              <SvgGrad id="fc-area" x1="0" y1="0" x2="0" y2="1">
                <Stop stopColor={c.accent} stopOpacity="0.45" />
                <Stop offset="1" stopColor={c.accent} stopOpacity="0" />
              </SvgGrad>
            </Defs>
            {/* Gridlines */}
            <Line
              x1={0} y1={fcChartH - (3 / 9) * fcChartH}
              x2={fcW} y2={fcChartH - (3 / 9) * fcChartH}
              stroke="#15151f" strokeWidth={1} strokeDasharray="2,3"
            />
            <Line
              x1={0} y1={fcChartH - (5 / 9) * fcChartH}
              x2={fcW} y2={fcChartH - (5 / 9) * fcChartH}
              stroke="#15151f" strokeWidth={1} strokeDasharray="2,3"
            />
            {/* Area */}
            <Path d={fcAreaPath} fill="url(#fc-area)" />
            {/* Line */}
            <Path d={fcLinePath} fill="none" stroke={c.accent} strokeWidth={1.5} />
            {/* Dots */}
            {forecastData.map((v, i) => (
              <Circle
                key={i}
                cx={fcPtX(i)}
                cy={fcPtY(v)}
                r={i === 0 ? 3 : 2}
                fill={i === 0 ? c.text : c.accent}
              />
            ))}
            {/* Time labels */}
            {forecastData.length > 0 && (
              <>
                <SvgText
                  x={fcPtX(0)}
                  y={fcTotalH}
                  fontFamily={MONO}
                  fontSize={9}
                  fill="#475569"
                  textAnchor="start"
                >
                  NOW
                </SvgText>
                <SvgText
                  x={fcPtX(Math.floor(forecastData.length / 2))}
                  y={fcTotalH}
                  fontFamily={MONO}
                  fontSize={9}
                  fill="#475569"
                  textAnchor="middle"
                >
                  {`+${Math.floor(forecastData.length / 2) * 3}h`}
                </SvgText>
                <SvgText
                  x={fcPtX(forecastData.length - 1)}
                  y={fcTotalH}
                  fontFamily={MONO}
                  fontSize={9}
                  fill="#475569"
                  textAnchor="end"
                >
                  {`+${(forecastData.length - 1) * 3}h`}
                </SvgText>
              </>
            )}
          </Svg>
        </View>

        <Divider />

        {/* ══════════════════════════════════════════════════════════════
            SECTION 3 — SOLAR WIND
        ══════════════════════════════════════════════════════════════ */}
        <View style={{ paddingVertical: 20, paddingHorizontal: 28 }}>
          <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: '#475569', marginBottom: 16 }}>
            SOLAR WIND
          </Text>

          {solarWind ? (
            <>
              {/* 2×2 grid */}
              <View style={{ flexDirection: 'row' }}>
                {/* Speed */}
                <View style={{ flex: 1, paddingRight: 20, paddingBottom: 20, borderRightWidth: 1, borderRightColor: '#15151f', borderBottomWidth: 1, borderBottomColor: '#15151f' }}>
                  <Text style={{ fontFamily: MONO, fontSize: 9, color: '#475569', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Speed</Text>
                  <Text style={{ fontFamily: SERIF, fontSize: 28, letterSpacing: -0.5, color: '#f8fafc' }}>
                    {solarWind.speed.toFixed(0)}
                  </Text>
                  <Text style={{ fontFamily: MONO, fontSize: 10, color: '#475569' }}>km/s</Text>
                </View>
                {/* Density */}
                <View style={{ flex: 1, paddingLeft: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#15151f' }}>
                  <Text style={{ fontFamily: MONO, fontSize: 9, color: '#475569', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Density</Text>
                  <Text style={{ fontFamily: SERIF, fontSize: 28, letterSpacing: -0.5, color: '#f8fafc' }}>
                    {solarWind.density.toFixed(1)}
                  </Text>
                  <Text style={{ fontFamily: MONO, fontSize: 10, color: '#475569' }}>p/cm³</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row' }}>
                {/* Bt */}
                <View style={{ flex: 1, paddingRight: 20, paddingTop: 20, borderRightWidth: 1, borderRightColor: '#15151f' }}>
                  <Text style={{ fontFamily: MONO, fontSize: 9, color: '#475569', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Bt</Text>
                  <Text style={{ fontFamily: SERIF, fontSize: 28, letterSpacing: -0.5, color: '#f8fafc' }}>
                    {solarWind.bt.toFixed(1)}
                  </Text>
                  <Text style={{ fontFamily: MONO, fontSize: 10, color: '#475569' }}>nT</Text>
                </View>
                {/* Bz */}
                <View style={{ flex: 1, paddingLeft: 20, paddingTop: 20 }}>
                  <Text style={{ fontFamily: MONO, fontSize: 9, color: '#475569', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Bz</Text>
                  <Text
                    style={{
                      fontFamily: SERIF,
                      fontStyle: 'italic',
                      fontSize: 28,
                      letterSpacing: -0.5,
                      color: solarWind.bz < -5 ? c.text : solarWind.bz > 5 ? c.text : '#f8fafc',
                    }}
                  >
                    {`${solarWind.bz > 0 ? '+' : ''}${solarWind.bz.toFixed(1)}`}
                  </Text>
                  <Text style={{ fontFamily: MONO, fontSize: 10, color: '#475569' }}>nT</Text>
                </View>
              </View>
              {/* Bz note */}
              <Text style={{ fontStyle: 'italic', fontSize: 12, color: '#64748b', marginTop: 14 }}>
                {solarWind.bz < -5
                  ? '\u2193 Southward Bz \u2014 enhances aurora activity'
                  : solarWind.bz > 5
                  ? '\u2191 Northward Bz \u2014 suppresses aurora'
                  : 'Bz near neutral'}
              </Text>
            </>
          ) : (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#334155" />
            </View>
          )}
        </View>

        <Divider />

        {/* ══════════════════════════════════════════════════════════════
            SECTION 4 — POLAR MAP PREVIEW
        ══════════════════════════════════════════════════════════════ */}
        <View style={{ paddingVertical: 20, paddingHorizontal: 28 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: '#475569' }}>
              AURORA OVAL — NORTHERN
            </Text>
            <TouchableOpacity onPress={() => setMapFullscreen(true)}>
              <Text style={{ fontFamily: MONO, fontSize: 9, color: c.text, letterSpacing: 2 }}>
                ↗ EXPAND
              </Text>
            </TouchableOpacity>
          </View>

          {/* Polar map SVG */}
          <Svg
            width={mapW}
            height={220}
            viewBox={`0 0 ${mapW} 220`}
            style={{ borderWidth: 1, borderColor: '#15151f', backgroundColor: '#02020a' } as object}
          >
            {/* Concentric rings */}
            <Circle cx={mapCx} cy={mapCy} r={mapR} fill="none" stroke="#15151f" strokeWidth={0.5} />
            <Circle cx={mapCx} cy={mapCy} r={mapR * 0.7} fill="none" stroke="#15151f" strokeWidth={0.5} strokeDasharray="2,3" />
            <Circle cx={mapCx} cy={mapCy} r={mapR * 0.45} fill="none" stroke="#15151f" strokeWidth={0.5} strokeDasharray="2,3" />
            <Circle cx={mapCx} cy={mapCy} r={mapR * 0.22} fill="none" stroke="#15151f" strokeWidth={0.5} strokeDasharray="2,3" />
            {/* Meridian lines */}
            {[0, 30, 60, 90, 120, 150].map(deg => {
              const rad = (deg * Math.PI) / 180;
              return (
                <Line
                  key={deg}
                  x1={mapCx + mapR * Math.cos(rad)}
                  y1={mapCy + mapR * Math.sin(rad)}
                  x2={mapCx - mapR * Math.cos(rad)}
                  y2={mapCy - mapR * Math.sin(rad)}
                  stroke="#15151f"
                  strokeWidth={0.5}
                  strokeDasharray="2,3"
                />
              );
            })}
            {/* Pole */}
            <Circle cx={mapCx} cy={mapCy} r={2} fill="#475569" />
            {/* Aurora oval */}
            <Circle
              cx={mapCx}
              cy={mapCy}
              r={ovalR}
              fill="none"
              stroke={c.accent}
              strokeWidth={1.5}
              opacity={0.6 + intensity * 0.4}
            />
            {/* Compass labels */}
            <SvgText x={mapCx} y={mapCy - mapR - 6} fontFamily={MONO} fontSize={9} fill="#475569" textAnchor="middle">N</SvgText>
            <SvgText x={mapCx + mapR + 8} y={mapCy + 3} fontFamily={MONO} fontSize={9} fill="#475569" textAnchor="start">E</SvgText>
            <SvgText x={mapCx - mapR - 8} y={mapCy + 3} fontFamily={MONO} fontSize={9} fill="#475569" textAnchor="end">W</SvgText>
            {/* Bottom captions */}
            <SvgText x={0} y={215} fontFamily={MONO} fontSize={9} fill="#475569" textAnchor="start">
              {`BOUNDARY — ${ovalBoundary}\u00B0 LAT`}
            </SvgText>
            <SvgText
              x={mapW}
              y={215}
              fontFamily={MONO}
              fontSize={9}
              fill={c.text}
              textAnchor="end"
              onPress={() => setMapFullscreen(true)}
            >
              ↗ EXPAND
            </SvgText>
          </Svg>
        </View>

        <Divider />

        {/* ══════════════════════════════════════════════════════════════
            SECTION 5 — BEST VANTAGE POINTS
        ══════════════════════════════════════════════════════════════ */}
        <View style={{ paddingVertical: 20, paddingHorizontal: 28 }}>
          <Text style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: '#475569', marginBottom: 4 }}>
            BEST VANTAGE POINTS
          </Text>
          {bestSpots.map((spot, i) => {
            const dim = spot.vis.level === 'none' || spot.vis.level === 'low';
            return (
              <View
                key={spot.name}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 14,
                  borderBottomWidth: i < bestSpots.length - 1 ? 1 : 0,
                  borderBottomColor: '#15151f',
                }}
              >
                <Text style={{ fontFamily: MONO, fontSize: 10, color: '#475569', width: 24 }}>
                  {`0${i + 1}`}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: -0.5, color: dim ? '#64748b' : '#f8fafc' }}>
                    {spot.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                    {`${spot.country} \u00B7 ${Math.abs(spot.lat).toFixed(1)}\u00B0${spot.lat >= 0 ? 'N' : 'S'}`}
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: dim ? '#475569' : c.text,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    textAlign: 'right',
                  }}
                >
                  {spot.vis.label}
                </Text>
              </View>
            );
          })}
        </View>

        <Divider />

        {/* ══════════════════════════════════════════════════════════════
            FOOTER
        ══════════════════════════════════════════════════════════════ */}
        <View style={{ paddingHorizontal: 28, paddingTop: 24, paddingBottom: 60 }}>
          <Text style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: '#475569' }}>
            Aurora Light
          </Text>
          <Text style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 3, color: '#1e293b', marginTop: 6, textTransform: 'uppercase' }}>
            {`DATA \u2014 NOAA SWPC \u00B7 ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`}
          </Text>
          {error && (
            <Text style={{ color: '#ef4444', fontSize: 13, marginTop: 16, fontStyle: 'italic' }}>
              {error}
            </Text>
          )}
        </View>
      </ScrollView>

      {/* ══════════════════════════════════════════════════════════════
          FULLSCREEN MAP MODAL
      ══════════════════════════════════════════════════════════════ */}
      <Modal visible={mapFullscreen} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#020209' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#0d0d20',
            }}
          >
            <Text style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 16, color: '#f8fafc' }}>
              Aurora Map · Live
            </Text>
            <TouchableOpacity onPress={() => setMapFullscreen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontFamily: MONO, fontSize: 12, color: c.text, letterSpacing: 1 }}>
                ✕ CLOSE
              </Text>
            </TouchableOpacity>
          </View>
          <WebView
            source={{ html: LIVE_MAP_HTML }}
            style={{ flex: 1 }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

