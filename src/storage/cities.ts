import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeoCity } from '../services/geocoding';

const SAVED_KEY = 'saved_cities';
const ACTIVE_KEY = 'active_city_id';

export async function getSavedCities(): Promise<GeoCity[]> {
  const raw = await AsyncStorage.getItem(SAVED_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveCity(city: GeoCity): Promise<void> {
  const cities = await getSavedCities();
  if (!cities.find((c) => c.id === city.id)) {
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify([...cities, city]));
  }
}

export async function removeCity(id: number): Promise<GeoCity[]> {
  const cities = await getSavedCities();
  const updated = cities.filter((c) => c.id !== id);
  await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(updated));
  const activeId = await AsyncStorage.getItem(ACTIVE_KEY);
  if (activeId === String(id)) await AsyncStorage.removeItem(ACTIVE_KEY);
  return updated;
}

export async function getActiveCity(): Promise<GeoCity | null> {
  const [cities, activeId] = await Promise.all([
    getSavedCities(),
    AsyncStorage.getItem(ACTIVE_KEY),
  ]);
  if (!activeId) return null;
  return cities.find((c) => c.id === parseInt(activeId)) ?? null;
}

export async function setActiveCity(id: number | null): Promise<void> {
  if (id === null) {
    await AsyncStorage.removeItem(ACTIVE_KEY);
  } else {
    await AsyncStorage.setItem(ACTIVE_KEY, String(id));
  }
}
