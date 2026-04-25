import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { NavigationContainer, BottomTabBarProps } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import HomeScreen from './src/screens/HomeScreen';
import ForecastScreen from './src/screens/ForecastScreen';
import MapScreen from './src/screens/MapScreen';
import SplashScreen from './src/screens/SplashScreen';

const Tab = createBottomTabNavigator();

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

// Accent colors: fixed emerald (matches editorial palette default)
const C_ACCENT   = '#10b981';
const C_ACTIVE   = '#6ee7b7';
const C_INACTIVE = '#475569';

function EditorialTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  return (
    <View style={styles.tabBarWrapper} pointerEvents="box-none">
      <LinearGradient
        colors={['rgba(2,2,7,0)', 'rgba(2,2,7,0.85)', 'rgba(2,2,7,0.98)']}
        locations={[0, 0.3, 0.6]}
        style={[styles.tabBarGradient, { paddingBottom: insets.bottom + 12 }]}
        pointerEvents="box-none"
      >
        <View style={styles.tabRow}>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const { options } = descriptors[route.key];
            const label =
              options.tabBarLabel !== undefined
                ? options.tabBarLabel
                : route.name;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <TouchableOpacity
                key={route.key}
                onPress={onPress}
                style={styles.tabItem}
                activeOpacity={0.7}
              >
                {/* Active indicator — thin line above label */}
                <View
                  style={[
                    styles.indicator,
                    {
                      width: isFocused ? 22 : 0,
                      backgroundColor: C_ACCENT,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isFocused ? C_ACTIVE : C_INACTIVE },
                  ]}
                >
                  {typeof label === 'string' ? label : route.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>
    </View>
  );
}

const NAV_THEME = {
  dark: true,
  colors: {
    primary: C_ACCENT,
    background: '#020209',
    card: '#020209',
    text: '#f8fafc',
    border: '#1c1c3e',
    notification: C_ACCENT,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium:  { fontFamily: 'System', fontWeight: '500' as const },
    bold:    { fontFamily: 'System', fontWeight: '700' as const },
    heavy:   { fontFamily: 'System', fontWeight: '900' as const },
  },
};

function AppContent() {
  const [splashDone, setSplashDone] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <NavigationContainer theme={NAV_THEME}>
        <StatusBar style="light" />
        <Tab.Navigator
          tabBar={(props) => <EditorialTabBar {...props} />}
          screenOptions={{ headerShown: false }}
          sceneContainerStyle={{ paddingTop: insets.top }}
        >
          <Tab.Screen name="Home"     component={HomeScreen}     options={{ title: 'Aurora Light' }} />
          <Tab.Screen name="Forecast" component={ForecastScreen} />
          <Tab.Screen name="Map"      component={MapScreen} />
        </Tab.Navigator>
      </NavigationContainer>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020207',
  },
  // Absolutely positioned so the tab bar overlaps screen content
  tabBarWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabBarGradient: {
    paddingTop: 28,
  },
  tabRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#15151f',
    paddingTop: 14,
    marginHorizontal: 28,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
  },
  indicator: {
    height: 1,
    marginBottom: 10,
  },
  tabLabel: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
