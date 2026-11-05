// Groups maps into "stacks": the virtual filing system derived from their metadata.

import type { RadarMap } from './radar-map';

export type StackMode = 'category' | 'place' | 'date';

export type Stack = {
  readonly key: string;
  readonly label: string;
  readonly maps: readonly RadarMap[];
};

const UNFILED = 'Unfiled';
const NO_PLACE = 'No place recorded';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Two decimal places of latitude is about 1 km.
const roundedCoordinates = (lat: number, lon: number): string =>
  `${lat.toFixed(2)}, ${lon.toFixed(2)}`;

export const placeLabel = (map: RadarMap): string => {
  const name = map.context.placeName?.trim();
  if (name) return name;
  const location = map.context.location;
  return location ? roundedCoordinates(location.lat, location.lon) : NO_PLACE;
};

export const categoryLabel = (map: RadarMap): string => map.category.trim() || UNFILED;

// Formats the year and month from the stored timestamp itself so the result doesn't
// depend on the viewer's time zone.
const monthKey = (map: RadarMap): string => map.context.capturedAt.slice(0, 7);

export const monthLabel = (key: string): string => {
  const [year, month] = key.split('-');
  return `${MONTHS[Number(month) - 1] ?? 'Unknown'} ${year ?? ''}`.trim();
};

const stackKeyFor = (map: RadarMap, mode: StackMode): string => {
  if (mode === 'category') return categoryLabel(map).toLowerCase();
  if (mode === 'place') return placeLabel(map).toLowerCase();
  return monthKey(map);
};

const stackLabelFor = (map: RadarMap, mode: StackMode): string => {
  if (mode === 'category') return categoryLabel(map);
  if (mode === 'place') return placeLabel(map);
  return monthLabel(monthKey(map));
};

const newestFirst = (a: RadarMap, b: RadarMap): number =>
  b.context.capturedAt.localeCompare(a.context.capturedAt);

const compareStacks =
  (mode: StackMode) =>
  (a: Stack, b: Stack): number =>
    mode === 'date' ? b.key.localeCompare(a.key) : a.label.localeCompare(b.label);

export const groupIntoStacks = (maps: readonly RadarMap[], mode: StackMode): readonly Stack[] => {
  const groups = new Map<string, RadarMap[]>();
  for (const map of maps) {
    const key = stackKeyFor(map, mode);
    groups.set(key, [...(groups.get(key) ?? []), map]);
  }
  return [...groups.entries()]
    .map(([key, members]) => {
      const sorted = [...members].sort(newestFirst);
      const first = sorted[0] as RadarMap;
      return { key, label: stackLabelFor(first, mode), maps: sorted };
    })
    .sort(compareStacks(mode));
};
