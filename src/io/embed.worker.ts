// Runs the embedding model off the main thread, using only files from this origin.

import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { MODEL_ID, type EmbedRequest, type EmbedResponse } from './embed-protocol';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';
// The wasm cache loads code from blob: URLs, which the CSP rightly forbids.
env.useWasmCache = false;

const wasm = env.backends.onnx.wasm;
if (wasm) {
  wasm.wasmPaths = {
    wasm: '/ort/ort-wasm-simd-threaded.wasm',
    mjs: '/ort/ort-wasm-simd-threaded.mjs',
  };
}

let extractor: Promise<FeatureExtractionPipeline> | null = null;

const loadExtractor = (): Promise<FeatureExtractionPipeline> =>
  (extractor ??= pipeline('feature-extraction', MODEL_ID, {
    device: 'wasm',
    dtype: 'q8',
  }) as Promise<FeatureExtractionPipeline>);

const embedOne = async (text: string): Promise<Float32Array> => {
  const model = await loadExtractor();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Float32Array.from(output.data as ArrayLike<number>);
};

const handle = async ({ id, texts }: EmbedRequest): Promise<EmbedResponse> => {
  try {
    const vectors: Float32Array[] = [];
    for (const text of texts) vectors.push(await embedOne(text));
    return { id, ok: true, vectors };
  } catch (error) {
    extractor = null;
    return { id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

self.addEventListener('message', (event: MessageEvent<EmbedRequest>) => {
  void handle(event.data).then((response) => self.postMessage(response));
});
