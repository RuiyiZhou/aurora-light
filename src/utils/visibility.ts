// Equatorward boundary of aurora oval per Kp level (NOAA model)
const KP_BOUNDARY = [72, 69, 66, 63, 60, 56, 53, 50, 45, 40];

export function auroraLatitudeBoundary(kp: number): number {
  const idx = Math.min(9, Math.max(0, Math.round(kp)));
  return KP_BOUNDARY[idx];
}

export type VisibilityLevel = 'none' | 'low' | 'medium' | 'high' | 'extreme';

export interface VisibilityInfo {
  level: VisibilityLevel;
  label: string;
  description: string;
  color: string;
}

export function getVisibility(kp: number, latitude: number): VisibilityInfo {
  const absLat = Math.abs(latitude);
  const boundary = auroraLatitudeBoundary(kp);
  const margin = absLat - boundary;

  if (margin >= 5)
    return { level: 'extreme', label: 'Excellent', description: 'Aurora likely overhead', color: '#34d399' };
  if (margin >= 0)
    return { level: 'high', label: 'Good', description: 'Aurora possibly visible on horizon', color: '#6ee7b7' };
  if (margin >= -5)
    return { level: 'medium', label: 'Possible', description: 'May be visible if Kp rises further', color: '#fbbf24' };
  if (margin >= -10)
    return { level: 'low', label: 'Unlikely', description: 'Too far from the oval for current activity', color: '#f97316' };
  return { level: 'none', label: 'No Chance', description: 'Aurora not visible at this latitude', color: '#ef4444' };
}

export function kpToColor(kp: number): string {
  if (kp >= 7) return '#ef4444';
  if (kp >= 5) return '#f97316';
  if (kp >= 3) return '#fbbf24';
  if (kp >= 1) return '#34d399';
  return '#6b7280';
}

export function kpLabel(kp: number): string {
  if (kp >= 8) return 'Severe Storm';
  if (kp >= 7) return 'Strong Storm';
  if (kp >= 6) return 'Moderate Storm';
  if (kp >= 5) return 'Minor Storm';
  if (kp >= 4) return 'Active';
  if (kp >= 3) return 'Unsettled';
  if (kp >= 2) return 'Quiet';
  return 'Very Quiet';
}
