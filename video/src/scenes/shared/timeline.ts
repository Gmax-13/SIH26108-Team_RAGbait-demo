import { interpolate } from "remotion";
import { EASE } from "../../tokens";

export type Point = readonly [frame: number, value: number];

/** A value held between keyed (frame, value) points and eased from one to the next. */
export function track(frame: number, points: readonly Point[], ease = EASE.cinematic): number {
  if (points.length === 0) return 0;
  if (frame <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [f0, v0] = points[i - 1];
    const [f1, v1] = points[i];
    if (frame <= f1) return interpolate(frame, [f0, Math.max(f0 + 1, f1)], [v0, v1], ease);
  }
  return points[points.length - 1][1];
}

/** 0 → 1 over `duration` frames starting at `at`. */
export function fade(frame: number, at: number, duration = 6): number {
  return interpolate(frame, [at, at + Math.max(1, duration)], [0, 1], EASE.smooth);
}

export const fmtCount = (n: number | undefined): string => (n ?? 0).toLocaleString("en-IN");
