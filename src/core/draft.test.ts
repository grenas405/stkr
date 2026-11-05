import { describe, expect, it } from 'vitest';
import { draftToMap, emptyDraft, isoToLocalInput, localInputToIso, mapToDraft, parseList } from './draft';
import { makeMap, uuidFor } from './fixtures';
import { validateRadarMap } from './validate';

const identity = {
  id: uuidFor(1),
  createdAt: '2026-03-15T12:00:00.000Z',
  now: '2026-03-15T12:00:00.000Z',
};

describe('parseList', () => {
  it('trims, drops blanks and removes repeats ignoring case', () => {
    expect(parseList(' spicy, , Spicy,cheap ')).toEqual(['spicy', 'cheap']);
    expect(parseList('')).toEqual([]);
  });
});

describe('dates', () => {
  it('formats an instant using the given offset', () => {
    expect(isoToLocalInput('2026-03-15T12:30:00.000Z', 300)).toBe('2026-03-15T07:30');
    expect(isoToLocalInput('2026-03-15T12:30:00.000Z', -60)).toBe('2026-03-15T13:30');
  });

  it('returns nothing usable for an invalid date, which validation rejects', () => {
    expect(localInputToIso('not a date')).toBe('');
    const draft = { ...emptyDraft('nonsense'), name: 'x' };
    expect(validateRadarMap(draftToMap(draft, identity)).ok).toBe(false);
  });
});

describe('draft conversion', () => {
  it('round-trips a saved map through editing unchanged', () => {
    const map = makeMap(1, {
      name: 'Ramen',
      tags: ['spicy'],
      people: ['Sam'],
      scale: { min: 0, max: 10, unit: 'stars' },
      details: [{ label: 'Dish', value: 'Tonkotsu' }],
    });
    const offset = new Date(map.context.capturedAt).getTimezoneOffset();
    const rebuilt = draftToMap(mapToDraft(map, offset), {
      id: map.id,
      createdAt: map.createdAt,
      now: map.updatedAt,
    });
    expect(rebuilt).toEqual(map);
    expect(validateRadarMap(rebuilt).ok).toBe(true);
  });

  it('keeps ratings proportional when the scale changes', () => {
    const offset = 0;
    const draft = mapToDraft(makeMap(1), offset);
    const rescaled = draftToMap({ ...draft, scaleMax: 100 }, identity);
    expect(rescaled.axes[0]?.value).toBe(50);
  });

  it('marks a captured location as coming from the device', () => {
    const draft = { ...mapToDraft(makeMap(1), 0), location: { lat: 1, lon: 2 } };
    expect(draftToMap(draft, identity).context.source).toBe('device');
    expect(draftToMap(mapToDraft(makeMap(1), 0), identity).context.source).toBe('manual');
  });

  it('drops empty detail rows but keeps partly filled ones for validation', () => {
    const draft = {
      ...mapToDraft(makeMap(1), 0),
      details: [
        { label: ' ', value: '' },
        { label: '', value: 'orphan' },
      ],
    };
    const map = draftToMap(draft, identity);
    expect(map.details).toEqual([{ label: '', value: 'orphan' }]);
    expect(validateRadarMap(map).ok).toBe(false);
  });
});
