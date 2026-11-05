// Plain text search. The fallback when the on-device model can't load.

import { describeMap, type RadarMap } from './radar-map';

export type KeywordHit = { readonly map: RadarMap; readonly matched: number };

// Prefix matching would let these match almost every map ("a" finds "atmosphere").
const FILLER_WORDS: ReadonlySet<string> = new Set(
  ('a an and are as at be but by do for from i if in is it me my new of on or so that the ' +
    'this to was what will with would you your').split(' '),
);

export const tokenize = (text: string): readonly string[] =>
  text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

const queryTokens = (query: string): readonly string[] => [
  ...new Set(tokenize(query).filter((token) => !FILLER_WORDS.has(token))),
];

const searchableText = (map: RadarMap): string =>
  [describeMap(map), map.people.join(' ')].join(' ');

// The share of query words found in a map, from 0 to 1. Matches word prefixes.
export const keywordScore = (tokens: readonly string[], map: RadarMap): number => {
  if (tokens.length === 0) return 0;
  const words = tokenize(searchableText(map));
  const found = tokens.filter((token) => words.some((word) => word.startsWith(token)));
  return found.length / tokens.length;
};

export const keywordSearch = (query: string, maps: readonly RadarMap[]): readonly KeywordHit[] => {
  const tokens = queryTokens(query);
  return maps
    .map((map) => ({ map, matched: keywordScore(tokens, map) }))
    .filter((hit) => hit.matched > 0)
    .sort((a, b) => b.matched - a.matched || a.map.name.localeCompare(b.map.name));
};
