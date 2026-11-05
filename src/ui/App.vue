<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { reloadMaps } from './library';

const route = useRoute();
const main = useTemplateRef<HTMLElement>('main');

onMounted(reloadMaps);

// Moves keyboard and screen reader users to the new content after navigating.
watch(
  () => route.path,
  (_, previous) => {
    if (previous !== undefined) main.value?.focus();
  },
);
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-head">
    <RouterLink class="wordmark" to="/" aria-label="STKR, go to stacks">STKR</RouterLink>
    <nav class="site-nav" aria-label="Main">
      <RouterLink to="/" exact-active-class="is-current">Stacks</RouterLink>
      <RouterLink to="/graph" active-class="is-current">Graph</RouterLink>
      <RouterLink to="/ask" active-class="is-current">Ask</RouterLink>
      <RouterLink to="/backup" active-class="is-current">Backup</RouterLink>
    </nav>
    <RouterLink class="button button-primary site-new" to="/new">New map</RouterLink>
  </header>
  <main id="main" ref="main" tabindex="-1" class="site-main">
    <RouterView :key="route.path" />
  </main>
</template>
