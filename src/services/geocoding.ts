export interface GeoCity {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  country_code: string;
  admin1?: string;
}

export async function searchCities(query: string): Promise<GeoCity[]> {
  if (query.trim().length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=10&language=en&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.results as GeoCity[]) ?? [];
}
