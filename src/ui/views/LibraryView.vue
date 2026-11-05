<script setup lang="ts">
import { computed, ref } from 'vue';
import { keywordSearch } from '../../core/keyword';
import { groupIntoStacks, type StackMode } from '../../core/stacks';
import MapCard from '../components/MapCard.vue';
import { isLoaded, maps } from '../library';
import { plural } from '../format';

const MODES: readonly { value: StackMode; label: string }[] = [
  { value: 'category', label: 'Category' },
  { value: 'place', label: 'Place' },
  { value: 'date', label: 'Date' },
];

const mode = ref<StackMode>('category');
const filter = ref('');

const visible = computed(() =>
  filter.value.trim() === ''
    ? maps.value
    : keywordSearch(filter.value, maps.value).map((hit) => hit.map),
);
const stacks = computed(() => groupIntoStacks(visible.value, mode.value));
</script>

<template>
  <section v-if="isLoaded && maps.length === 0" class="empty-state">
    <h1>Plot the first thing you have an opinion about</h1>
    <p>
      A meal, a hiking trail, a film. Choose what matters about it, drag each point to how
      you feel, and STKR keeps it on this device.
    </p>
    <RouterLink class="button button-primary" to="/new">New map</RouterLink>
  </section>

  <section v-else-if="isLoaded">
    <header class="page-head">
      <h1>Stacks</h1>
      <p class="page-note">{{ plural(maps.length, 'map') }} on this device</p>
    </header>

    <div class="toolbar">
      <fieldset class="segmented">
        <legend>Group by</legend>
        <label v-for="option in MODES" :key="option.value">
          <input v-model="mode" type="radio" name="stack-mode" :value="option.value" />
          <span>{{ option.label }}</span>
        </label>
      </fieldset>
      <label class="field toolbar-filter">
        <span>Filter by word</span>
        <input v-model="filter" type="search" autocomplete="off" />
      </label>
    </div>

    <p v-if="stacks.length === 0" class="page-note">No maps contain “{{ filter }}”.</p>

    <section v-for="stack in stacks" :key="stack.key" class="stack">
      <h2 class="stack-title">
        {{ stack.label }}
        <span class="stack-count">{{ stack.maps.length }}</span>
      </h2>
      <div class="stack-maps">
        <MapCard v-for="map in stack.maps" :key="map.id" :map="map" />
      </div>
    </section>
  </section>
</template>
