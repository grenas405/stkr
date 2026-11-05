<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  axisFavour,
  formatValue,
  magnitudeOf,
  overallScore,
  type RadarMap,
} from '../../core/radar-map';
import { categoryLabel } from '../../core/stacks';
import { getMap } from '../../io/db';
import PhotoThumb from '../components/PhotoThumb.vue';
import RadarChart from '../components/RadarChart.vue';
import { formatDateTime, outOfTen, scaleText } from '../format';
import { removeMap } from '../library';

const route = useRoute();
const router = useRouter();

const map = shallowRef<RadarMap | null>(null);
const isMissing = shallowRef(false);
const isConfirmingDelete = shallowRef(false);

watch(
  () => route.params.id,
  async (id) => {
    if (typeof id !== 'string') return;
    const found = await getMap(id);
    map.value = found ?? null;
    isMissing.value = !found;
  },
  { immediate: true },
);

const names = computed(() => map.value?.axes.map((axis) => axis.name) ?? []);
const magnitudes = computed(() => {
  const current = map.value;
  return current ? current.axes.map((axis) => magnitudeOf(axis.value, current.scale)) : [];
});

const confirmDelete = async (): Promise<void> => {
  if (map.value === null) return;
  await removeMap(map.value);
  await router.push('/');
};
</script>

<template>
  <section v-if="isMissing" class="empty-state">
    <h1>This map isn’t on this device</h1>
    <p>It may have been deleted, or it may be saved in another browser.</p>
    <RouterLink class="button button-primary" to="/">Go to stacks</RouterLink>
  </section>

  <article v-else-if="map" class="map-view">
    <header class="map-head">
      <p class="page-note">{{ categoryLabel(map) }}</p>
      <h1>{{ map.name }}</h1>
    </header>

    <div class="map-rose">
      <RadarChart
        sweep
        :names="names"
        :magnitudes="magnitudes"
        :scale="map.scale"
        :label="`Radar chart of ${map.name}. The ratings are in the table that follows.`"
      />
    </div>

    <div class="map-facts">
      <p class="overall">
        <span class="overall-number">{{ outOfTen(overallScore(map)) }}</span>
        <span>overall, out of 10</span>
      </p>
      <table class="values">
        <caption class="page-note">Rated from {{ scaleText(map.scale) }}</caption>
        <tbody>
          <tr v-for="axis in map.axes" :key="axis.id">
            <th scope="row">
              {{ axis.name }}
              <span v-if="!axis.higherIsBetter" class="values-hint">lower is better</span>
            </th>
            <td class="values-number">{{ formatValue(axis.value) }}</td>
            <td class="values-bar-cell">
              <span class="bar" :title="`Favour ${outOfTen(axisFavour(axis, map.scale))} out of 10`">
                <span class="bar-fill" :style="{ width: `${axisFavour(axis, map.scale) * 100}%` }"></span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <dl class="facts">
        <dt>Recorded</dt>
        <dd>{{ formatDateTime(map.context.capturedAt) }}</dd>
        <template v-if="map.context.placeName">
          <dt>Place</dt>
          <dd>{{ map.context.placeName }}</dd>
        </template>
        <template v-if="map.context.location">
          <dt>Coordinates</dt>
          <dd>{{ map.context.location.lat.toFixed(4) }}, {{ map.context.location.lon.toFixed(4) }}</dd>
        </template>
        <template v-if="map.people.length">
          <dt>People</dt>
          <dd>{{ map.people.join(', ') }}</dd>
        </template>
        <template v-if="map.tags.length">
          <dt>Tags</dt>
          <dd>{{ map.tags.join(', ') }}</dd>
        </template>
        <template v-for="(detail, index) in map.details" :key="index">
          <dt>{{ detail.label }}</dt>
          <dd>{{ detail.value }}</dd>
        </template>
      </dl>

      <p v-if="map.notes" class="notes">{{ map.notes }}</p>

      <div v-if="map.photoIds.length" class="photo-grid">
        <PhotoThumb v-for="id in map.photoIds" :key="id" :photo-id="id" :alt="`Photo from ${map.name}`" />
      </div>

      <div class="wizard-actions">
        <RouterLink class="button" :to="`/maps/${map.id}/edit`">Edit map</RouterLink>
        <button v-if="!isConfirmingDelete" class="button" type="button" @click="isConfirmingDelete = true">
          Delete map
        </button>
      </div>
      <div v-if="isConfirmingDelete" class="confirm" role="alertdialog" aria-label="Confirm deletion">
        <p>Delete “{{ map.name }}” and its photos? This can’t be undone unless you have a backup.</p>
        <div class="wizard-actions">
          <button class="button" type="button" @click="isConfirmingDelete = false">Keep map</button>
          <button class="button button-danger" type="button" @click="confirmDelete">Delete map</button>
        </div>
      </div>
    </div>
  </article>
</template>
