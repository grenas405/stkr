// Validates untrusted input (forms and import files). Every validator rebuilds a fresh
// object from an allowlist of keys, so unknown or `__proto__`-style keys never survive.

import {
  LIMITS,
  SCHEMA_VERSION,
  type Axis,
  type CaptureContext,
  type Detail,
  type GeoPoint,
  type RadarMap,
  type Scale,
} from './radar-map';

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T>(error: string): Result<T> => ({ ok: false, error });

type Record_ = Readonly<Record<string, unknown>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Control characters other than tab, newline and carriage return.
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const isRecord = (value: unknown): value is Record_ =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (record: Record_, allowed: readonly string[]): boolean =>
  Object.keys(record).every((key) => allowed.includes(key));

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);

const isCleanText = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.length <= maxLength && !CONTROL_CHARS.test(value);

const isRequiredText = (value: unknown, maxLength: number): value is string =>
  isCleanText(value, maxLength) && value.trim().length > 0;

const isTextList = (value: unknown, maxItems: number, maxLength: number): value is string[] =>
  Array.isArray(value) &&
  value.length <= maxItems &&
  value.every((item) => isRequiredText(item, maxLength));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 40 &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  !Number.isNaN(Date.parse(value));

export const validateScale = (input: unknown): Result<Scale> => {
  if (!isRecord(input) || !hasOnlyKeys(input, ['min', 'max', 'unit'])) {
    return fail('Scale has an unexpected shape.');
  }
  const { min, max, unit } = input;
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return fail('Scale limits must be numbers.');
  if (Math.abs(min) > LIMITS.scaleMagnitude || Math.abs(max) > LIMITS.scaleMagnitude) {
    return fail(`Scale limits must be within ±${LIMITS.scaleMagnitude}.`);
  }
  if (max <= min) return fail('The scale maximum must be greater than its minimum.');
  if (unit === undefined) return ok({ min, max });
  if (!isCleanText(unit, LIMITS.unitLength)) {
    return fail(`Scale unit must be ${LIMITS.unitLength} characters or fewer.`);
  }
  return ok({ min, max, unit });
};

const validateAxis = (input: unknown, scale: Scale): Result<Axis> => {
  if (!isRecord(input) || !hasOnlyKeys(input, ['id', 'name', 'value', 'higherIsBetter'])) {
    return fail('Axis has an unexpected shape.');
  }
  const { id, name, value, higherIsBetter } = input;
  if (!isUuid(id)) return fail('Axis id is invalid.');
  if (!isRequiredText(name, LIMITS.axisNameLength)) {
    return fail(`Name every axis, using ${LIMITS.axisNameLength} characters or fewer.`);
  }
  if (!isFiniteNumber(value) || value < scale.min || value > scale.max) {
    return fail(`The value of "${name}" is outside the scale.`);
  }
  if (typeof higherIsBetter !== 'boolean') return fail('Axis polarity must be true or false.');
  return ok({ id, name, value, higherIsBetter });
};

