import { describe, expect, it } from 'vitest';
import { axesFrom, makeMap, uuidFor } from './fixtures';
import {
  axisFavour,
  contentHash,
  magnitudeOf,
  magnitudeToValue,
  overallScore,
  scaleStep,
  snapToStep,
  suggestAxisNames,
} from './radar-map';
import { magnitudeToPoint, pointToMagnitude, shapePoints } from './radar-geometry';
import { cosineSimilarity, haversineKm, profileSimilarity } from './similarity';
import { groupIntoStacks, monthLabel, placeLabel } from './stacks';
import { buildMapGraph, buildStackGraph, deriveEdges, relate } from './graph';
import { predictAffinity, predictFromMatches } from './predict';
import { keywordSearch, tokenize } from './keyword';

describe('scale', () => {
  const scale = { min: 0, max: 10 };

  it('round-trips magnitude and value', () => {
    expect(magnitudeToValue(magnitudeOf(7.5, scale), scale)).toBeCloseTo(7.5);
  });

  it('handles scales that do not start at zero', () => {
    expect(magnitudeOf(0, { min: -5, max: 5 })).toBe(0.5);
  });

  it('snaps to the step and stays in range', () => {
    expect(scaleStep(scale)).toBe(0.5);
    expect(snapToStep(7.3, scale)).toBe(7.5);
    expect(snapToStep(99, scale)).toBe(10);
    expect(snapToStep(-99, scale)).toBe(0);
  });

  it('flips favour when lower is better', () => {
    const axis = { id: uuidFor(1), name: 'Price', value: 2, higherIsBetter: false };
    expect(axisFavour(axis, scale)).toBeCloseTo(0.8);
    expect(axisFavour({ ...axis, higherIsBetter: true }, scale)).toBeCloseTo(0.2);
  });

  it('averages favour into an overall score', () => {
    expect(overallScore(makeMap(1, { axes: axesFrom({ A: 10, B: 5, C: 0 }) }))).toBeCloseTo(0.5);
  });
});

describe('geometry', () => {
  const center = { x: 100, y: 100 };

  it('points axis 0 straight up', () => {
    const point = magnitudeToPoint(1, 0, 4, center, 50);
    expect(point.x).toBeCloseTo(100);
    expect(point.y).toBeCloseTo(50);
  });

  it.each([3, 5, 8, 12])('round-trips a magnitude on every axis of %i', (count) => {
    for (let index = 0; index < count; index += 1) {
      const point = magnitudeToPoint(0.37, index, count, center, 80);
      expect(pointToMagnitude(point, index, count, center, 80)).toBeCloseTo(0.37);
    }
  });

  it('clamps pointers behind the center and past the rim', () => {
    expect(pointToMagnitude({ x: 100, y: 180 }, 0, 4, center, 50)).toBe(0);
    expect(pointToMagnitude({ x: 100, y: -500 }, 0, 4, center, 50)).toBe(1);
  });

  it('produces one point per axis', () => {
    expect(shapePoints([0.1, 0.2, 0.3, 0.4, 0.5], center, 50)).toHaveLength(5);
  });
});

