import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CANVAS, EASE } from "../../tokens";
import type { Box } from "./AppView";

export interface FocusKey {
  at: number;
  /** Rect id resolved through getRect; omit for the neutral full-frame view. */
  target?: string;
  scale: number;
}

type GetRect = (id: string) => Box | undefined;

const HOME = { x: CANVAS.width / 2, y: CANVAS.height / 2 };
// A focused element lands slightly above centre, clear of the caption strip.
const AIM = { x: CANVAS.width / 2, y: CANVAS.height / 2 - 50 };

function poseOf(key: FocusKey, getRect: GetRect) {
  const r = key.target ? getRect(key.target) : undefined;
  if (!r) return { s: key.target ? key.scale : 1, tx: HOME.x, ty: HOME.y, ax: HOME.x, ay: HOME.y };
  return { s: key.scale, tx: r.left + r.width / 2, ty: r.top + r.height / 2, ax: AIM.x, ay: AIM.y };
}

/**
 * Camera that brings a target element to the centre of frame and scales about it.
 *
 * Unlike the engine's AutoZoom (which scales in place, so an element near an edge
 * stays near the edge), this maps the target centre t to the aim point a:
 * p' = s·(p − t) + a. Targets are resolved every frame, so a scrolling page keeps
 * its focused element framed.
 */
export const FocusCam: React.FC<{ keys: FocusKey[]; getRect: GetRect; children: React.ReactNode }> = ({
  keys,
  getRect,
  children,
}) => {
  const frame = useCurrentFrame();
  if (keys.length === 0) return <AbsoluteFill>{children}</AbsoluteFill>;

  let i = 0;
  for (let j = 0; j < keys.length; j++) if (keys[j].at <= frame) i = j;
  const from = keys[i];
  const to = keys[Math.min(i + 1, keys.length - 1)];
  const prog = to.at > from.at && frame >= from.at
    ? interpolate(frame, [from.at, to.at], [0, 1], EASE.cinematic)
    : 0;

  const a = poseOf(from, getRect);
  const b = poseOf(to, getRect);
  const mix = (x: number, y: number) => x + (y - x) * prog;
  const s = mix(a.s, b.s);
  const dx = mix(a.ax, b.ax) - s * mix(a.tx, b.tx);
  const dy = mix(a.ay, b.ay) - s * mix(a.ty, b.ty);

  if (Math.abs(s - 1) < 1e-4 && Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }
  return (
    <AbsoluteFill
      style={{
        transform: `translate(${dx}px, ${dy}px) scale(${s})`,
        transformOrigin: "0 0",
        willChange: "transform",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
