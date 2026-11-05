import { describe, expect, it } from 'vitest';
import { axesFrom, makeMap, uuidFor } from './fixtures';
import {
  base64ToBytes,
  bytesToBase64,
  encodeArchive,
  parseArchive,
  planImport,
  type DecodedArchive,
} from './archive';
import { sniffImageType, validateRadarMap, validateScale } from './validate';

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const expectRejected = (input: unknown): void => {
  expect(validateRadarMap(input).ok).toBe(false);
};

describe('validateRadarMap', () => {
  it('accepts a valid map', () => {
    expect(validateRadarMap(makeMap(1)).ok).toBe(true);
  });

  it.each([null, undefined, 1, 'map', [], true])('rejects %s', (input) => {
    expectRejected(input);
  });

  it('rejects unknown keys', () => {
    expectRejected({ ...makeMap(1), extra: 1 });
    expectRejected({ ...makeMap(1), scale: { min: 0, max: 10, extra: 1 } });
  });

  it('rejects prototype pollution keys and leaves Object untouched', () => {
    const hostile = JSON.parse(
      `{"__proto__":{"polluted":true},${JSON.stringify(makeMap(1)).slice(1)}`,
    );
    expectRejected(hostile);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const nested = JSON.parse(JSON.stringify(makeMap(1)));
    nested.context = JSON.parse(
      `{"constructor":{"prototype":{"polluted":true}},"capturedAt":"2026-01-01T00:00:00Z","source":"manual"}`,
    );
    expectRejected(nested);
  });

  it('rejects the wrong number of axes', () => {
    expectRejected(makeMap(1, { axes: axesFrom({ A: 1, B: 1 }) }));
    const many = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`A${i}`, 1]));
    expectRejected(makeMap(1, { axes: axesFrom(many) }));
  });

  it('rejects duplicate axis names, ignoring case', () => {
    expectRejected(makeMap(1, { axes: axesFrom({ Taste: 1, 'taste ': 1, Price: 1 }) }));
  });

  it('rejects values outside the scale and non-finite numbers', () => {
    expectRejected(makeMap(1, { axes: axesFrom({ A: 11, B: 1, C: 1 }) }));
    expectRejected(makeMap(1, { axes: axesFrom({ A: Number.NaN, B: 1, C: 1 }) }));
    expectRejected(makeMap(1, { axes: axesFrom({ A: Infinity, B: 1, C: 1 }) }));
  });

  it('rejects oversized text', () => {
    expectRejected(makeMap(1, { name: 'x'.repeat(121) }));
    expectRejected(makeMap(1, { notes: 'x'.repeat(10_001) }));
    expectRejected(makeMap(1, { tags: ['x'.repeat(41)] }));
  });

  it('rejects blank names and control characters', () => {
    expectRejected(makeMap(1, { name: '   ' }));
    expectRejected(makeMap(1, { name: 'a\u0000b' }));
    expect(validateRadarMap(makeMap(1, { notes: 'line one\nline two\ttabbed' })).ok).toBe(true);
  });

  it('keeps markup as inert text for Vue to escape', () => {
    const name = '<img src=x onerror=alert(1)>';
    const result = validateRadarMap(makeMap(1, { name }));
    expect(result.ok && result.value.name).toBe(name);
  });

  it('rejects invalid ids that could reach a database key or URL', () => {
    expectRejected(makeMap(1, { id: '../../etc/passwd' }));
    expectRejected(makeMap(1, { photoIds: ['not-a-uuid'] }));
  });

  it('rejects bad coordinates and dates', () => {
    const context = { capturedAt: '2026-01-01T00:00:00.000Z', source: 'device' as const };
    expectRejected(makeMap(1, { context: { ...context, location: { lat: 91, lon: 0 } } }));
    expectRejected(makeMap(1, { context: { ...context, location: { lat: 0, lon: 181 } } }));
    expectRejected(makeMap(1, { context: { ...context, capturedAt: 'yesterday' } }));
  });

  it('rejects an unknown schema version', () => {
    expectRejected(makeMap(1, { schemaVersion: 99 }));
  });
});

describe('validateScale', () => {
  it('rejects inverted, empty and huge scales', () => {
    expect(validateScale({ min: 10, max: 0 }).ok).toBe(false);
    expect(validateScale({ min: 5, max: 5 }).ok).toBe(false);
    expect(validateScale({ min: 0, max: 1e7 }).ok).toBe(false);
    expect(validateScale({ min: 0, max: 5, unit: 'stars' }).ok).toBe(true);
  });
});

describe('sniffImageType', () => {
  it('recognises real image signatures', () => {
    expect(sniffImageType(JPEG_BYTES)).toBe('image/jpeg');
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    );
    expect(
      sniffImageType(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')),
    ).toBe('image/webp');
  });

  it('rejects SVG, HTML and empty input', () => {
    const text = (value: string) => new TextEncoder().encode(value);
    expect(sniffImageType(text('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(sniffImageType(text('<!doctype html>'))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe('archive', () => {
  const exportedAt = '2026-04-01T00:00:00.000Z';
  const photo = { id: uuidFor(50), data: bytesToBase64(JPEG_BYTES) };
  const decoded = (text: string): DecodedArchive => {
    const result = parseArchive(text);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };

  it('round-trips bytes larger than one chunk', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, index) => index % 251);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('round-trips maps and photos', () => {
    const map = makeMap(1, { photoIds: [photo.id] });
    const result = decoded(JSON.stringify(encodeArchive([map], [photo], exportedAt)));
    expect(result.maps).toEqual([map]);
    expect(result.photos[0]?.bytes).toEqual(JPEG_BYTES);
    expect(result.rejected).toEqual([]);
  });

  it('rejects files that are not backups', () => {
    expect(parseArchive('not json').ok).toBe(false);
    expect(parseArchive('[]').ok).toBe(false);
    expect(parseArchive('{"format":"other"}').ok).toBe(false);
    expect(parseArchive('{"format":"stkr-archive","version":99}').ok).toBe(false);
  });

  it('skips a bad map and keeps the good ones', () => {
    const archive = encodeArchive([makeMap(1), { ...makeMap(2), name: '' }], [], exportedAt);
    const result = decoded(JSON.stringify(archive));
    expect(result.maps).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });

  it('rejects disguised photos and removes references to them', () => {
    const svg = { id: uuidFor(51), data: btoa('<svg onload="alert(1)"></svg>') };
    const map = makeMap(1, { photoIds: [svg.id, uuidFor(52)] });
    const result = decoded(JSON.stringify(encodeArchive([map], [svg], exportedAt)));
    expect(result.photos).toEqual([]);
    expect(result.maps[0]?.photoIds).toEqual([]);
    expect(result.rejected).toHaveLength(1);
  });

  it('rejects malformed and oversized photo entries', () => {
    const entries = [{ id: 'x', data: '' }, null, { id: uuidFor(53), data: '***' }];
    const result = decoded(JSON.stringify(encodeArchive([], entries as never, exportedAt)));
    expect(result.rejected).toHaveLength(3);
  });

  it('plans additions, updates and skips by timestamp', () => {
    const older = makeMap(1, { updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeMap(1, { updatedAt: '2026-06-01T00:00:00.000Z' });
    const same = makeMap(2);
    expect(planImport([older, same], [newer, same, makeMap(3)])).toEqual({
      add: [makeMap(3)],
      update: [newer],
      skippedCount: 1,
    });
    expect(planImport([newer], [older]).skippedCount).toBe(1);
  });
});
