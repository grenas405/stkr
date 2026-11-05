<script setup lang="ts">
import { computed } from 'vue';
import { magnitudeOf, overallScore, type RadarMap } from '../../core/radar-map';
import { placeLabel } from '../../core/stacks';
import { formatDate, outOfTen } from '../format';
import RadarChart from './RadarChart.vue';

const props = defineProps<{ map: RadarMap }>();

const names = computed(() => props.map.axes.map((axis) => axis.name));
const magnitudes = computed(() =>
  props.map.axes.map((axis) => magnitudeOf(axis.value, props.map.scale)),
);
const place = computed(() => placeLabel(props.map));
const hasPlace = computed(() => props.map.context.placeName || props.map.context.location);
</script>

<template>
  <RouterLink class="map-card" :to="`/maps/${map.id}`">
    <RadarChart
      compact
      :names="names"
      :magnitudes="magnitudes"
      :scale="map.scale"
      :label="`Radar shape of ${map.name}`"
    />
    <span class="map-card-name">{{ map.name }}</span>
    <span class="map-card-score">
      {{ outOfTen(overallScore(map)) }}<span class="visually-hidden"> out of 10</span>
    </span>
    <span class="map-card-meta">
      {{ formatDate(map.context.capturedAt) }}<template v-if="hasPlace">, {{ place }}</template>
    </span>
  </RouterLink>
</template>
