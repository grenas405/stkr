// The backup file format. Import files are untrusted: each entry is validated on its
// own, so one bad map is reported and skipped instead of failing the whole import.

import type { RadarMap } from './radar-map';
import { fail, isIsoDate, isUuid, ok, sniffImageType, validateRadarMap, type Result } from './validate';

export const ARCHIVE_FORMAT = 'stkr-archive';
export const ARCHIVE_VERSION = 1;
export const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

export type ArchivedPhoto = { readonly id: string; readonly data: string };

export type Archive = {
  readonly format: typeof ARCHIVE_FORMAT;
  readonly version: number;
  readonly exportedAt: string;
  readonly maps: readonly RadarMap[];
  readonly photos: readonly ArchivedPhoto[];
};

export type DecodedPhoto = { readonly id: string; readonly bytes: Uint8Array };

export type DecodedArchive = {
  readonly maps: readonly RadarMap[];
  readonly photos: readonly DecodedPhoto[];
  readonly rejected: readonly string[];
};

export type ImportPlan = {
  readonly add: readonly RadarMap[];
  readonly update: readonly RadarMap[];
  readonly skippedCount: number;
};

const CHUNK = 0x8000;

export const bytesToBase64 = (bytes: Uint8Array): string => {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + CHUNK)));
  }
  return btoa(parts.join(''));
};

export const base64ToBytes = (text: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};

export const encodeArchive = (
  maps: readonly RadarMap[],
  photos: readonly ArchivedPhoto[],
  exportedAt: string,
): Archive => ({
  format: ARCHIVE_FORMAT,
  version: ARCHIVE_VERSION,
  exportedAt,
  maps,
  photos,
});

// base64 grows data by 4/3, so this bounds a photo before it is decoded.
const maxEncodedPhotoLength = Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 4;

const decodePhoto = (input: unknown): Result<DecodedPhoto> => {
  if (typeof input !== 'object' || input === null) return fail('A photo entry is malformed.');
  const { id, data } = input as { id?: unknown; data?: unknown };
  if (!isUuid(id)) return fail('A photo has an invalid id.');
  if (typeof data !== 'string' || data.length > maxEncodedPhotoLength) {
    return fail('A photo is too large.');
  }
  const bytes = base64ToBytes(data);
  if (bytes === null) return fail('A photo is not valid base64.');
  if (sniffImageType(bytes) === null) return fail('A photo is not a supported image.');
  return ok({ id, bytes });
};

const partition = <T>(results: readonly Result<T>[]): {
  readonly values: readonly T[];
  readonly errors: readonly string[];
} => ({
  values: results.flatMap((result) => (result.ok ? [result.value] : [])),
  errors: results.flatMap((result) => (result.ok ? [] : [result.error])),
});

// Photo references that didn't arrive or were rejected are removed from the map.
const keepKnownPhotos = (map: RadarMap, known: ReadonlySet<string>): RadarMap => ({
  ...map,
  photoIds: map.photoIds.filter((id) => known.has(id)),
});

export const decodeArchive = (input: unknown): Result<DecodedArchive> => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return fail('This file is not a STKR backup.');
  }
  const { format, version, exportedAt, maps, photos } = input as Record<string, unknown>;
  if (format !== ARCHIVE_FORMAT) return fail('This file is not a STKR backup.');
  if (version !== ARCHIVE_VERSION) return fail('This backup comes from an unsupported version.');
  if (!isIsoDate(exportedAt)) return fail('This backup has an invalid export date.');
  if (!Array.isArray(maps) || !Array.isArray(photos)) return fail('This backup is incomplete.');

  const decodedMaps = partition(maps.map(validateRadarMap));
  const decodedPhotos = partition(photos.map(decodePhoto));
  const known = new Set(decodedPhotos.values.map((photo) => photo.id));
  return ok({
    maps: decodedMaps.values.map((map) => keepKnownPhotos(map, known)),
    photos: decodedPhotos.values,
    rejected: [...decodedMaps.errors, ...decodedPhotos.errors],
  });
};

export const parseArchive = (text: string): Result<DecodedArchive> => {
  try {
    return decodeArchive(JSON.parse(text));
  } catch {
    return fail('This file is not valid JSON.');
  }
};

// New maps are added, newer versions replace older ones, and everything else is skipped.
export const planImport = (
  existing: readonly RadarMap[],
  incoming: readonly RadarMap[],
): ImportPlan => {
  const current = new Map(existing.map((map) => [map.id, map]));
  const add = incoming.filter((map) => !current.has(map.id));
  const update = incoming.filter((map) => {
    const known = current.get(map.id);
    return known !== undefined && Date.parse(map.updatedAt) > Date.parse(known.updatedAt);
  });
  return { add, update, skippedCount: incoming.length - add.length - update.length };
};