describe('similarity', () => {
  it('scores identical, orthogonal and mismatched vectors', () => {
    expect(cosineSimilarity([1, 2], [1, 2])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it('measures real distances', () => {
    const paris = { lat: 48.8566, lon: 2.3522 };
    const london = { lat: 51.5074, lon: -0.1278 };
    expect(haversineKm(paris, london)).toBeGreaterThan(330);
    expect(haversineKm(paris, london)).toBeLessThan(350);
  });

  it('compares profiles only with enough shared axes', () => {
    const a = makeMap(1, { axes: axesFrom({ X: 10, Y: 10, Z: 10 }) });
    const b = makeMap(2, { axes: axesFrom({ x: 10, y: 10, z: 0 }) });
    expect(profileSimilarity(a, b)).toBeCloseTo(2 / 3);
    expect(profileSimilarity(a, makeMap(3, { axes: axesFrom({ X: 1, P: 1, Q: 1 }) }))).toBeNull();
  });

  it('compares favour across different scales', () => {
    const a = makeMap(1, { axes: axesFrom({ X: 10, Y: 10, Z: 10 }) });
    const b = makeMap(2, { scale: { min: 0, max: 100 }, axes: axesFrom({ X: 100, Y: 100, Z: 100 }) });
    expect(profileSimilarity(a, b)).toBeCloseTo(1);
  });
});

describe('stacks', () => {
  it('groups by category case-insensitively and files blanks as Unfiled', () => {
    const stacks = groupIntoStacks(
      [
        makeMap(1, { category: 'Food' }),
        makeMap(2, { category: 'food ' }),
        makeMap(3),
      ],
      'category',
    );
    expect(stacks.map((stack) => [stack.label, stack.maps.length])).toEqual([
      ['Food', 2],
      ['Unfiled', 1],
    ]);
  });

  it('uses a place name, then rounded coordinates, then a fallback', () => {
    const context = { capturedAt: '2026-01-01T00:00:00.000Z', source: 'device' as const };
    expect(placeLabel(makeMap(1, { context: { ...context, placeName: 'Tokyo' } }))).toBe('Tokyo');
    expect(
      placeLabel(makeMap(2, { context: { ...context, location: { lat: 35.6789, lon: 139.7654 } } })),
    ).toBe('35.68, 139.77');
    expect(placeLabel(makeMap(3))).toBe('No place recorded');
  });

  it('sorts date stacks newest first', () => {
    const at = (capturedAt: string) => ({ context: { capturedAt, source: 'manual' as const } });
    const stacks = groupIntoStacks(
      [makeMap(1, at('2025-02-01T00:00:00.000Z')), makeMap(2, at('2026-07-01T00:00:00.000Z'))],
      'date',
    );
    expect(stacks.map((stack) => stack.label)).toEqual(['July 2026', 'February 2025']);
    expect(monthLabel('2026-12')).toBe('December 2026');
  });

  it('does not mutate its input', () => {
    const maps = Object.freeze([makeMap(1), makeMap(2)]);
    expect(() => groupIntoStacks(maps, 'date')).not.toThrow();
  });
});

describe('graph', () => {
  it('explains why maps are related', () => {
    const near = { capturedAt: '2026-01-01T00:00:00.000Z', source: 'device' as const };
    const a = makeMap(1, {
      category: 'Food',
      tags: ['Spicy'],
      context: { ...near, location: { lat: 35, lon: 139 } },
    });
    const b = makeMap(2, {
      category: 'food',
      tags: ['spicy'],
      context: { ...near, location: { lat: 35.001, lon: 139 } },
    });
    expect(relate(a, b).reasons).toEqual(['category', 'tag', 'axes', 'place', 'ratings']);
  });

  it('does not link maps with nothing in common', () => {
    const a = makeMap(1, { axes: axesFrom({ A: 1, B: 2, C: 3 }) });
    const b = makeMap(2, { axes: axesFrom({ X: 1, Y: 2, Z: 3 }) });
    expect(relate(a, b).weight).toBe(0);
    expect(deriveEdges([a, b])).toEqual([]);
  });

  it('does not treat two blank categories as a match', () => {
    expect(relate(makeMap(1), makeMap(2)).reasons).not.toContain('category');
  });

  it('caps links so a large category stays readable', () => {
    const maps = Array.from({ length: 40 }, (_, index) => makeMap(index + 1, { category: 'Food' }));
    const edges = deriveEdges(maps, 4);
    expect(edges.length).toBeLessThan((40 * 39) / 2);
    expect(edges.length).toBeLessThanOrEqual(40 * 4);
    const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
    expect(connected.size).toBe(40);
  });

  it('collapses maps into stack nodes with sizes and links', () => {
    const maps = [
      makeMap(1, { category: 'Food', tags: ['fun'] }),
      makeMap(2, { category: 'Food' }),
      makeMap(3, { category: 'Film', tags: ['fun'] }),
    ];
    const graph = buildStackGraph(maps, 'category');
    expect(graph.nodes.map((node) => [node.label, node.size])).toEqual([
      ['Film', 1],
      ['Food', 2],
    ]);
    expect(graph.edges).toHaveLength(1);
    expect(buildMapGraph(maps).nodes).toHaveLength(3);
  });
});

describe('prediction', () => {
  const high = makeMap(1, { name: 'Ramen', axes: axesFrom({ Taste: 10, Price: 10, Service: 10 }) });
  const low = makeMap(2, { name: 'Opera', axes: axesFrom({ Taste: 0, Price: 0, Service: 0 }) });

  it('says when it has nothing to go on instead of guessing', () => {
    const result = predictAffinity([1, 0], [{ map: high, vector: [0, 1] }]);
    expect(result.status).toBe('not-enough-data');
  });

  it('says so with an empty collection', () => {
    expect(predictAffinity([1, 0], []).status).toBe('not-enough-data');
  });

  it('follows the closest map', () => {
    const result = predictAffinity(
      [1, 0],
      [
        { map: high, vector: [1, 0.05] },
        { map: low, vector: [0.4, 1] },
      ],
    );
    expect(result.status).toBe('estimate');
    if (result.status !== 'estimate') return;
    expect(result.score).toBeGreaterThan(0.7);
    expect(result.evidence[0]?.map.name).toBe('Ramen');
  });

  it('lowers confidence when the evidence disagrees', () => {
    const agree = predictFromMatches([
      { map: high, similarity: 0.9 },
      { map: { ...high, id: uuidFor(9) }, similarity: 0.9 },
    ]);
    const disagree = predictFromMatches([
      { map: high, similarity: 0.9 },
      { map: low, similarity: 0.9 },
    ]);
    expect(agree.status === 'estimate' && agree.confidence).toBe('high');
    expect(disagree.status === 'estimate' && disagree.confidence).toBe('low');
  });

  it('estimates axes and counts their samples', () => {
    const result = predictFromMatches([
      { map: high, similarity: 0.8 },
      { map: low, similarity: 0.8 },
    ]);
    expect(result.status === 'estimate' && result.axes[0]?.sampleCount).toBe(2);
    expect(result.status === 'estimate' && result.axes[0]?.favour).toBeCloseTo(0.5);
  });
});

describe('keyword search', () => {
  it('tokenises across languages and punctuation', () => {
    expect(tokenize("Café, ramen-bar's #1!")).toEqual(['café', 'ramen', 'bar', 's', '1']);
  });

  it('ranks by share of words matched', () => {
    const maps = [makeMap(1, { name: 'Spicy ramen' }), makeMap(2, { name: 'Ramen museum' })];
    const hits = keywordSearch('spicy ramen', maps);
    expect(hits.map((hit) => hit.map.name)).toEqual(['Spicy ramen', 'Ramen museum']);
    expect(hits[0]?.matched).toBe(1);
  });

  it('ignores filler words, which would otherwise match by prefix', () => {
    const maps = [makeMap(1, { name: 'Opera', axes: axesFrom({ Atmosphere: 1, Interest: 1, Offer: 1 }) })];
    expect(keywordSearch('a bowl of udon in hot broth', maps)).toEqual([]);
    expect(keywordSearch('the of a', maps)).toEqual([]);
  });

  it('finds people, and returns nothing for no match or an empty query', () => {
    expect(keywordSearch('sam', [makeMap(1, { people: ['Sam'] })])).toHaveLength(1);
    expect(keywordSearch('zzz', [makeMap(1)])).toEqual([]);
    expect(keywordSearch('  ', [makeMap(1)])).toEqual([]);
  });
});

describe('helpers', () => {
  it('changes the hash when text changes', () => {
    expect(contentHash('a')).not.toBe(contentHash('b'));
    expect(contentHash('a')).toBe(contentHash('a'));
  });

  it('suggests the most used axis names first', () => {
    const maps = [
      makeMap(1, { axes: axesFrom({ Taste: 1, Value: 1, Vibe: 1 }) }),
      makeMap(2, { axes: axesFrom({ taste: 1, Noise: 1, Light: 1 }) }),
    ];
    expect(suggestAxisNames(maps)[0]).toBe('Taste');
    expect(suggestAxisNames(maps)).toHaveLength(5);
  });
});
