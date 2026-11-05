// Display text shared between views.

import { formatValue, magnitudeToValue, overallScore, type RadarMap, type Scale } from '../core/radar-map';

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// A 0-1 favour score, shown out of 10 so maps with different scales can be compared.
export const outOfTen = (favour: number): string => (favour * 10).toFixed(1);

export const scoreText = (map: RadarMap): string => `${outOfTen(overallScore(map))} out of 10`;

export const scaleText = (scale: Scale): string =>
  `${formatValue(scale.min)} to ${formatValue(scale.max)}${scale.unit ? ` ${scale.unit}` : ''}`;

export const valueText = (magnitude: number, scale: Scale): string =>
  formatValue(magnitudeToValue(magnitude, scale));

export const plural = (count: number, one: string, many = `${one}s`): string =>
  `${count} ${count === 1 ? one : many}`;
