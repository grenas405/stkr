import { describe, expect, it } from 'vitest';
import { buildMapGraph } from '../core/graph';
import { makeMap } from '../core/fixtures';
import { boundsOf, layoutGraph, nodeRadius } from './graph-layout';

describe('layoutGraph', () => {
  const graph = buildMapGraph(
    Array.from({ length: 8 }, (_, index) => makeMap(index + 1, { category: 'Food' })),
  );

  it('positions every node and is repeatable', () => {
    const first = layoutGraph(graph);
    expect(first.size).toBe(8);
    expect([...first.entries()]).toEqual([...layoutGraph(graph).entries()]);
  });

  it('keeps nodes from overlapping', () => {
    const points = [...layoutGraph(graph).values()];
    points.forEach((a, index) => {
      for (const b of points.slice(index + 1)) {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(nodeRadius('map', 1));
      }
    });
  });

  it('handles an empty graph', () => {
    const empty = layoutGraph({ nodes: [], edges: [] });
    expect(empty.size).toBe(0);
    expect(boundsOf(empty).width).toBeGreaterThan(0);
  });
});
