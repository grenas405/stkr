// Derives the network of maps. Links are computed from the data, never stored.

import { normaliseLabel, overallScore, type RadarMap } from './radar-map';
import { haversineKm, profileSimilarity, sharedAxisNames } from './similarity';
import { categoryLabel, groupIntoStacks, type StackMode } from './stacks';

export type EdgeReason = 'category' | 'tag' | 'axes' | 'place' | 'ratings';

export type GraphEdge = {
  readonly source: string;
  readonly target: string;
  readonly weight: number;
  readonly reasons: readonly EdgeReason[];
};

export type GraphNode = {
  readonly id: string;
  readonly label: string;
  readonly kind: 'map' | 'stack';
  readonly score: number;
  readonly group: string;
  readonly size: number;
};

export type Graph = {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
};

export const NEARBY_KM = 1;
export const SIMILAR_RATINGS = 0.85;

const sharedTagCount = (a: RadarMap, b: RadarMap): number => {
  const tagsInB = new Set(b.tags.map(normaliseLabel));
  return a.tags.filter((tag) => tagsInB.has(normaliseLabel(tag))).length;
};

const isSameCategory = (a: RadarMap, b: RadarMap): boolean =>
  a.category.trim().length > 0 &&
  normaliseLabel(a.category) === normaliseLabel(b.category);

const isNearby = (a: RadarMap, b: RadarMap): boolean => {
  const [placeA, placeB] = [a.context.location, b.context.location];
  return placeA !== undefined && placeB !== undefined && haversineKm(placeA, placeB) <= NEARBY_KM;
};

// Why two maps are related and how strongly. A weight of 0 means they aren't.
export const relate = (
  a: RadarMap,
  b: RadarMap,
): { readonly weight: number; readonly reasons: readonly EdgeReason[] } => {
  const tags = sharedTagCount(a, b);
  const axes = sharedAxisNames(a, b).length;
  const ratings = profileSimilarity(a, b);
  const similarRatings = ratings !== null && ratings >= SIMILAR_RATINGS;
  const signals: readonly (readonly [boolean, EdgeReason, number])[] = [
    [isSameCategory(a, b), 'category', 2],
    [tags > 0, 'tag', tags * 1.5],
    [axes >= 2, 'axes', axes * 0.25],
    [isNearby(a, b), 'place', 1.5],
    [similarRatings, 'ratings', 1],
  ];
  const present = signals.filter(([isPresent]) => isPresent);
  return {
    weight: present.reduce((sum, [, , value]) => sum + value, 0),
    reasons: present.map(([, reason]) => reason),
  };
};

const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Keeps an edge when it is among the strongest k of either endpoint.
export const deriveEdges = (maps: readonly RadarMap[], k = 4): readonly GraphEdge[] => {
  const candidates: GraphEdge[] = [];
  maps.forEach((a, index) => {
    for (const b of maps.slice(index + 1)) {
      const { weight, reasons } = relate(a, b);
      if (weight > 0) candidates.push({ source: a.id, target: b.id, weight, reasons });
    }
  });
  const strongestFirst = [...candidates].sort(
    (x, y) =>
      y.weight - x.weight ||
      edgeKey(x.source, x.target).localeCompare(edgeKey(y.source, y.target)),
  );
  const degree = new Map<string, number>();
  const kept: GraphEdge[] = [];
  for (const edge of strongestFirst) {
    const [sourceDegree, targetDegree] = [
      degree.get(edge.source) ?? 0,
      degree.get(edge.target) ?? 0,
    ];
    if (sourceDegree < k || targetDegree < k) {
      kept.push(edge);
      degree.set(edge.source, sourceDegree + 1);
      degree.set(edge.target, targetDegree + 1);
    }
  }
  return kept;
};

export const buildMapGraph = (maps: readonly RadarMap[], k = 4): Graph => ({
  nodes: maps.map((map) => ({
    id: map.id,
    label: map.name,
    kind: 'map',
    score: overallScore(map),
    group: categoryLabel(map),
    size: 1,
  })),
  edges: deriveEdges(maps, k),
});

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

// One node per stack; two stacks link when any of their maps are related.
export const buildStackGraph = (maps: readonly RadarMap[], mode: StackMode): Graph => {
  const stacks = groupIntoStacks(maps, mode);
  const stackOf = new Map(
    stacks.flatMap((stack) => stack.maps.map((map) => [map.id, stack.key] as const)),
  );
  const totals = new Map<string, GraphEdge>();
  for (const edge of deriveEdges(maps)) {
    const source = stackOf.get(edge.source);
    const target = stackOf.get(edge.target);
    if (source === undefined || target === undefined || source === target) continue;
    const key = edgeKey(source, target);
    const existing = totals.get(key);
    totals.set(key, {
      source: source < target ? source : target,
      target: source < target ? target : source,
      weight: (existing?.weight ?? 0) + edge.weight,
      reasons: [...new Set([...(existing?.reasons ?? []), ...edge.reasons])],
    });
  }
  return {
    nodes: stacks.map((stack) => ({
      id: stack.key,
      label: stack.label,
      kind: 'stack',
      score: mean(stack.maps.map(overallScore)),
      group: stack.label,
      size: stack.maps.length,
    })),
    edges: [...totals.values()],
  };
};
