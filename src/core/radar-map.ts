// Domain types and pure helpers for a radar map.

export const SCHEMA_VERSION = 1;

export const LIMITS = {
  minAxes: 3,
  maxAxes: 12,
  nameLength: 120,
  axisNameLength: 40,
  categoryLength: 80,
  tagLength: 40,
  maxTags: 24,
  notesLength: 10_000,
  personLength: 80,
  maxPeople: 24,
  detailLabelLength: 60,
  detailValueLength: 500,
  maxDetails: 32,
  maxPhotos: 10,
  placeNameLength: 120,
  unitLength: 16,
  scaleMagnitude: 1_000_000,
} as const;

export type Scale = { readonly min: number; readonly max: number; readonly unit?: string };

export type Axis = {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly higherIsBetter: boolean;
};

export type GeoPoint = {
  readonly lat: number;
  readonly lon: number;
  readonly accuracyM?: number;
};

export type CaptureContext = {
  readonly capturedAt: string;
  readonly source: 'device' | 'manual';
  readonly location?: GeoPoint;
  readonly placeName?: string;
};

export type Detail = { readonly label: string; readonly value: string };

export type RadarMap = {
  readonly schemaVersion: number;
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly scale: Scale;
  readonly axes: readonly Axis[];
  readonly context: CaptureContext;
  readonly notes: string;
  readonly people: readonly string[];
  readonly details: readonly Detail[];
  readonly photoIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const scaleRange = (scale: Scale): number => scale.max - scale.min;

// The snapping increment for dragging and arrow keys on a given scale.
export const scaleStep = (scale: Scale): number => {
  const range = scaleRange(scale);
  return range <= 20 ? range / 20 : range / 100;
};

export const snapToStep = (value: number, scale: Scale): number => {
  const step = scaleStep(scale);
  const snapped = scale.min + Math.round((value - scale.min) / step) * step;
  return clamp(Number(snapped.toFixed(6)), scale.min, scale.max);
};

// Position of a value on its scale, from 0 (min) to 1 (max), ignoring polarity.
export const magnitudeOf = (value: number, scale: Scale): number =>
  clamp((value - scale.min) / scaleRange(scale), 0, 1);

export const magnitudeToValue = (magnitude: number, scale: Scale): number =>
  scale.min + clamp(magnitude, 0, 1) * scaleRange(scale);

// How favourable an axis is, from 0 to 1: a low price scores high when lower is better.
export const axisFavour = (axis: Axis, scale: Scale): number => {
  const magnitude = magnitudeOf(axis.value, scale);
  return axis.higherIsBetter ? magnitude : 1 - magnitude;
};

// The overall rating of a map, from 0 to 1.
export const overallScore = (map: RadarMap): number =>
  map.axes.reduce((sum, axis) => sum + axisFavour(axis, map.scale), 0) / map.axes.length;

export const normaliseLabel = (label: string): string => label.trim().toLowerCase();

// The text describing what a map is about. Used for embeddings and keyword search.
export const describeMap = (map: RadarMap): string =>
  [
    map.name,
    map.category,
    map.tags.join(', '),
    map.axes.map((axis) => axis.name).join(', '),
    map.context.placeName ?? '',
    map.notes,
    map.details.map((detail) => `${detail.label}: ${detail.value}`).join('. '),
  ]
    .filter((part) => part.length > 0)
    .join('. ');

// FNV-1a. Detects changed text so unchanged maps are not re-embedded; not a security hash.
export const contentHash = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const formatValue = (value: number): string =>
  String(Number(value.toFixed(2)));

// Unique axis names across all maps, most used first, for wizard suggestions.
export const suggestAxisNames = (maps: readonly RadarMap[], limit = 12): readonly string[] => {
  const counts = new Map<string, { name: string; count: number }>();
  for (const axis of maps.flatMap((map) => map.axes)) {
    const key = normaliseLabel(axis.name);
    const entry = counts.get(key);
    counts.set(key, { name: entry?.name ?? axis.name, count: (entry?.count ?? 0) + 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((entry) => entry.name);
};
