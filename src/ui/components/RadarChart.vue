<script setup lang="ts">
// Draws a radar map. With `editable`, a press anywhere on the chart grabs the nearest
// axis, and each handle is a keyboard-operable slider.
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import {
  axisAngle,
  labelAnchor,
  magnitudeToPoint,
  nearestAxis,
  pointToMagnitude,
  polarToPoint,
  ringRadii,
  shapePoints,
  shortLabel,
  toSvgPoints,
  type Point,
} from '../../core/radar-geometry';
import { clamp, scaleStep, snapToStep, magnitudeOf, magnitudeToValue, type Scale } from '../../core/radar-map';
import { runProgress } from '../motion';
import { valueText } from '../format';

const props = withDefaults(
  defineProps<{
    names: readonly string[];
    magnitudes: readonly number[];
    scale: Scale;
    editable?: boolean;
    compact?: boolean;
    sweep?: boolean;
    label: string;
  }>(),
  { editable: false, compact: false, sweep: false },
);

const emit = defineEmits<{ change: [index: number, magnitude: number] }>();

const WIDTH = 560;
const HEIGHT = 440;
const COMPACT_SIZE = 200;
const RINGS = 4;

const patternId = useId();
const svg = ref<SVGSVGElement | null>(null);
const dragging = ref<number | null>(null);
const reveal = ref(props.sweep ? 0 : 1);
const sweepAngle = ref<number | null>(null);

const center = computed<Point>(() =>
  props.compact
    ? { x: COMPACT_SIZE / 2, y: COMPACT_SIZE / 2 }
    : { x: WIDTH / 2, y: HEIGHT / 2 },
);
const radius = computed(() => (props.compact ? COMPACT_SIZE / 2 - 8 : 160));
const viewBox = computed(() =>
  props.compact ? `0 0 ${COMPACT_SIZE} ${COMPACT_SIZE}` : `0 0 ${WIDTH} ${HEIGHT}`,
);
const count = computed(() => props.names.length);
const rings = computed(() => ringRadii(radius.value, RINGS));

const spokes = computed(() =>
  props.names.map((_, index) => polarToPoint(center.value, radius.value, axisAngle(index, count.value))),
);
const ringShapes = computed(() =>
  rings.value.map((ring) =>
    toSvgPoints(
      props.names.map((_, index) => polarToPoint(center.value, ring, axisAngle(index, count.value))),
    ),
  ),
);
const handles = computed(() =>
  props.magnitudes.map((magnitude, index) =>
    magnitudeToPoint(magnitude * reveal.value, index, count.value, center.value, radius.value),
  ),
);
const shape = computed(() =>
  toSvgPoints(
    shapePoints(
      props.magnitudes.map((magnitude) => magnitude * reveal.value),
      center.value,
      radius.value,
    ),
  ),
);
const labels = computed(() =>
  props.names.map((name, index) => {
    const angle = axisAngle(index, count.value);
    const point = polarToPoint(center.value, radius.value + 22, angle);
    return {
      text: shortLabel(name.trim() || `Axis ${index + 1}`),
      full: name,
      x: point.x,
      y: point.y + 6,
      anchor: labelAnchor(angle),
    };
  }),
);
const sweepEnd = computed(() =>
  sweepAngle.value === null ? null : polarToPoint(center.value, radius.value, sweepAngle.value),
);

const toSvgSpace = (event: PointerEvent): Point | null => {
  const matrix = svg.value?.getScreenCTM();
  if (!matrix) return null;
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
};

const setFromPointer = (event: PointerEvent, index: number): void => {
  const point = toSvgSpace(event);
  if (point === null) return;
  const magnitude = pointToMagnitude(point, index, count.value, center.value, radius.value);
  emit('change', index, snapped(magnitude));
};

const snapped = (magnitude: number): number =>
  magnitudeOf(snapToStep(magnitudeToValue(magnitude, props.scale), props.scale), props.scale);

const onPointerDown = (event: PointerEvent): void => {
  if (!props.editable) return;
  const point = toSvgSpace(event);
  if (point === null) return;
  const index = nearestAxis(point, count.value, center.value);
  dragging.value = index;
  svg.value?.setPointerCapture(event.pointerId);
  document.querySelectorAll<SVGElement>(`[data-handle="${patternId}-${index}"]`)[0]?.focus();
  setFromPointer(event, index);
  event.preventDefault();
};

