<script setup lang="ts">
// The collection as a network. Maps draw as tiny radar shapes, stacks as ringed nodes.
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import {
  buildMapGraph,
  buildStackGraph,
  type EdgeReason,
  type GraphEdge,
  type GraphNode,
} from '../../core/graph';
import { shapePoints, toSvgPoints } from '../../core/radar-geometry';
import { magnitudeOf, type RadarMap } from '../../core/radar-map';
import { groupIntoStacks, type StackMode } from '../../core/stacks';
import { boundsOf, layoutGraph, nodeRadius, type Positions } from '../graph-layout';
import { outOfTen, plural } from '../format';
import { maps } from '../library';
import { runProgress } from '../motion';

type View = 'maps' | StackMode;

// Above this, individual maps can't be read, so the graph opens on stacks instead.
const AUTO_STACK_ABOVE = 80;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 5;

const VIEWS: readonly { value: View; label: string }[] = [
  { value: 'maps', label: 'Every map' },
  { value: 'category', label: 'Stacks by category' },
  { value: 'place', label: 'Stacks by place' },
  { value: 'date', label: 'Stacks by date' },
];

const REASON_TEXT: Readonly<Record<EdgeReason, string>> = {
  category: 'same category',
  tag: 'shared tags',
  axes: 'shared axes',
  place: 'nearby',
  ratings: 'similar ratings',
};

const view = ref<View>(maps.value.length > AUTO_STACK_ABOVE ? 'category' : 'maps');
const selectedId = ref<string | null>(null);
const showList = ref(false);
const zoom = ref(1);
const pan = ref({ x: 0, y: 0 });
const settle = ref(1);
const svg = ref<SVGSVGElement | null>(null);

const graph = computed(() =>
  view.value === 'maps' ? buildMapGraph(maps.value) : buildStackGraph(maps.value, view.value),
);
const positions = shallowRef<Positions>(new Map());
const isPortrait = (): boolean => window.matchMedia('(max-width: 780px)').matches;
const bounds = computed(() => boundsOf(positions.value, isPortrait()));
const viewBox = computed(() => {
  const { x, y, width, height } = bounds.value;
  return `${x} ${y} ${width} ${height}`;
});
const mapById = computed(() => new Map(maps.value.map((map) => [map.id, map])));

const positionOf = (id: string): { x: number; y: number } => {
  const point = positions.value.get(id) ?? { x: 0, y: 0 };
  return { x: point.x * settle.value, y: point.y * settle.value };
};

const glyphFor = (node: GraphNode): string => {
  const map: RadarMap | undefined = mapById.value.get(node.id);
  if (!map) return '';
  return toSvgPoints(
    shapePoints(
      map.axes.map((axis) => magnitudeOf(axis.value, map.scale)),
      { x: 0, y: 0 },
      nodeRadius('map', 1) - 2,
    ),
  );
};

const ringsFor = (node: GraphNode): readonly number[] => {
  const outer = nodeRadius('stack', node.size);
  const count = Math.min(4, node.size);
  return Array.from({ length: count }, (_, index) => (outer * (index + 1)) / count);
};

const labelFor = (text: string): string => (text.length > 22 ? `${text.slice(0, 21)}…` : text);

const selected = computed(() => graph.value.nodes.find((node) => node.id === selectedId.value) ?? null);

const edgesOf = (id: string): readonly GraphEdge[] =>
  graph.value.edges.filter((edge) => edge.source === id || edge.target === id);

const neighbourIds = computed(() => {
  const id = selectedId.value;
  if (id === null) return new Set<string>();
  return new Set(edgesOf(id).map((edge) => (edge.source === id ? edge.target : edge.source)));
});

const nodeState = (id: string): string => {
  if (selectedId.value === null) return '';
  if (id === selectedId.value) return 'graph-node-selected';
  return neighbourIds.value.has(id) ? '' : 'graph-node-faded';
};

const isEdgeActive = (edge: GraphEdge): boolean =>
  edge.source === selectedId.value || edge.target === selectedId.value;

