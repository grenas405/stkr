// Pure geometry for drawing and dragging a radar chart. Axis 0 points straight up.

import { clamp } from './radar-map';

export type Point = { readonly x: number; readonly y: number };

export const axisAngle = (index: number, axisCount: number): number =>
  -Math.PI / 2 + (index * 2 * Math.PI) / axisCount;

export const polarToPoint = (center: Point, radius: number, angle: number): Point => ({
  x: center.x + radius * Math.cos(angle),
  y: center.y + radius * Math.sin(angle),
});

// The point for a 0-1 magnitude along one axis.
export const magnitudeToPoint = (
  magnitude: number,
  index: number,
  axisCount: number,
  center: Point,
  radius: number,
): Point => polarToPoint(center, magnitude * radius, axisAngle(index, axisCount));

// Projects a pointer onto an axis, returning its 0-1 magnitude. Pointers behind the
// center clamp to 0 so a drag past the middle can't flip the value to the other side.
export const pointToMagnitude = (
  pointer: Point,
  index: number,
  axisCount: number,
  center: Point,
  radius: number,
): number => {
  const angle = axisAngle(index, axisCount);
  const projected =
    (pointer.x - center.x) * Math.cos(angle) + (pointer.y - center.y) * Math.sin(angle);
  return clamp(projected / radius, 0, 1);
};

// The axis a pointer is closest to by angle, so a press anywhere on the chart works.
export const nearestAxis = (pointer: Point, axisCount: number, center: Point): number => {
  const fromTop = Math.atan2(pointer.y - center.y, pointer.x - center.x) + Math.PI / 2;
  const turn = 2 * Math.PI;
  const normalised = ((fromTop % turn) + turn) % turn;
  return Math.round((normalised / turn) * axisCount) % axisCount;
};

export const shortLabel = (label: string, maxLength = 16): string =>
  label.length <= maxLength ? label : `${label.slice(0, maxLength - 1).trimEnd()}…`;

export const toSvgPoints =(points: readonly Point[]): string =>
  points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');

export const shapePoints = (
  magnitudes: readonly number[],
  center: Point,
  radius: number,
): readonly Point[] =>
  magnitudes.map((magnitude, index) =>
    magnitudeToPoint(magnitude, index, magnitudes.length, center, radius),
  );

// Evenly spaced ring radii, excluding the center.
export const ringRadii = (radius: number, ringCount: number): readonly number[] =>
  Array.from({ length: ringCount }, (_, index) => (radius * (index + 1)) / ringCount);

// Which side of the chart an axis label should anchor to.
export const labelAnchor = (angle: number): 'start' | 'middle' | 'end' => {
  const horizontal = Math.cos(angle);
  if (Math.abs(horizontal) < 0.2) return 'middle';
  return horizontal > 0 ? 'start' : 'end';
};