const validateAxes = (input: unknown, scale: Scale): Result<readonly Axis[]> => {
  if (!Array.isArray(input)) return fail('Axes must be a list.');
  if (input.length < LIMITS.minAxes || input.length > LIMITS.maxAxes) {
    return fail(`A map needs ${LIMITS.minAxes} to ${LIMITS.maxAxes} axes.`);
  }
  const axes: Axis[] = [];
  for (const item of input) {
    const axis = validateAxis(item, scale);
    if (!axis.ok) return axis;
    axes.push(axis.value);
  }
  const names = axes.map((axis) => axis.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return fail('Give each axis a different name.');
  if (new Set(axes.map((axis) => axis.id)).size !== axes.length) return fail('Axis ids repeat.');
  return ok(axes);
};

const validateLocation = (input: unknown): Result<GeoPoint> => {
  if (!isRecord(input) || !hasOnlyKeys(input, ['lat', 'lon', 'accuracyM'])) {
    return fail('Location has an unexpected shape.');
  }
  const { lat, lon, accuracyM } = input;
  if (!isFiniteNumber(lat) || Math.abs(lat) > 90) return fail('Latitude must be within ±90.');
  if (!isFiniteNumber(lon) || Math.abs(lon) > 180) return fail('Longitude must be within ±180.');
  if (accuracyM === undefined) return ok({ lat, lon });
  if (!isFiniteNumber(accuracyM) || accuracyM < 0) return fail('Location accuracy is invalid.');
  return ok({ lat, lon, accuracyM });
};

const validateContext = (input: unknown): Result<CaptureContext> => {
  const allowed = ['capturedAt', 'source', 'location', 'placeName'];
  if (!isRecord(input) || !hasOnlyKeys(input, allowed)) {
    return fail('Capture details have an unexpected shape.');
  }
  const { capturedAt, source, location, placeName } = input;
  if (!isIsoDate(capturedAt)) return fail('Enter a valid date and time.');
  if (source !== 'device' && source !== 'manual') return fail('Capture source is invalid.');
  if (placeName !== undefined && !isCleanText(placeName, LIMITS.placeNameLength)) {
    return fail(`Place name must be ${LIMITS.placeNameLength} characters or fewer.`);
  }
  const place = placeName === undefined ? {} : { placeName };
  if (location === undefined) return ok({ capturedAt, source, ...place });
  const point = validateLocation(location);
  if (!point.ok) return point;
  return ok({ capturedAt, source, location: point.value, ...place });
};

const validateDetails = (input: unknown): Result<readonly Detail[]> => {
  if (!Array.isArray(input) || input.length > LIMITS.maxDetails) {
    return fail(`A map can have up to ${LIMITS.maxDetails} details.`);
  }
  const details: Detail[] = [];
  for (const item of input) {
    if (!isRecord(item) || !hasOnlyKeys(item, ['label', 'value'])) {
      return fail('Detail has an unexpected shape.');
    }
    const { label, value } = item;
    if (!isRequiredText(label, LIMITS.detailLabelLength)) {
      return fail(`Detail labels need 1 to ${LIMITS.detailLabelLength} characters.`);
    }
    if (!isCleanText(value, LIMITS.detailValueLength)) {
      return fail(`Detail values must be ${LIMITS.detailValueLength} characters or fewer.`);
    }
    details.push({ label, value });
  }
  return ok(details);
};

const MAP_KEYS = [
  'schemaVersion',
  'id',
  'name',
  'category',
  'tags',
  'scale',
  'axes',
  'context',
  'notes',
  'people',
  'details',
  'photoIds',
  'createdAt',
  'updatedAt',
];

export const validateRadarMap = (input: unknown): Result<RadarMap> => {
  if (!isRecord(input) || !hasOnlyKeys(input, MAP_KEYS)) {
    return fail('Map has an unexpected shape.');
  }
  if (input.schemaVersion !== SCHEMA_VERSION) return fail('Map uses an unsupported version.');
  const { id, name, category, tags, notes, people, photoIds, createdAt, updatedAt } = input;
  if (!isUuid(id)) return fail('Map id is invalid.');
  if (!isRequiredText(name, LIMITS.nameLength)) {
    return fail(`Name the map, using ${LIMITS.nameLength} characters or fewer.`);
  }
  if (!isCleanText(category, LIMITS.categoryLength)) {
    return fail(`Category must be ${LIMITS.categoryLength} characters or fewer.`);
  }
  if (!isTextList(tags, LIMITS.maxTags, LIMITS.tagLength)) {
    return fail(`Use up to ${LIMITS.maxTags} tags of ${LIMITS.tagLength} characters or fewer.`);
  }
  if (!isCleanText(notes, LIMITS.notesLength)) {
    return fail(`Notes must be ${LIMITS.notesLength} characters or fewer.`);
  }
  if (!isTextList(people, LIMITS.maxPeople, LIMITS.personLength)) {
    return fail(`Use up to ${LIMITS.maxPeople} names of ${LIMITS.personLength} characters or fewer.`);
  }
  if (
    !Array.isArray(photoIds) ||
    photoIds.length > LIMITS.maxPhotos ||
    !photoIds.every(isUuid)
  ) {
    return fail(`A map can have up to ${LIMITS.maxPhotos} photos.`);
  }
  if (!isIsoDate(createdAt) || !isIsoDate(updatedAt)) return fail('Map dates are invalid.');

  const scale = validateScale(input.scale);
  if (!scale.ok) return scale;
  const axes = validateAxes(input.axes, scale.value);
  if (!axes.ok) return axes;
  const context = validateContext(input.context);
  if (!context.ok) return context;
  const details = validateDetails(input.details);
  if (!details.ok) return details;

  return ok({
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    category,
    tags,
    scale: scale.value,
    axes: axes.value,
    context: context.value,
    notes,
    people,
    details: details.value,
    photoIds,
    createdAt,
    updatedAt,
  });
};

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  signature.every((byte, index) => bytes[offset + index] === byte);

// Identifies an image from its leading bytes, never from its name or declared type.
// SVG and anything else that can carry script is deliberately not recognised.
export const sniffImageType = (bytes: Uint8Array): ImageType | null => {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  const isRiff = startsWith(bytes, [0x52, 0x49, 0x46, 0x46]);
  if (isRiff && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
};