const nodeLabel = (id: string): string =>
  graph.value.nodes.find((node) => node.id === id)?.label ?? '';

const connections = computed(() => {
  const id = selectedId.value;
  if (id === null) return [];
  return connectionsOf(id);
});

const connectionsOf = (id: string) =>
  edgesOf(id).map((edge) => {
    const otherId = edge.source === id ? edge.target : edge.source;
    return {
      id: otherId,
      label: nodeLabel(otherId),
      reasons: edge.reasons.map((reason) => REASON_TEXT[reason]).join(', '),
    };
  });

const selectedStackMaps = computed(() => {
  if (selected.value?.kind !== 'stack' || view.value === 'maps') return [];
  const key = selected.value.id;
  return groupIntoStacks(maps.value, view.value).find((stack) => stack.key === key)?.maps ?? [];
});

// Settling from the center is the response to opening or changing the view.
let stopSettle: () => void = () => {};
watch(
  graph,
  (next) => {
    selectedId.value = null;
    zoom.value = 1;
    pan.value = { x: 0, y: 0 };
    positions.value = layoutGraph(next, isPortrait());
    stopSettle();
    stopSettle = runProgress(900, (progress) => {
      settle.value = progress;
    });
  },
  { immediate: true },
);
onBeforeUnmount(() => stopSettle());

const setZoom = (next: number): void => {
  zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
};

const onWheel = (event: WheelEvent): void => {
  setZoom(zoom.value * (event.deltaY < 0 ? 1.1 : 0.9));
};

let panStart: { pointerX: number; pointerY: number; panX: number; panY: number } | null = null;

const svgUnitsPerPixel = (): number => {
  const matrix = svg.value?.getScreenCTM();
  return matrix ? 1 / matrix.a : 1;
};

const onBackgroundDown = (event: PointerEvent): void => {
  if ((event.target as Element).closest('.graph-node')) return;
  selectedId.value = null;
  panStart = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    panX: pan.value.x,
    panY: pan.value.y,
  };
  svg.value?.setPointerCapture(event.pointerId);
};

const onPointerMove = (event: PointerEvent): void => {
  if (panStart === null) return;
  const units = svgUnitsPerPixel();
  pan.value = {
    x: panStart.panX + (event.clientX - panStart.pointerX) * units,
    y: panStart.panY + (event.clientY - panStart.pointerY) * units,
  };
};

const onPointerUp = (): void => {
  panStart = null;
};

const showLabels = computed(() => graph.value.nodes.length <= 40 || zoom.value >= 1.6);
</script>

