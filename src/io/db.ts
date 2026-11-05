// IndexedDB access. All persistence lives here, and it never leaves the browser.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { RadarMap } from '../core/radar-map';

export type StoredPhoto = { readonly id: string; readonly blob: Blob };

export type StoredEmbedding = {
  readonly mapId: string;
  readonly modelId: string;
  readonly hash: string;
  readonly vector: Float32Array;
};

interface StkrSchema extends DBSchema {
  maps: { key: string; value: RadarMap };
  photos: { key: string; value: StoredPhoto };
  embeddings: { key: string; value: StoredEmbedding };
  meta: { key: string; value: string };
}

type Db = IDBPDatabase<StkrSchema>;

const open = (): Promise<Db> =>
  openDB<StkrSchema>('stkr', 1, {
    upgrade(db) {
      db.createObjectStore('maps', { keyPath: 'id' });
      db.createObjectStore('photos', { keyPath: 'id' });
      db.createObjectStore('embeddings', { keyPath: 'mapId' });
      db.createObjectStore('meta');
    },
  });

let connection: Promise<Db> | null = null;
const database = (): Promise<Db> => (connection ??= open());

export const getAllMaps = async (): Promise<readonly RadarMap[]> =>
  (await database()).getAll('maps');

export const getMap = async (id: string): Promise<RadarMap | undefined> =>
  (await database()).get('maps', id);

export const putMap = async (map: RadarMap): Promise<void> => {
  await (await database()).put('maps', map);
};

// Removes the map and everything that belongs only to it, atomically.
export const deleteMap = async (map: RadarMap): Promise<void> => {
  const tx = (await database()).transaction(['maps', 'photos', 'embeddings'], 'readwrite');
  await Promise.all([
    tx.objectStore('maps').delete(map.id),
    tx.objectStore('embeddings').delete(map.id),
    ...map.photoIds.map((id) => tx.objectStore('photos').delete(id)),
    tx.done,
  ]);
};

export const getPhoto = async (id: string): Promise<StoredPhoto | undefined> =>
  (await database()).get('photos', id);

export const putPhoto = async (photo: StoredPhoto): Promise<void> => {
  await (await database()).put('photos', photo);
};

export const deletePhoto = async (id: string): Promise<void> => {
  await (await database()).delete('photos', id);
};

export const getEmbedding = async (mapId: string): Promise<StoredEmbedding | undefined> =>
  (await database()).get('embeddings', mapId);

export const putEmbedding = async (embedding: StoredEmbedding): Promise<void> => {
  await (await database()).put('embeddings', embedding);
};

export const getMeta = async (key: string): Promise<string | undefined> =>
  (await database()).get('meta', key);

export const setMeta = async (key: string, value: string): Promise<void> => {
  await (await database()).put('meta', value, key);
};

export const clearAll = async (): Promise<void> => {
  const tx = (await database()).transaction(['maps', 'photos', 'embeddings', 'meta'], 'readwrite');
  await Promise.all([
    tx.objectStore('maps').clear(),
    tx.objectStore('photos').clear(),
    tx.objectStore('embeddings').clear(),
    tx.objectStore('meta').clear(),
    tx.done,
  ]);
};
