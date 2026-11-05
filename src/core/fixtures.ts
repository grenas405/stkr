// Test helper: builds a valid map with deterministic ids and dates.

import { SCHEMA_VERSION, type Axis, type RadarMap } from './radar-map';

export const uuidFor = (seed: number): string =>
  `00000000-0000-4000-8000-${String(seed).padStart(12, '0')}`;

export const axesFrom = (values: Readonly<Record<string, number>>): readonly Axis[] =>
  Object.entries(values).map(([name, value], index) => ({
    id: uuidFor(1000 + index),
    name,
    value,
    higherIsBetter: true,
  }));

export const makeMap = (seed: number, overrides: Partial<RadarMap> = {}): RadarMap => ({
  schemaVersion: SCHEMA_VERSION,
  id: uuidFor(seed),
  name: `Map ${seed}`,
  category: '',
  tags: [],
  scale: { min: 0, max: 10 },
  axes: axesFrom({ Taste: 5, Price: 5, Service: 5 }),
  context: { capturedAt: '2026-03-15T12:00:00.000Z', source: 'manual' },
  notes: '',
  people: [],
  details: [],
  photoIds: [],
  createdAt: '2026-03-15T12:00:00.000Z',
  updatedAt: '2026-03-15T12:00:00.000Z',
  ...overrides,
});
