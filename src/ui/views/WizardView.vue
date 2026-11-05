<script setup lang="ts">
// Creates or edits a map in three steps: axes, ratings, then optional details.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  draftScale,
  draftToMap,
  emptyDraft,
  isoToLocalInput,
  mapToDraft,
  type Draft,
  type DraftAxis,
} from '../../core/draft';
import { LIMITS, suggestAxisNames, type RadarMap } from '../../core/radar-map';
import { validateRadarMap, validateScale } from '../../core/validate';
import { deletePhoto, getMap, putPhoto } from '../../io/db';
import { readPosition } from '../../io/geolocation';
import { cleanPhoto } from '../../io/photos';
import PhotoThumb from '../components/PhotoThumb.vue';
import RadarChart from '../components/RadarChart.vue';
import { valueText } from '../format';
import { maps, saveMap } from '../library';

type PendingPhoto = { readonly id: string; readonly blob: Blob; readonly url: string };

const route = useRoute();
const router = useRouter();
const heading = useTemplateRef<HTMLHeadingElement>('heading');

const mapId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null));
const existing = shallowRef<RadarMap | null>(null);

const localNow = (): string => {
  const now = new Date();
  return isoToLocalInput(now.toISOString(), now.getTimezoneOffset());
};

const newAxis = (name = ''): DraftAxis => ({
  id: crypto.randomUUID(),
  name,
  magnitude: 0.5,
  higherIsBetter: true,
});

const startingAxes = (count: number): readonly DraftAxis[] =>
  Array.from({ length: count }, () => newAxis());

const draft = ref<Draft>({ ...emptyDraft(localNow()), axes: startingAxes(5) });
const step = ref(1);
const error = ref('');
const photoError = ref('');
const locationStatus = ref('');
const isSaving = ref(false);
const pendingPhotos = shallowRef<readonly PendingPhoto[]>([]);
const removedPhotoIds = shallowRef<readonly string[]>([]);

const suggestions = computed(() => {
  const inUse = new Set(draft.value.axes.map((axis) => axis.name.trim().toLowerCase()));
  return suggestAxisNames(maps.value).filter((name) => !inUse.has(name.toLowerCase()));
});
const axisNames = computed(() => draft.value.axes.map((axis) => axis.name));
const magnitudes = computed(() => draft.value.axes.map((axis) => axis.magnitude));
const scale = computed(() => {
  const candidate = validateScale(draftScale(draft.value));
  return candidate.ok ? candidate.value : { min: 0, max: 10 };
});
const photoCount = computed(() => draft.value.photoIds.length + pendingPhotos.value.length);
const pageTitle = computed(() => (existing.value ? `Edit ${existing.value.name}` : 'New map'));
const stepTitle = computed(() =>
  ['What matters about it?', 'How does each one rate?', 'What is this map of?'][step.value - 1],
);

const patchAxis = (index: number, patch: Partial<DraftAxis>): void => {
  draft.value = {
    ...draft.value,
    axes: draft.value.axes.map((axis, position) =>
      position === index ? { ...axis, ...patch } : axis,
    ),
  };
};

const setAxisCount = (count: number): void => {
  const axes = draft.value.axes;
  draft.value = {
    ...draft.value,
    axes:
      count <= axes.length
        ? axes.slice(0, count)
        : [...axes, ...startingAxes(count - axes.length)],
  };
};

const useSuggestion = (name: string): void => {
  const blank = draft.value.axes.findIndex((axis) => axis.name.trim() === '');
  if (blank >= 0) patchAxis(blank, { name });
  else if (draft.value.axes.length < LIMITS.maxAxes) {
    draft.value = { ...draft.value, axes: [...draft.value.axes, newAxis(name)] };
  }
};

const axesProblem = (axes: readonly DraftAxis[]): string | null => {
  const names = axes.map((axis) => axis.name.trim().toLowerCase());
  if (names.some((name) => name === '')) return 'Name every axis before continuing.';
  if (new Set(names).size !== names.length) return 'Give each axis a different name.';
  return null;
};

