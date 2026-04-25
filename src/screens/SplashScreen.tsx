import React, { useEffect, useRef, useMemo } from 'react';
import {
  View, Text, Animated, StyleSheet, Dimensions, Platform,
} from 'react-native';
import Svg, { Circle, Path, Defs, LinearGradient as SvgLinearGradient,
  RadialGradient, Stop, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

const { width: W, height: H } = Dimensions.get('window');
const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const MONO  = Platform.OS === 'ios' ? 'Menlo'   : 'monospace';

// Emerald active palette (matches design's default)
const C = { glow: '#0e6b4a', accent: '#10b981', text: '#6ee7b7' };

// 130 stars, LCG seed=23
const STARS = (() => {
  const out: { x: number; y: number; r: number; o: number }[] = [];
  let s = 23;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < 130; i++) {
    out.push({
      x: rand() * 100,
      y: rand() * 100,
      r: rand() < 0.92 ? 0.4 + rand() * 0.6 : 1 + rand() * 0.9,
      o: 0.2 + rand() * 0.8,
    });
  }
  return out;
})();

// Aurora ribbon path — scaled from design W=402, H=874 to device dimensions
function ribbonPath(yOff: number, amp: number, phase: number): string {
  // yOff and amp are in design coords (H=874); scale to device
  const y0 = (yOff / 874) * H;
  const a  = (amp  / 874) * H;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 7; i++) {
    pts.push([(i / 7) * W, y0 + Math.sin((i / 7) * Math.PI * 2 + phase) * a]);
  }
  let d = `M ${-20} ${pts[0][1]} `;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    d += `Q ${x1} ${y1}, ${(x1 + x2) / 2} ${(y1 + y2) / 2} `;
  }
  d += `T ${W + 20} ${pts[pts.length - 1][1]} `;
  d += `L ${W + 20} ${pts[pts.length - 1][1] + 60 + a} `;
  for (let i = pts.length - 1; i >= 0; i--)
    d += `L ${pts[i][0]} ${pts[i][1] + 60 + a * 0.6} `;
  d += `L ${-20} ${pts[0][1] + 60 + a} Z`;
  return d;
}

interface Props { onDone: () => void }

export default function SplashScreen({ onDone }: Props) {
  const fadeOut  = useRef(new Animated.Value(1)).current;
  const barShift = useRef(new Animated.Value(0)).current;

  // ribbon paths (memoized — static geometry)
  const r1 = useMemo(() => ribbonPath(360, 36, 0),   []);
  const r2 = useMemo(() => ribbonPath(420, 28, 1.6), []);
  const r3 = useMemo(() => ribbonPath(480, 20, 3.0), []);

  useEffect(() => {
    // Scanning bar: left: -40% → 100% of bar width, 2.4s, loops until fade
    const barLoop = Animated.loop(
      Animated.timing(barShift, {
        toValue: 1,
        duration: 2400,
        useNativeDriver: true,
      })
    );
    barLoop.start();

    // Fade out after 2.6s, call onDone after animation
    const timer = setTimeout(() => {
      barLoop.stop();
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start(() => onDone());
    }, 2600);

    return () => {
      clearTimeout(timer);
      barLoop.stop();
    };
  }, []);

  // Bar moves from -40% to 100% of its container width
  // Container width = W - 56 (left+right 28px padding)
  const BAR_W = W - 56;
  const barTranslateX = barShift.interpolate({
    inputRange: [0, 1],
    outputRange: [-BAR_W * 0.4, BAR_W * 1.0],
  });

  const haloTop = H * 0.38;

  return (
    <Animated.View style={[styles.root, { opacity: fadeOut }]}>
      {/* Sky gradient */}
      <LinearGradient
        colors={[`${C.glow}33`, '#04040a', '#020207']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Stars — full screen */}
      <Svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
        {STARS.map((st, i) => (
          <Circle
            key={i}
            cx={st.x}
            cy={st.y}
            r={st.r * 0.18}
            fill="#f8fafc"
            opacity={st.o}
          />
        ))}
      </Svg>

      {/* Aurora glow halo */}
      <View style={[styles.halo, { top: haloTop, backgroundColor: `${C.glow}99` }]} />

      {/* Aurora ribbons */}
      <Svg
        width={W} height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={[StyleSheet.absoluteFill, { mixBlendMode: 'screen' } as any]}
      >
        <Defs>
          <SvgLinearGradient id="rib" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%"   stopColor={C.text}   stopOpacity="0" />
            <Stop offset="20%"  stopColor={C.accent} stopOpacity="1" />
            <Stop offset="100%" stopColor={C.glow}   stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Path d={r1} fill="url(#rib)" opacity="0.55" />
        <Path d={r2} fill="url(#rib)" opacity="0.45" />
        <Path d={r3} fill="url(#rib)" opacity="0.30" />
      </Svg>

      {/* Top frame mark */}
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <View style={[styles.dot, { backgroundColor: C.accent, shadowColor: C.accent }]} />
          <Text style={[styles.mono10, { color: C.text }]}>
            64.1°N · REYKJAVÍK
          </Text>
        </View>
        <Text style={[styles.mono10, { color: '#475569' }]}>EDITION 0.1</Text>
      </View>

      {/* Center wordmark */}
      <View style={styles.center}>
        <Text style={[styles.mono10, { color: C.text, marginBottom: 22 }]}>
          A FIELD GUIDE TO THE AURORA
        </Text>
        <Text style={[styles.wordmark, { color: '#f8fafc' }]}>
          {'Aurora\nLight.'}
        </Text>
        <View style={styles.ornament}>
          <View style={[styles.rule, { backgroundColor: C.accent }]} />
          <Text style={[styles.mono10, { color: '#94a3b8' }]}>Lat. 50°–80°</Text>
          <View style={[styles.rule, { backgroundColor: C.accent }]} />
        </View>
      </View>

      {/* Bottom: loading bar + quote */}
      <View style={styles.bottom}>
        <View style={styles.barLabels}>
          <Text style={[styles.mono9, { color: '#475569' }]}>READING SKY</Text>
          <Text style={[styles.mono9, { color: C.text }]}>NOAA SWPC</Text>
        </View>
        <View style={styles.barTrack}>
          <Animated.View
            style={[
              styles.barFill,
              {
                backgroundColor: C.accent,
                shadowColor: C.accent,
                transform: [{ translateX: barTranslateX }],
              },
            ]}
          />
        </View>
        <Text style={styles.quote}>
          "The night sky is never the same twice."
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#020207',
    zIndex: 1000,
  },
  halo: {
    position: 'absolute',
    left: '-25%' as any,
    right: '-25%' as any,
    height: 360,
    borderRadius: 180,
    opacity: 0.45,
  },
  topRow: {
    position: 'absolute',
    top: 64,
    left: 28, right: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 5, height: 5,
    borderRadius: 99,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 4,
  },
  center: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    zIndex: 2,
  },
  wordmark: {
    fontFamily: SERIF,
    fontSize: 92,
    lineHeight: 83, // 0.9 * 92
    letterSpacing: -4,
    fontWeight: '400',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  ornament: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 28,
  },
  rule: {
    width: 28,
    height: 1,
  },
  bottom: {
    position: 'absolute',
    left: 28, right: 28, bottom: 56,
    zIndex: 2,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  barTrack: {
    height: 1,
    backgroundColor: '#15151f',
    overflow: 'hidden',
  },
  barFill: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: '40%',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 5,
  },
  quote: {
    marginTop: 22,
    fontFamily: SERIF,
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  mono10: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  mono9: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