const onPointerMove = (event: PointerEvent): void => {
  if (dragging.value !== null) setFromPointer(event, dragging.value);
};

const onPointerUp = (): void => {
  dragging.value = null;
};

const keyboardMagnitude = (key: string, current: number): number | null => {
  const step = scaleStep(props.scale) / (props.scale.max - props.scale.min);
  if (key === 'ArrowUp' || key === 'ArrowRight') return clamp(current + step, 0, 1);
  if (key === 'ArrowDown' || key === 'ArrowLeft') return clamp(current - step, 0, 1);
  if (key === 'PageUp') return clamp(current + step * 4, 0, 1);
  if (key === 'PageDown') return clamp(current - step * 4, 0, 1);
  if (key === 'Home') return 0;
  if (key === 'End') return 1;
  return null;
};

const onHandleKey = (event: KeyboardEvent, index: number): void => {
  const next = keyboardMagnitude(event.key, props.magnitudes[index] ?? 0);
  if (next === null) return;
  event.preventDefault();
  emit('change', index, snapped(next));
};

// The one unprompted animation: a single sweep that reveals the shape.
let stopSweep: () => void = () => {};
const playSweep = (): void => {
  stopSweep();
  stopSweep = runProgress(
    1100,
    (progress) => {
      reveal.value = progress;
      sweepAngle.value = progress >= 1 ? null : -Math.PI / 2 + progress * 2 * Math.PI;
    },
    'outQuad',
  );
};

onMounted(() => {
  if (props.sweep) playSweep();
});
onBeforeUnmount(() => stopSweep());
watch(count, () => {
  reveal.value = 1;
});
</script>

<template>
  <svg
    ref="svg"
    class="radar"
    :class="{ 'radar-editable': editable, 'radar-compact': compact, 'radar-dragging': dragging !== null }"
    :viewBox="viewBox"
    :role="editable ? 'group' : 'img'"
    :aria-label="label"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <defs>
      <pattern :id="patternId" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line class="radar-hatch" x1="0" y1="0" x2="0" y2="7" />
      </pattern>
    </defs>

    <polygon v-for="(ring, index) in ringShapes" :key="index" class="radar-ring" :points="ring" />
    <line
      v-for="(spoke, index) in spokes"
      :key="`spoke-${index}`"
      class="radar-spoke"
      :x1="center.x"
      :y1="center.y"
      :x2="spoke.x"
      :y2="spoke.y"
    />

    <polygon class="radar-area" :points="shape" :fill="`url(#${patternId})`" />
    <polygon class="radar-outline" :points="shape" />
    <line
      v-if="sweepEnd"
      class="radar-sweep"
      :x1="center.x"
      :y1="center.y"
      :x2="sweepEnd.x"
      :y2="sweepEnd.y"
    />

    <template v-if="!compact">
      <text
        v-for="(item, index) in labels"
        :key="`label-${index}`"
        class="radar-label"
        :x="item.x"
        :y="item.y"
        :text-anchor="item.anchor"
      >
        <title>{{ item.full }}</title>
        {{ item.text }}
      </text>
    </template>

    <template v-if="!compact">
      <g
        v-for="(point, index) in handles"
        :key="`handle-${index}`"
        class="radar-handle"
        :data-handle="`${patternId}-${index}`"
        :role="editable ? 'slider' : undefined"
        :tabindex="editable ? 0 : undefined"
        :aria-label="editable ? names[index] : undefined"
        :aria-valuemin="editable ? scale.min : undefined"
        :aria-valuemax="editable ? scale.max : undefined"
        :aria-valuenow="editable ? Number(valueText(magnitudes[index] ?? 0, scale)) : undefined"
        @keydown="onHandleKey($event, index)"
      >
        <circle class="radar-handle-focus" :cx="point.x" :cy="point.y" r="17" />
        <circle class="radar-handle-dot" :cx="point.x" :cy="point.y" :r="editable ? 9 : 5" />
        <title>{{ names[index] }}: {{ valueText(magnitudes[index] ?? 0, scale) }}</title>
      </g>
    </template>
  </svg>
</template>
