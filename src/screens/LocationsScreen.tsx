import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { searchCities, GeoCity } from '../services/geocoding';
import { getSavedCities, saveCity, removeCity, getActiveCity, setActiveCity } from '../storage/cities';

export default function LocationsScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoCity[]>([]);
  const [saved, setSaved] = useState<GeoCity[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSaved = useCallback(async () => {
    const [cities, active] = await Promise.all([getSavedCities(), getActiveCity()]);
    setSaved(cities);
    setActiveId(active?.id ?? null);
  }, []);

  useFocusEffect(useCallback(() => { loadSaved(); }, [loadSaved]));

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try { setResults(await searchCities(query)); }
      finally { setSearching(false); }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleSave = async (city: GeoCity) => {
    await saveCity(city);
    await loadSaved();
  };

  const handleRemove = async (id: number) => {
    const updated = await removeCity(id);
    setSaved(updated);
    if (activeId === id) setActiveId(null);
  };

  const handleActivate = async (city: GeoCity) => {
    const next = activeId === city.id ? null : city.id;
    await setActiveCity(next);
    setActiveId(next);
  };

  const isSaved = (id: number) => saved.some((c) => c.id === id);
  const citySubtitle = (city: GeoCity) => [city.admin1, city.country].filter(Boolean).join(', ');

  const isSearching = query.trim().length >= 2;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={17} color="#475569" style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          placeholder="Search city…"
          placeholderTextColor="#334155"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {searching && <ActivityIndicator size="small" color="#8b5cf6" style={styles.spinner} />}
      </View>

      {/* Search results */}
      {isSearching && (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            !searching ? (
              <Text style={styles.emptyText}>No cities found</Text>
            ) : null
          }
          renderItem={({ item }) => {
            const saved_ = isSaved(item.id);
            return (
              <View style={styles.resultRow}>
                <View style={styles.cityInfo}>
                  <Text style={styles.cityName}>{item.name}</Text>
                  <Text style={styles.cityMeta}>{citySubtitle(item)}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.bookmarkBtn, saved_ && styles.bookmarkBtnActive]}
                  onPress={() => saved_ ? handleRemove(item.id) : handleSave(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={saved_ ? 'bookmark' : 'bookmark-outline'}
                    size={20}
                    color={saved_ ? '#8b5cf6' : '#334155'}
                  />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {/* Saved cities */}
      {!isSearching && (
        <FlatList
          data={saved}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={styles.sectionLabel}>
              {saved.length === 0 ? 'No saved locations yet' : 'Saved Locations'}
            </Text>
          }
          ListEmptyComponent={
            <Text style={styles.emptyHint}>
              Search for a city and tap the bookmark icon to save it
            </Text>
          }
          renderItem={({ item }) => {
            const isActive = item.id === activeId;
            return (
              <TouchableOpacity onPress={() => handleActivate(item)} activeOpacity={0.75}>
                {isActive ? (
                  <LinearGradient colors={['#13103a', '#0a0a1e']} style={[styles.cityRow, styles.cityRowActive]}>
                    <CityRowContent item={item} isActive subtitle={citySubtitle(item)} onRemove={handleRemove} />
                  </LinearGradient>
                ) : (
                  <View style={styles.cityRow}>
                    <CityRowContent item={item} isActive={false} subtitle={citySubtitle(item)} onRemove={handleRemove} />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function CityRowContent({
  item, isActive, subtitle, onRemove,
}: {
  item: GeoCity; isActive: boolean; subtitle: string; onRemove: (id: number) => void;
}) {
  return (
    <>
      <View style={styles.cityRowLeft}>
        {isActive && <View style={styles.activeDot} />}
        <View>
          <Text style={[styles.cityName, isActive && styles.cityNameActive]}>{item.name}</Text>
          <Text style={styles.cityMeta}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.cityRowRight}>
        {isActive && (
          <Ionicons name="checkmark-circle" size={18} color="#8b5cf6" style={{ marginRight: 10 }} />
        )}
        <TouchableOpacity
          onPress={() => onRemove(item.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={17} color="#334155" />
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020209' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0b0b1e',
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1c1c3e',
    paddingRight: 4,
  },
  searchIcon: { marginLeft: 14, marginRight: 4 },
  input: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 15,
    paddingVertical: 13,
    paddingHorizontal: 8,
  },
  spinner: { marginRight: 10 },
  listContent: { paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel: {
    color: '#334155', fontSize: 10, letterSpacing: 2, fontWeight: '700',
    textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
  },
  emptyText: { color: '#334155', textAlign: 'center', marginTop: 32, fontSize: 14 },
  emptyHint: {
    color: '#1e293b', fontSize: 13, textAlign: 'center', marginTop: 40,
    lineHeight: 20, fontStyle: 'italic',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#0d0d20',
  },
  cityInfo: { flex: 1 },
  bookmarkBtn: { padding: 6 },
  bookmarkBtnActive: {},
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#1c1c3e',
  },
  cityRowActive: { borderColor: '#3b2f6e' },
  cityRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cityRowRight: { flexDirection: 'row', alignItems: 'center' },
  activeDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#8b5cf6',
  },
  cityName: { color: '#f8fafc', fontSize: 15, fontWeight: '500' },
  cityNameActive: { color: '#a78bfa' },
  cityMeta: { color: '#475569', fontSize: 12, marginTop: 1 },
});
