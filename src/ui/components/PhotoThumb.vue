<script setup lang="ts">
// Loads a stored photo into a blob URL for as long as it is on screen.
import { onBeforeUnmount, shallowRef, watch } from 'vue';
import { getPhoto } from '../../io/db';

const props = defineProps<{ photoId: string; alt: string }>();

const url = shallowRef<string | null>(null);

const release = (): void => {
  if (url.value !== null) URL.revokeObjectURL(url.value);
  url.value = null;
};

watch(
  () => props.photoId,
  async (id) => {
    release();
    const photo = await getPhoto(id);
    if (photo && id === props.photoId) url.value = URL.createObjectURL(photo.blob);
  },
  { immediate: true },
);

onBeforeUnmount(release);
</script>

<template>
  <img v-if="url" class="photo" :src="url" :alt="alt" />
  <span v-else class="photo photo-missing" role="img" :aria-label="alt"></span>
</template>