<template>
  <section v-if="maps.length === 0" class="empty-state">
    <h1>The graph starts with your first map</h1>
    <p>Maps link up when they share a category, tags, axes or a place, or were rated alike.</p>
    <RouterLink class="button button-primary" to="/new">New map</RouterLink>
  </section>

  <section v-else class="graph-page">
    <header class="page-head">
      <h1>Graph</h1>
      <p class="page-note">
        {{ plural(graph.nodes.length, view === 'maps' ? 'map' : 'stack') }},
        {{ plural(graph.edges.length, 'link') }}
      </p>
    </header>

    <div class="toolbar">
      <fieldset class="segmented">
        <legend>Show</legend>
        <label v-for="option in VIEWS" :key="option.value">
          <input v-model="view" type="radio" name="graph-view" :value="option.value" />
          <span>{{ option.label }}</span>
        </label>
      </fieldset>
      <div class="zoom-controls">
        <button class="button" type="button" aria-label="Zoom out" @click="setZoom(zoom / 1.3)">−</button>
        <button class="button" type="button" aria-label="Zoom in" @click="setZoom(zoom * 1.3)">+</button>
        <button class="button" type="button" @click="showList = !showList">
          {{ showList ? 'Show graph' : 'Show as list' }}
        </button>
      </div>
    </div>

    <div v-if="showList" class="graph-list">
      <ul>
        <li v-for="node in graph.nodes" :key="node.id">
          <RouterLink v-if="node.kind === 'map'" :to="`/maps/${node.id}`">{{ node.label }}</RouterLink>
          <strong v-else>{{ node.label }} ({{ node.size }})</strong>
          <span class="page-note"> {{ outOfTen(node.score) }} out of 10</span>
          <ul v-if="edgesOf(node.id).length" class="graph-list-links">
            <li v-for="link in connectionsOf(node.id)" :key="link.id">
              {{ link.label }}: {{ link.reasons }}
            </li>
          </ul>
        </li>
      </ul>
    </div>

    <div v-else class="graph-frame" :class="{ 'graph-frame-open': selected }">
      <svg
        ref="svg"
        class="graph"
        :viewBox="viewBox"
        role="group"
        aria-label="Network of your maps. Use Tab to move between nodes and Enter to select one."
        @pointerdown="onBackgroundDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @wheel.prevent="onWheel"
      >
        <g :transform="`translate(${pan.x} ${pan.y}) scale(${zoom})`">
          <line
            v-for="edge in graph.edges"
            :key="`${edge.source}|${edge.target}`"
            class="graph-edge"
            :class="{ 'graph-edge-active': isEdgeActive(edge) }"
            :x1="positionOf(edge.source).x"
            :y1="positionOf(edge.source).y"
            :x2="positionOf(edge.target).x"
            :y2="positionOf(edge.target).y"
          />
          <g
            v-for="node in graph.nodes"
            :key="node.id"
            class="graph-node"
            :class="nodeState(node.id)"
            :transform="`translate(${positionOf(node.id).x} ${positionOf(node.id).y})`"
            role="button"
            tabindex="0"
            :aria-label="`${node.label}, ${outOfTen(node.score)} out of 10`"
            :aria-pressed="node.id === selectedId"
            @click="selectedId = node.id"
            @keydown.enter.prevent="selectedId = node.id"
            @keydown.space.prevent="selectedId = node.id"
          >
            <title>{{ node.label }}, {{ outOfTen(node.score) }} out of 10</title>
            <template v-if="node.kind === 'map'">
              <circle class="graph-disc" :r="nodeRadius('map', 1)" />
              <polygon class="graph-glyph" :points="glyphFor(node)" />
            </template>
            <template v-else>
              <circle
                v-for="(ring, index) in ringsFor(node)"
                :key="index"
                :class="index === ringsFor(node).length - 1 ? 'graph-disc' : 'graph-stack-ring'"
                :r="ring"
              />
              <text class="graph-count" text-anchor="middle" y="6">{{ node.size }}</text>
            </template>
            <text
              v-if="showLabels || node.id === selectedId"
              class="graph-label"
              text-anchor="middle"
              :y="nodeRadius(node.kind, node.size) + 18"
            >
              {{ labelFor(node.label) }}
            </text>
          </g>
        </g>
      </svg>

      <aside v-if="selected" class="graph-panel" aria-live="polite">
        <h2>{{ selected.label }}</h2>
        <p class="page-note">{{ outOfTen(selected.score) }} out of 10</p>
        <RouterLink
          v-if="selected.kind === 'map'"
          class="button button-primary"
          :to="`/maps/${selected.id}`"
        >
          Open map
        </RouterLink>
        <ul v-else class="graph-panel-list">
          <li v-for="map in selectedStackMaps" :key="map.id">
            <RouterLink :to="`/maps/${map.id}`">{{ map.name }}</RouterLink>
          </li>
        </ul>
        <template v-if="connections.length">
          <h3>Linked to</h3>
          <ul class="graph-panel-list">
            <li v-for="link in connections" :key="link.id">
              <button class="link-button" type="button" @click="selectedId = link.id">
                {{ link.label }}
              </button>
              <span class="page-note">{{ link.reasons }}</span>
            </li>
          </ul>
        </template>
        <p v-else class="page-note">No links yet.</p>
      </aside>
    </div>
  </section>
</template>
