// Messages between the app and the model's Web Worker.

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

export type EmbedRequest = { readonly id: number; readonly texts: readonly string[] };

export type EmbedResponse =
  | { readonly id: number; readonly ok: true; readonly vectors: readonly Float32Array[] }
  | { readonly id: number; readonly ok: false; readonly error: string };
