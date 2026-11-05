// anime.js, behind one small function that respects the reduced-motion setting.

import { animate, type EaseStringParamNames } from 'animejs';

export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Calls onUpdate with a progress value from 0 to 1. Returns a function that stops it.
export const runProgress = (
  durationMs: number,
  onUpdate: (progress: number) => void,
  ease: EaseStringParamNames = 'outExpo',
): (() => void) => {
  if (prefersReducedMotion()) {
    onUpdate(1);
    return () => {};
  }
  const state = { progress: 0 };
  const animation = animate(state, {
    progress: 1,
    duration: durationMs,
    ease,
    onUpdate: () => onUpdate(state.progress),
    onComplete: () => onUpdate(1),
  });
  return () => {
    animation.cancel();
  };
};
