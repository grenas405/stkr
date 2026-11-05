// Runs the real model to justify DEFAULT_PREDICT_OPTIONS.threshold in src/core/predict.ts.
// Related text must clear the threshold, and unrelated text must not.

import { expect, test } from '@playwright/test';
import { readdir } from 'node:fs/promises';
import { cosineSimilarity } from '../src/core/similarity';
import { DEFAULT_PREDICT_OPTIONS } from '../src/core/predict';

const describeSample = (name: string, category: string, tags: string, axes: string, notes: string) =>
  `${name}. ${category}. ${tags}. ${axes}. ${notes}`;

const DOCS = {
  ramen: describeSample('Tonkotsu ramen at Ichi', 'Food', 'noodles, japanese, soup', 'Taste, Value, Service', 'Rich pork broth with thin noodles.'),
  pho: describeSample('Pho on Main Street', 'Food', 'noodles, vietnamese, soup', 'Taste, Value, Service', 'Fragrant beef noodle soup.'),
  hike: describeSample('Mountain ridge hike', 'Outdoors', 'hiking, views', 'Scenery, Effort, Crowds', 'Steep climb with huge views at the summit.'),
  opera: describeSample('Grand opera night', 'Culture', 'opera, music', 'Performance, Comfort, Value', 'Long, and I struggled to stay awake.'),
  film: describeSample('Sci-fi film at the Rex', 'Film', 'cinema, science fiction', 'Story, Effects, Acting', 'Great visuals and a thin plot.'),
};

const RELATED: readonly (readonly [string, keyof typeof DOCS])[] = [
  ['a bowl of udon in hot broth', 'ramen'],
  ['ramen', 'ramen'],
  ['Thai noodle soup restaurant', 'pho'],
  ['backpacking trip in the alps', 'hike'],
  ['an evening at the symphony orchestra concert', 'opera'],
  ['a new space movie at the cinema', 'film'],
];

const UNRELATED: readonly (readonly [string, keyof typeof DOCS])[] = [
  ['quarterly corporate tax filing software', 'ramen'],
  ['quarterly corporate tax filing software', 'hike'],
  ['quarterly corporate tax filing software', 'opera'],
  ['replacement windshield wipers for my truck', 'pho'],
  ['replacement windshield wipers for my truck', 'film'],
  ['a mortgage refinancing broker', 'opera'],
  ['a mortgage refinancing broker', 'hike'],
  // Harder: other leisure topics must not leak into each other's evidence.
  ['a bowl of udon in hot broth', 'opera'],
  ['a bowl of udon in hot broth', 'hike'],
  ['a bowl of udon in hot broth', 'film'],
  ['an evening at the symphony orchestra concert', 'ramen'],
  ['an evening at the symphony orchestra concert', 'hike'],
  ['backpacking trip in the alps', 'ramen'],
  ['backpacking trip in the alps', 'opera'],
  ['a new space movie at the cinema', 'pho'],
  ['a new space movie at the cinema', 'hike'],
];

test('the prediction threshold separates related from unrelated text', async ({ page }) => {
  const workerFile = (await readdir('dist/assets')).find((file) => file.startsWith('embed.worker'));
  expect(workerFile).toBeTruthy();
  await page.goto('/');

  const texts = [...new Set([...Object.values(DOCS), ...RELATED.map(([q]) => q), ...UNRELATED.map(([q]) => q)])];
  const vectors = await page.evaluate(
    ({ url, texts }) =>
      new Promise<number[][]>((resolve, reject) => {
        const worker = new Worker(url, { type: 'module' });
        worker.onerror = (event) => reject(new Error(event.message));
        worker.onmessage = ({ data }) =>
          data.ok ? resolve(data.vectors.map((v: Float32Array) => [...v])) : reject(new Error(data.error));
        worker.postMessage({ id: 1, texts });
      }),
    { url: `/assets/${workerFile}`, texts },
  );

  const vectorFor = new Map(texts.map((text, index) => [text, vectors[index] as number[]]));
  const score = ([query, doc]: readonly [string, keyof typeof DOCS]): number =>
    cosineSimilarity(vectorFor.get(query) as number[], vectorFor.get(DOCS[doc]) as number[]);

  const related = RELATED.map((pair) => ({ pair: pair.join(' ~ '), score: score(pair) }));
  const unrelated = UNRELATED.map((pair) => ({ pair: pair.join(' ~ '), score: score(pair) }));
  console.table(related);
  console.table(unrelated);

  const { threshold } = DEFAULT_PREDICT_OPTIONS;
  for (const { pair, score: value } of related) expect(value, pair).toBeGreaterThanOrEqual(threshold);
  for (const { pair, score: value } of unrelated) expect(value, pair).toBeLessThan(threshold);
});
