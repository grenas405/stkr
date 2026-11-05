// Predicts how well something new would suit the user, from their own past ratings.
// The estimate is a similarity-weighted average, and always names the maps behind it.

import { axisFavour, normaliseLabel, overallScore, type RadarMap } from './radar-map';
import { cosineSimilarity } from './similarity';

export type IndexedMap = { readonly map: RadarMap; readonly vector: ArrayLike<number> };

export type Match = { readonly map: RadarMap; readonly similarity: number };

export type AxisEstimate = {
  readonly name: string;
  readonly favour: number;
  readonly sampleCount: number;
};

export type Confidence = 'low' | 'medium' | 'high';

export type Prediction =
  | { readonly status: 'not-enough-data'; readonly nearest: readonly Match[] }
  | {
      readonly status: 'estimate';
      readonly score: number;
      readonly confidence: Confidence;
      readonly evidence: readonly Match[];
      readonly axes: readonly AxisEstimate[];
    };

export type PredictOptions = {
  // Below this cosine similarity a map says nothing about the query.
  // Measured against the real model by e2e/calibrate.spec.ts.
  readonly threshold: number;
  readonly maxEvidence: number;
};

export const DEFAULT_PREDICT_OPTIONS: PredictOptions = { threshold: 0.25, maxEvidence: 5 };

export const rankBySimilarity = (
  queryVector: ArrayLike<number>,
  indexed: readonly IndexedMap[],
): readonly Match[] =>
  indexed
    .map(({ map, vector }) => ({ map, similarity: cosineSimilarity(queryVector, vector) }))
    .sort((a, b) => b.similarity - a.similarity);

const weightOf = (match: Match): number => match.similarity ** 2;

const weightedMean = (pairs: readonly (readonly [value: number, weight: number])[]): number => {
  const totalWeight = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  return pairs.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight;
};

// More close matches that agree with each other earn more confidence.
export const confidenceOf = (matches: readonly Match[], score: number): Confidence => {
  const spread = Math.sqrt(
    weightedMean(matches.map((match) => [(overallScore(match.map) - score) ** 2, weightOf(match)])),
  );
  const evidence = matches.reduce((sum, match) => sum + match.similarity, 0);
  if (evidence >= 1.5 && spread <= 0.15) return 'high';
  if (evidence >= 0.7 && spread <= 0.3) return 'medium';
  return 'low';
};

export const estimateAxes = (matches: readonly Match[]): readonly AxisEstimate[] => {
  const groups = new Map<string, { name: string; pairs: (readonly [number, number])[] }>();
  for (const match of matches) {
    for (const axis of match.map.axes) {
      const key = normaliseLabel(axis.name);
      const group = groups.get(key) ?? { name: axis.name, pairs: [] };
      groups.set(key, {
        name: group.name,
        pairs: [...group.pairs, [axisFavour(axis, match.map.scale), weightOf(match)]],
      });
    }
  }
  return [...groups.values()]
    .map(({ name, pairs }) => ({ name, favour: weightedMean(pairs), sampleCount: pairs.length }))
    .sort((a, b) => b.sampleCount - a.sampleCount || a.name.localeCompare(b.name));
};

export const predictFromMatches = (
  ranked: readonly Match[],
  options: PredictOptions = DEFAULT_PREDICT_OPTIONS,
): Prediction => {
  const evidence = ranked
    .filter((match) => match.similarity >= options.threshold)
    .slice(0, options.maxEvidence);
  if (evidence.length === 0) return { status: 'not-enough-data', nearest: ranked.slice(0, 3) };
  const score = weightedMean(evidence.map((match) => [overallScore(match.map), weightOf(match)]));
  return {
    status: 'estimate',
    score,
    confidence: confidenceOf(evidence, score),
    evidence,
    axes: estimateAxes(evidence),
  };
};

export const predictAffinity = (
  queryVector: ArrayLike<number>,
  indexed: readonly IndexedMap[],
  options: PredictOptions = DEFAULT_PREDICT_OPTIONS,
): Prediction => predictFromMatches(rankBySimilarity(queryVector, indexed), options);