const goTo = async (next: number): Promise<void> => {
  step.value = next;
  error.value = '';
  await nextTick();
  heading.value?.focus();
};

const continueFromAxes = (): void => {
  const problem = axesProblem(draft.value.axes);
  if (problem !== null) error.value = problem;
  else void goTo(2);
};

const continueFromRatings = (): void => {
  const candidate = validateScale(draftScale(draft.value));
  if (!candidate.ok) error.value = candidate.error;
  else void goTo(3);
};

const captureLocation = async (): Promise<void> => {
  locationStatus.value = 'Finding your location…';
  const position = await readPosition();
  if (position.ok) {
    draft.value = { ...draft.value, location: position.value };
    locationStatus.value = '';
  } else {
    locationStatus.value = position.error;
  }
};

const clearLocation = (): void => {
  draft.value = { ...draft.value, location: null };
};

const addDetail = (): void => {
  draft.value = { ...draft.value, details: [...draft.value.details, { label: '', value: '' }] };
};

const patchDetail = (index: number, patch: { label?: string; value?: string }): void => {
  draft.value = {
    ...draft.value,
    details: draft.value.details.map((detail, position) =>
      position === index ? { ...detail, ...patch } : detail,
    ),
  };
};

const removeDetail = (index: number): void => {
  draft.value = {
    ...draft.value,
    details: draft.value.details.filter((_, position) => position !== index),
  };
};

const onPhotosPicked = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement;
  photoError.value = '';
  const room = LIMITS.maxPhotos - photoCount.value;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (files.length > room) photoError.value = `A map can have up to ${LIMITS.maxPhotos} photos.`;
  for (const file of files.slice(0, room)) {
    const cleaned = await cleanPhoto(file);
    if (!cleaned.ok) {
      photoError.value = cleaned.error;
      continue;
    }
    pendingPhotos.value = [
      ...pendingPhotos.value,
      { id: crypto.randomUUID(), blob: cleaned.value, url: URL.createObjectURL(cleaned.value) },
    ];
  }
};

const removePending = (photo: PendingPhoto): void => {
  URL.revokeObjectURL(photo.url);
  pendingPhotos.value = pendingPhotos.value.filter((item) => item.id !== photo.id);
};

const removeSaved = (id: string): void => {
  draft.value = { ...draft.value, photoIds: draft.value.photoIds.filter((item) => item !== id) };
  removedPhotoIds.value = [...removedPhotoIds.value, id];
};

const save = async (): Promise<void> => {
  const now = new Date().toISOString();
  const candidate = draftToMap(
    { ...draft.value, photoIds: [...draft.value.photoIds, ...pendingPhotos.value.map((p) => p.id)] },
    {
      id: existing.value?.id ?? crypto.randomUUID(),
      createdAt: existing.value?.createdAt ?? now,
      now,
    },
  );
  const result = validateRadarMap(candidate);
  if (!result.ok) {
    error.value = result.error;
    return;
  }
  isSaving.value = true;
  await Promise.all(pendingPhotos.value.map(({ id, blob }) => putPhoto({ id, blob })));
  await saveMap(result.value);
  await Promise.all(removedPhotoIds.value.map(deletePhoto));
  await router.push(`/maps/${result.value.id}`);
};

onMounted(async () => {
  if (mapId.value === null) return;
  const found = await getMap(mapId.value);
  if (!found) {
    await router.replace('/');
    return;
  }
  existing.value = found;
  draft.value = mapToDraft(found, new Date(found.context.capturedAt).getTimezoneOffset());
});

onBeforeUnmount(() => {
  for (const photo of pendingPhotos.value) URL.revokeObjectURL(photo.url);
});
</script>

