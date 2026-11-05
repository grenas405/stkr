// The app's side of the model worker, plus the index of stored map embeddings.

import type { IndexedMap } from '../core/predict';
import { contentHash, describeMap, type RadarMap } from '../core/radar-map';
import { fail, ok, type Result } from '../core/validate';
import { getEmbedding, putEmbedding } from './db';
import { MODEL_ID, type EmbedRequest, type EmbedResponse } from './embed-protocol';

type Pending = (response: EmbedResponse) => void;

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();

const failAllPending = (error: string): void => {
  for (const [id, settle] of pending) settle({ id, ok: false, error });
  pending.clear();
  worker = null;
};

const startWorker = (): Worker => {
  const started = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' });
  started.addEventListener('message', ({ data }: MessageEvent<EmbedResponse>) => {
    pending.get(data.id)?.(data);
    pending.delete(data.id);
  });
  started.addEventListener('error', (event) => failAllPending(event.message));
  return started;
};

export const embedTexts = (texts: readonly string[]): Promise<Result<readonly Float32Array[]>> =>
  new Promise((resolve) => {
    worker ??= startWorker();
    const id = (nextId += 1);
    pending.set(id, (response) =>
      resolve(response.ok ? ok(response.vectors) : fail(response.error)),
    );
    worker.postMessage({ id, texts } satisfies EmbedRequest);
  });

// Returns a stored vector when the map's text hasn't changed, otherwise embeds it again.
const vectorFor = async (map: RadarMap): Promise<Result<Float32Array>> => {
  const text = describeMap(map);
  const hash = contentHash(text);
  const stored = await getEmbedding(map.id);
  if (stored?.hash === hash && stored.modelId === MODEL_ID) return ok(stored.vector);
  const embedded = await embedTexts([text]);
  if (!embedded.ok) return embedded;
  const vector = embedded.value[0];
  if (vector === undefined) return fail('The model returned no result.');
  await putEmbedding({ mapId: map.id, modelId: MODEL_ID, hash, vector });
  return ok(vector);
};

export const buildIndex = async (
  maps: readonly RadarMap[],
  onProgress: (done: number, total: number) => void = () => {},
): Promise<Result<readonly IndexedMap[]>> => {
  const indexed: IndexedMap[] = [];
  for (const map of maps) {
    const vector = await vectorFor(map);
    if (!vector.ok) return vector;
    indexed.push({ map, vector: vector.value });
    onProgress(indexed.length, maps.length);
  }
  return ok(indexed);
};
