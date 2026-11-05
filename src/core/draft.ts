// The editable form of a map, and pure conversions to and from a saved map.

import {
  SCHEMA_VERSION,
  magnitudeOf,
  magnitudeToValue,
  snapToStep,
  type GeoPoint,
  type RadarMap,
  type Scale,
} from './radar-map';

export type DraftAxis = {
  readonly id: string;
  readonly name: string;
  readonly magnitude: number;
  readonly higherIsBetter: boolean;
};

export type Draft = {
  readonly name: string;
  readonly category: string;
  readonly tagsText: string;
  readonly peopleText: string;
  readonly notes: string;
  readonly placeName: string;
  readonly capturedAtLocal: string;
  readonly location: GeoPoint | null;
  readonly scaleMin: number;
  readonly scaleMax: number;
  readonly unit: string;
  readonly axes: readonly DraftAxis[];
  readonly details: readonly { readonly label: string; readonly value: string }[];
  readonly photoIds: readonly string[];
};

// Splits comma-separated text, dropping blanks and repeats but keeping the first spelling.
export const parseList = (text: string): readonly string[] => {
  const seen = new Set<string>();
  return text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (item.length === 0 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const pad = (value: number): string => String(value).padStart(2, '0');

// Formats an instant for a datetime-local input, in the viewer's time zone.
export const isoToLocalInput = (iso: string, offsetMinutes: number): string => {
  const shifted = new Date(Date.parse(iso) - offsetMinutes * 60_000);
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
  );
};

// Returns an empty string for an unusable date, which validation then reports.
export const localInputToIso = (local: string): string => {
  const time = Date.parse(local);
  return Number.isNaN(time) ? '' : new Date(time).toISOString();
};

export const draftScale = (draft: Pick<Draft, 'scaleMin' | 'scaleMax' | 'unit'>): Scale => {
  const unit = draft.unit.trim();
  const limits = { min: draft.scaleMin, max: draft.scaleMax };
  return unit.length > 0 ? { ...limits, unit } : limits;
};

export const emptyDraft = (capturedAtLocal: string): Draft => ({
  name: '',
  category: '',
  tagsText: '',
  peopleText: '',
  notes: '',
  placeName: '',
  capturedAtLocal,
  location: null,
  scaleMin: 0,
  scaleMax: 10,
  unit: '',
  axes: [],
  details: [],
  photoIds: [],
});

export const mapToDraft = (map: RadarMap, offsetMinutes: number): Draft => ({
  name: map.name,
  category: map.category,
  tagsText: map.tags.join(', '),
  peopleText: map.people.join(', '),
  notes: map.notes,
  placeName: map.context.placeName ?? '',
  capturedAtLocal: isoToLocalInput(map.context.capturedAt, offsetMinutes),
  location: map.context.location ?? null,
  scaleMin: map.scale.min,
  scaleMax: map.scale.max,
  unit: map.scale.unit ?? '',
  axes: map.axes.map((axis) => ({
    id: axis.id,
    name: axis.name,
    magnitude: magnitudeOf(axis.value, map.scale),
    higherIsBetter: axis.higherIsBetter,
  })),
  details: map.details,
  photoIds: map.photoIds,
});

// Builds a candidate map. The result is unvalidated: pass it to validateRadarMap.
export const draftToMap = (
  draft: Draft,
  identity: { readonly id: string; readonly createdAt: string; readonly now: string },
): RadarMap => {
  const scale = draftScale(draft);
  const placeName = draft.placeName.trim();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: identity.id,
    name: draft.name.trim(),
    category: draft.category.trim(),
    tags: parseList(draft.tagsText),
    scale,
    axes: draft.axes.map((axis) => ({
      id: axis.id,
      name: axis.name.trim(),
      value: snapToStep(magnitudeToValue(axis.magnitude, scale), scale),
      higherIsBetter: axis.higherIsBetter,
    })),
    context: {
      capturedAt: localInputToIso(draft.capturedAtLocal),
      source: draft.location === null ? 'manual' : 'device',
      ...(draft.location === null ? {} : { location: draft.location }),
      ...(placeName.length > 0 ? { placeName } : {}),
    },
    notes: draft.notes,
    people: parseList(draft.peopleText),
    details: draft.details
      .map((detail) => ({ label: detail.label.trim(), value: detail.value.trim() }))
      .filter((detail) => detail.label.length > 0 || detail.value.length > 0),
    photoIds: draft.photoIds,
    createdAt: identity.createdAt,
    updatedAt: identity.now,
  };
};
