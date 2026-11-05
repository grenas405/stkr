// The in-memory copy of the saved maps that views share.

import { shallowRef } from 'vue';
import type { RadarMap } from '../core/radar-map';
import { deleteMap, getAllMaps, putMap } from '../io/db';

export const maps = shallowRef<readonly RadarMap[]>([]);
export const isLoaded = shallowRef(false);

export const reloadMaps = async (): Promise<void> => {
  maps.value = await getAllMaps();
  isLoaded.value = true;
};

export const saveMap = async (map: RadarMap): Promise<void> => {
  await putMap(map);
  await reloadMaps();
};

export const removeMap = async (map: RadarMap): Promise<void> => {
  await deleteMap(map);
  await reloadMaps();
};
