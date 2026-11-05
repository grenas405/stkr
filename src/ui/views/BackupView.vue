<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  MAX_ARCHIVE_BYTES,
  bytesToBase64,
  encodeArchive,
  parseArchive,
  planImport,
  type ArchivedPhoto,
  type DecodedPhoto,
} from '../../core/archive';
import type { RadarMap } from '../../core/radar-map';
import { clearAll, deletePhoto, getMeta, getPhoto, putMap, putPhoto, setMeta } from '../../io/db';
import { isStoragePersistent, requestPersistentStorage, saveFile } from '../../io/files';
import { cleanPhoto } from '../../io/photos';
import { formatDateTime, plural } from '../format';
import { maps, reloadMaps } from '../library';

const LAST_EXPORT = 'lastExportAt';

const lastExportAt = ref<string | null>(null);
const isPersistent = ref(false);
const isWorking = ref(false);
const report = ref('');
const rejected = ref<readonly string[]>([]);
const error = ref('');
const wipeText = ref('');
const WIPE_WORD = 'delete';

const canWipe = computed(() => wipeText.value.trim().toLowerCase() === WIPE_WORD);

const collectPhotos = async (collection: readonly RadarMap[]): Promise<readonly ArchivedPhoto[]> => {
  const photos: ArchivedPhoto[] = [];
  for (const id of collection.flatMap((map) => map.photoIds)) {
    const photo = await getPhoto(id);
    if (photo) {
      photos.push({ id, data: bytesToBase64(new Uint8Array(await photo.blob.arrayBuffer())) });
    }
  }
  return photos;
};

const exportBackup = async (): Promise<void> => {
  isWorking.value = true;
  error.value = '';
  report.value = '';
  const now = new Date().toISOString();
  const archive = encodeArchive(maps.value, await collectPhotos(maps.value), now);
  saveFile(
    new Blob([JSON.stringify(archive)], { type: 'application/json' }),
    `stkr-backup-${now.slice(0, 10)}.json`,
  );
  await setMeta(LAST_EXPORT, now);
  lastExportAt.value = now;
  report.value = `Exported ${plural(maps.value.length, 'map')}.`;
  isWorking.value = false;
};

// Photos are cleaned like any new upload. An id already in use is never overwritten.
const importPhoto = async (photo: DecodedPhoto): Promise<string | null> => {
  if (await getPhoto(photo.id)) return null;
  const cleaned = await cleanPhoto(new Blob([photo.bytes.slice()]));
  if (!cleaned.ok) return cleaned.error;
  await putPhoto({ id: photo.id, blob: cleaned.value });
  return null;
};

const importBackup = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  error.value = '';
  report.value = '';
  rejected.value = [];
  if (file.size > MAX_ARCHIVE_BYTES) {
    error.value = 'This file is larger than the 256 MB limit.';
    return;
  }
  isWorking.value = true;
  const parsed = parseArchive(await file.text());
  if (!parsed.ok) {
    error.value = parsed.error;
    isWorking.value = false;
    return;
  }
  const plan = planImport(maps.value, parsed.value.maps);
  const accepted = [...plan.add, ...plan.update];
  const wanted = new Set(accepted.flatMap((map) => map.photoIds));
  const photoErrors: string[] = [];
  for (const photo of parsed.value.photos.filter((candidate) => wanted.has(candidate.id))) {
    const problem = await importPhoto(photo);
    if (problem !== null) photoErrors.push(problem);
  }
  for (const map of plan.update) {
    const previous = maps.value.find((current) => current.id === map.id);
    const dropped = previous?.photoIds.filter((id) => !map.photoIds.includes(id)) ?? [];
    await Promise.all(dropped.map(deletePhoto));
  }
  await Promise.all(accepted.map(putMap));
  await reloadMaps();
  rejected.value = [...parsed.value.rejected, ...photoErrors];
  report.value =
    `Added ${plural(plan.add.length, 'map')}, updated ${plan.update.length}, ` +
    `skipped ${plan.skippedCount} already up to date.`;
  isWorking.value = false;
};

const protectStorage = async (): Promise<void> => {
  isPersistent.value = await requestPersistentStorage();
  if (!isPersistent.value) {
    report.value = 'The browser declined. Exporting regularly is the safest protection.';
  }
};

const wipe = async (): Promise<void> => {
  if (!canWipe.value) return;
  await clearAll();
  await reloadMaps();
  wipeText.value = '';
  lastExportAt.value = null;
  report.value = 'Deleted everything on this device.';
};

onMounted(async () => {
  lastExportAt.value = (await getMeta(LAST_EXPORT)) ?? null;
  isPersistent.value = await isStoragePersistent();
});
</script>

<template>
  <section class="backup">
    <header class="page-head">
      <h1>Backup</h1>
      <p class="page-note">
        Your maps live only in this browser. If you clear its data or lose the device, they’re
        gone unless you’ve exported them.
      </p>
    </header>

    <div class="backup-section">
      <h2 class="group-title">Export</h2>
      <p>
        <template v-if="lastExportAt">Last exported {{ formatDateTime(lastExportAt) }}.</template>
        <template v-else>You haven’t exported a backup yet.</template>
      </p>
      <p class="page-note">
        The file isn’t encrypted and includes your notes, places and photos. Keep it somewhere private.
      </p>
      <button class="button button-primary" type="button" :disabled="isWorking" @click="exportBackup">
        Export backup
      </button>
    </div>

    <div class="backup-section">
      <h2 class="group-title">Import</h2>
      <p>New maps are added and newer versions replace older ones. Nothing else changes.</p>
      <label class="button file-button">
        Import backup
        <input
          class="visually-hidden"
          data-testid="import-input"
          type="file"
          accept="application/json,.json"
          :disabled="isWorking"
          @change="importBackup"
        />
      </label>
    </div>

    <p v-if="report" class="notice" role="status">{{ report }}</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <div v-if="rejected.length" class="notice">
      <p>{{ plural(rejected.length, 'entry', 'entries') }} couldn’t be imported:</p>
      <ul>
        <li v-for="(reason, index) in rejected.slice(0, 10)" :key="index">{{ reason }}</li>
      </ul>
    </div>

    <div class="backup-section">
      <h2 class="group-title">Protect from automatic clearing</h2>
      <p v-if="isPersistent">This browser won’t clear your maps automatically to free up space.</p>
      <template v-else>
        <p>Browsers can clear site data when the device runs low on space. You can ask yours not to.</p>
        <button class="button" type="button" @click="protectStorage">Protect my maps</button>
      </template>
    </div>

    <div class="backup-section">
      <h2 class="group-title">Delete everything</h2>
      <p>Removes every map and photo from this device. To confirm, type “{{ WIPE_WORD }}”.</p>
      <div class="wipe-row">
        <label class="field">
          <span>Confirmation</span>
          <input v-model="wipeText" data-testid="wipe-input" autocomplete="off" />
        </label>
        <button class="button button-danger" type="button" :disabled="!canWipe" @click="wipe">
          Delete everything
        </button>
      </div>
    </div>
  </section>
</template>
