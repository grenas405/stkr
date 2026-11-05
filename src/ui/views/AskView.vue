<script setup lang="ts">
// Semantic search and fit prediction. Everything runs on this device.
import { computed, ref, shallowRef } from 'vue';
import { keywordSearch, type KeywordHit } from '../../core/keyword';
import { predictAffinity, type Prediction } from '../../core/predict';
import { buildIndex, embedTexts } from '../../io/embedder';
import MapCard from '../components/MapCard.vue';
import { outOfTen, plural } from '../format';
import { maps } from '../library';

const MAX_QUERY_LENGTH = 500;

const query = ref('');
const askedQuery = ref('');
const status = ref('');
const isWorking = ref(false);
const prediction = shallowRef<Prediction | null>(null);
const keywordHits = shallowRef<readonly KeywordHit[]>([]);
const modelFailed = ref(false);

const verdict = (score: number): string => {
  if (score >= 0.7) return 'Likely to suit you';
  if (score >= 0.45) return 'Could go either way';
  return 'Unlikely to suit you';
};

const confidenceText: Readonly<Record<'low' | 'medium' | 'high', string>> = {
  low: 'Low confidence: the closest maps are few, distant or disagree.',
  medium: 'Medium confidence.',
  high: 'High confidence: several close maps agree.',
};

const evidenceIds = computed(() =>
  prediction.value?.status === 'estimate'
    ? new Set(prediction.value.evidence.map((match) => match.map.id))
    : new Set<string>(),
);
const otherHits = computed(() => keywordHits.value.filter((hit) => !evidenceIds.value.has(hit.map.id)));

const predict = async (text: string): Promise<Prediction | null> => {
  status.value = 'Loading the on-device model. The first time can take a minute…';
  const queryVector = await embedTexts([text]);
  if (!queryVector.ok || queryVector.value[0] === undefined) return null;
  const index = await buildIndex(maps.value, (done, total) => {
    status.value = `Reading your maps: ${done} of ${total}…`;
  });
  return index.ok ? predictAffinity(queryVector.value[0], index.value) : null;
};

const ask = async (): Promise<void> => {
  const text = query.value.trim().slice(0, MAX_QUERY_LENGTH);
  if (text === '' || isWorking.value) return;
  isWorking.value = true;
  askedQuery.value = text;
  prediction.value = null;
  modelFailed.value = false;
  keywordHits.value = keywordSearch(text, maps.value);
  const result = await predict(text);
  prediction.value = result;
  modelFailed.value = result === null;
  status.value = '';
  isWorking.value = false;
};
</script>

<template>
  <section class="ask">
    <header class="page-head">
      <h1>Would I like it?</h1>
      <p class="page-note">
        Describe anything you’re curious about. STKR compares it with your {{ plural(maps.length, 'map') }}
        on this device, and nothing you type leaves it.
      </p>
    </header>

    <form class="ask-form" role="search" @submit.prevent="ask">
      <label class="field">
        <span>What are you curious about?</span>
        <input
          v-model="query"
          type="search"
          :maxlength="MAX_QUERY_LENGTH"
          autocomplete="off"
          enterkeyhint="search"
        />
      </label>
      <button class="button button-primary" type="submit" :disabled="isWorking || maps.length === 0">
        Ask
      </button>
    </form>

    <p v-if="maps.length === 0" class="page-note">
      Predictions come from your own ratings.
      <RouterLink to="/new">Create a map</RouterLink> to get started.
    </p>

    <p v-if="status" class="page-note" role="status">{{ status }}</p>

    <p v-if="modelFailed" class="notice" role="alert">
      The on-device model couldn’t load, so there’s no prediction. These results come from
      matching words only. Try again when you’re online.
    </p>

    <section v-if="prediction?.status === 'estimate'" class="verdict" aria-live="polite">
      <p class="page-note">For “{{ askedQuery }}”</p>
      <h2 class="verdict-title">{{ verdict(prediction.score) }}</h2>
      <p class="overall">
        <span class="overall-number">{{ outOfTen(prediction.score) }}</span>
        <span>estimated fit, out of 10</span>
      </p>
      <p>
        An estimate from {{ plural(prediction.evidence.length, 'similar map') }}, not a certainty.
        {{ confidenceText[prediction.confidence] }}
      </p>

      <table v-if="prediction.axes.length" class="values">
        <caption class="page-note">What you’d probably think, from those maps</caption>
        <tbody>
          <tr v-for="axis in prediction.axes.slice(0, 8)" :key="axis.name">
            <th scope="row">{{ axis.name }}</th>
            <td class="values-number">{{ outOfTen(axis.favour) }}</td>
            <td class="values-bar-cell">
              <span class="bar" :title="`Based on ${plural(axis.sampleCount, 'map')}`">
                <span class="bar-fill" :style="{ width: `${axis.favour * 100}%` }"></span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <h3 class="group-title">Based on</h3>
      <div class="stack-maps">
        <MapCard v-for="match in prediction.evidence" :key="match.map.id" :map="match.map" />
      </div>
    </section>

    <section v-else-if="prediction?.status === 'not-enough-data'" class="verdict" aria-live="polite">
      <p class="page-note">For “{{ askedQuery }}”</p>
      <h2 class="verdict-title">Not enough to go on</h2>
      <p>None of your maps are close to this, so STKR won’t guess. Rate something similar and ask again.</p>
    </section>

    <section v-if="otherHits.length && !isWorking" class="ask-hits">
      <h3 class="group-title">Maps containing these words</h3>
      <div class="stack-maps">
        <MapCard v-for="hit in otherHits" :key="hit.map.id" :map="hit.map" />
      </div>
    </section>

    <p v-else-if="modelFailed && keywordHits.length === 0" class="page-note">
      No maps contain those words.
    </p>
  </section>
</template>