<template>
  <section class="wizard">
    <header class="page-head">
      <p class="page-note">{{ pageTitle }}, step {{ step }} of 3</p>
      <h1 ref="heading" tabindex="-1">{{ stepTitle }}</h1>
    </header>

    <!-- Step 1: axes -->
    <form v-if="step === 1" class="wizard-grid" @submit.prevent="continueFromAxes">
      <div class="wizard-chart">
        <RadarChart
          :names="axisNames"
          :magnitudes="magnitudes"
          :scale="scale"
          label="Preview of the map's shape"
        />
      </div>
      <div class="wizard-form">
        <label class="field">
          <span>Number of axes: {{ draft.axes.length }}</span>
          <input
            type="range"
            :min="LIMITS.minAxes"
            :max="LIMITS.maxAxes"
            :value="draft.axes.length"
            @input="setAxisCount(Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <ol class="axis-names">
          <li v-for="(axis, index) in draft.axes" :key="axis.id">
            <label class="field">
              <span>Axis {{ index + 1 }}</span>
              <input
                :value="axis.name"
                :maxlength="LIMITS.axisNameLength"
                autocomplete="off"
                @input="patchAxis(index, { name: ($event.target as HTMLInputElement).value })"
              />
            </label>
          </li>
        </ol>
        <div v-if="suggestions.length" class="suggestions">
          <p class="page-note">Used before</p>
          <button
            v-for="name in suggestions"
            :key="name"
            type="button"
            class="chip"
            @click="useSuggestion(name)"
          >
            {{ name }}
          </button>
        </div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="wizard-actions">
          <RouterLink class="button" :to="existing ? `/maps/${existing.id}` : '/'">Cancel</RouterLink>
          <button class="button button-primary" type="submit">Continue to ratings</button>
        </div>
      </div>
    </form>

    <!-- Step 2: drag ratings -->
    <form v-else-if="step === 2" class="wizard-grid" @submit.prevent="continueFromRatings">
      <div class="wizard-chart">
        <RadarChart
          editable
          :names="axisNames"
          :magnitudes="magnitudes"
          :scale="scale"
          label="Drag a point, or focus it and use the arrow keys, to set each rating"
          @change="(index, magnitude) => patchAxis(index, { magnitude })"
        />
        <p class="page-note chart-hint">Drag a point, or use the arrow keys.</p>
      </div>
      <div class="wizard-form">
        <div class="scale-fields">
          <label class="field">
            <span>Scale from</span>
            <input v-model.number="draft.scaleMin" type="number" step="any" required />
          </label>
          <label class="field">
            <span>To</span>
            <input v-model.number="draft.scaleMax" type="number" step="any" required />
          </label>
          <label class="field">
            <span>Unit (optional)</span>
            <input v-model="draft.unit" :maxlength="LIMITS.unitLength" autocomplete="off" />
          </label>
        </div>
        <table class="values">
          <caption class="visually-hidden">Current rating for each axis</caption>
          <thead>
            <tr>
              <th scope="col">Axis</th>
              <th scope="col" class="values-number">Rating</th>
              <th scope="col">Better when</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(axis, index) in draft.axes" :key="axis.id">
              <th scope="row">{{ axis.name }}</th>
              <td class="values-number">{{ valueText(axis.magnitude, scale) }}</td>
              <td>
                <label class="polarity">
                  <span class="visually-hidden">{{ axis.name }} is better when</span>
                  <select
                    :value="axis.higherIsBetter ? 'higher' : 'lower'"
                    @change="patchAxis(index, { higherIsBetter: ($event.target as HTMLSelectElement).value === 'higher' })"
                  >
                    <option value="higher">Higher</option>
                    <option value="lower">Lower</option>
                  </select>
                </label>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="wizard-actions">
          <button class="button" type="button" @click="goTo(1)">Back to axes</button>
          <button class="button button-primary" type="submit">Continue to details</button>
        </div>
      </div>
    </form>

    <!-- Step 3: details -->
    <form v-else class="wizard-grid" @submit.prevent="save">
      <div class="wizard-chart">
        <RadarChart
          :names="axisNames"
          :magnitudes="magnitudes"
          :scale="scale"
          :label="`Shape of ${draft.name || 'this map'}`"
        />
      </div>
      <div class="wizard-form">
        <label class="field">
          <span>Name</span>
          <input v-model="draft.name" :maxlength="LIMITS.nameLength" required autocomplete="off" />
        </label>
        <p class="page-note">Only the name is required. Add as much or as little as you like.</p>
        <label class="field">
          <span>Category</span>
          <input v-model="draft.category" :maxlength="LIMITS.categoryLength" autocomplete="off" />
        </label>
        <label class="field">
          <span>Tags, separated by commas</span>
          <input v-model="draft.tagsText" autocomplete="off" />
        </label>
        <label class="field">
          <span>Date and time</span>
          <input v-model="draft.capturedAtLocal" type="datetime-local" required />
        </label>

        <div class="field-group">
          <label class="field">
            <span>Place name</span>
            <input v-model="draft.placeName" :maxlength="LIMITS.placeNameLength" autocomplete="off" />
          </label>
          <div class="location-row">
            <template v-if="draft.location">
              <span class="location-value">
                {{ draft.location.lat.toFixed(4) }}, {{ draft.location.lon.toFixed(4) }}
              </span>
              <button class="button" type="button" @click="clearLocation">Remove location</button>
            </template>
            <button v-else class="button" type="button" @click="captureLocation">
              Use my current location
            </button>
          </div>
          <p v-if="locationStatus" class="page-note" role="status">{{ locationStatus }}</p>
        </div>

        <label class="field">
          <span>People, separated by commas</span>
          <input v-model="draft.peopleText" autocomplete="off" />
        </label>
        <label class="field">
          <span>Notes</span>
          <textarea v-model="draft.notes" rows="4" :maxlength="LIMITS.notesLength"></textarea>
        </label>

        <div class="field-group">
          <h2 class="group-title">Details</h2>
          <div v-for="(detail, index) in draft.details" :key="index" class="detail-row">
            <label class="field">
              <span>Label</span>
              <input
                :value="detail.label"
                :maxlength="LIMITS.detailLabelLength"
                autocomplete="off"
                @input="patchDetail(index, { label: ($event.target as HTMLInputElement).value })"
              />
            </label>
            <label class="field">
              <span>Value</span>
              <input
                :value="detail.value"
                :maxlength="LIMITS.detailValueLength"
                autocomplete="off"
                @input="patchDetail(index, { value: ($event.target as HTMLInputElement).value })"
              />
            </label>
            <button class="button" type="button" @click="removeDetail(index)">Remove</button>
          </div>
          <button
            v-if="draft.details.length < LIMITS.maxDetails"
            class="button"
            type="button"
            @click="addDetail"
          >
            Add a detail
          </button>
        </div>

        <div class="field-group">
          <h2 class="group-title">Photos</h2>
          <div class="photo-grid">
            <figure v-for="id in draft.photoIds" :key="id" class="photo-item">
              <PhotoThumb :photo-id="id" alt="Photo attached to this map" />
              <button class="button" type="button" @click="removeSaved(id)">Remove</button>
            </figure>
            <figure v-for="photo in pendingPhotos" :key="photo.id" class="photo-item">
              <img class="photo" :src="photo.url" alt="Photo to attach to this map" />
              <button class="button" type="button" @click="removePending(photo)">Remove</button>
            </figure>
          </div>
          <div v-if="photoCount < LIMITS.maxPhotos" class="location-row">
            <label class="button file-button">
              Take a photo
              <input
                class="visually-hidden"
                type="file"
                accept="image/*"
                capture="environment"
                @change="onPhotosPicked"
              />
            </label>
            <label class="button file-button">
              Choose photos
              <input
                class="visually-hidden"
                data-testid="photo-input"
                type="file"
                accept="image/*"
                multiple
                @change="onPhotosPicked"
              />
            </label>
          </div>
          <p class="page-note">Location data inside photos is removed when you add them.</p>
          <p v-if="photoError" class="form-error" role="alert">{{ photoError }}</p>
        </div>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="wizard-actions">
          <button class="button" type="button" @click="goTo(2)">Back to ratings</button>
          <button class="button button-primary" type="submit" :disabled="isSaving">Save map</button>
        </div>
      </div>
    </form>
  </section>
</template>
