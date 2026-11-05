// Pure similarity measures between vectors, rating profiles and places.

import { axisFavour, normaliseLabel, type GeoPoint, type RadarMap } from './radar-map';

export const cosineSimilarity = (a: ArrayLike<number>, b: ArrayLike<number>): number => {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
};

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export const haversineKm = (a: GeoPoint, b: GeoPoint): number => {
  const latDelta = toRadians(b.lat - a.lat);
  const lonDelta = toRadians(b.lon - a.lon);
  const h =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(lonDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

// The axis names two maps have in common, normalised.
export const sharedAxisNames = (a: RadarMap, b: RadarMap): readonly string[] => {
  const namesInB = new Set(b.axes.map((axis) => normaliseLabel(axis.name)));
  return a.axes.map((axis) => normaliseLabel(axis.name)).filter((name) => namesInB.has(name));
};

// How alike two maps were rated on shared axes, 0 to 1; null when too few axes overlap.
export const profileSimilarity = (a: RadarMap, b: RadarMap, minShared = 3): number | null => {
  const shared = sharedAxisNames(a, b);
  if (shared.length < minShared) return null;
  const favourFor = (map: RadarMap, name: string): number => {
    const axis = map.axes.find((candidate) => normaliseLabel(candidate.name) === name);
    return axis === undefined ? 0 : axisFavour(axis, map.scale);
  };
  const totalDifference = shared.reduce(
    (sum, name) => sum + Math.abs(favourFor(a, name) - favourFor(b, name)),
    0,
  );
  return 1 - totalDifference / shared.length;
};
