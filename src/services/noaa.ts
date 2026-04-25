const BASE = 'https://services.swpc.noaa.gov';

export interface KpReading {
  time: Date;
  kp: number;
  observed: string;
}

export interface SolarWind {
  speed: number;
  density: number;
  bt: number;
  bz: number;
}

type KpRow = string[] | { time_tag: string; Kp: string; observed?: string };

function parseKpRows(data: KpRow[], kpKey: string, observedIndex: number): KpReading[] {
  const rows = Array.isArray(data[0]) ? (data as string[][]).slice(1) : (data as Record<string, string>[]);
  return (rows as Record<string, string>[])
    .filter((row) => row != null && (row['time_tag'] ?? row[0]) != null)
    .map((row) => {
      const tag: string = row['time_tag'] ?? row[0];
      const kpVal: string = row[kpKey] ?? row[1];
      const obs: string = row['observed'] ?? row[observedIndex] ?? 'observed';
      return {
        time: new Date(tag.replace(' ', 'T') + 'Z'),
        kp: parseFloat(kpVal),
        observed: obs,
      };
    })
    .filter((r) => !isNaN(r.kp));
}

export async function fetchCurrentKp(): Promise<KpReading[]> {
  const res = await fetch(`${BASE}/products/noaa-planetary-k-index.json`);
  const data = await res.json();
  return parseKpRows(data, 'Kp', 3);
}

export async function fetchKpForecast(): Promise<KpReading[]> {
  const res = await fetch(`${BASE}/products/noaa-planetary-k-index-forecast.json`);
  const data = await res.json();
  return parseKpRows(data, 'kp', 2);
}

export async function fetchSolarWind(): Promise<SolarWind | null> {
  try {
    const [magRes, plasmaRes] = await Promise.all([
      fetch(`${BASE}/products/summary/solar-wind-mag-field.json`),
      fetch(`${BASE}/products/summary/solar-wind-speed.json`),
    ]);
    const mag = await magRes.json();
    const plasma = await plasmaRes.json();
    return {
      bt: parseFloat(mag.BtTotal) || 0,
      bz: parseFloat(mag.BzGSM) || 0,
      speed: parseFloat(plasma.WindSpeed) || 0,
      density: parseFloat(plasma.ProtonDensity) || 0,
    };
  } catch {
    return null;
  }
}
