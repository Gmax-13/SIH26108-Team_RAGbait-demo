import React from "react";
import { Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import type { SFXEntry } from "../../engine";
import { EASE, F } from "../../tokens";
import { useVideoProps } from "../../VideoPropsContext";
import type { Box } from "./AppView";

function inOut(frame: number, from: number, to: number | undefined, inDur: number, outDur: number) {
  const inP = interpolate(frame, [from, from + inDur], [0, 1], EASE.smooth);
  const outP = to === undefined ? 1 : interpolate(frame, [to - outDur, to], [1, 0], EASE.smooth);
  return { inP, opacity: Math.min(inP, outP) };
}

/** Lower-third caption pill. Sits outside the camera so it never scales. */
export const Caption: React.FC<{ text: string; from: number; to?: number; accent: string }> = ({
  text,
  from,
  to,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { inP, opacity } = inOut(frame, from, to, 12, 10);
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 58,
        display: "flex",
        justifyContent: "center",
        opacity,
        transform: `translateY(${(1 - inP) * 18}px)`,
        zIndex: 100,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "18px 34px",
          borderRadius: 999,
          background: "rgba(8, 13, 26, 0.86)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 18px 50px rgba(0, 0, 0, 0.45)",
          color: "#F3F6FB",
          fontFamily: F.sans,
          fontSize: 36,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ width: 14, height: 14, borderRadius: 7, background: accent, boxShadow: `0 0 16px ${accent}` }} />
        {text}
      </div>
    </div>
  );
};

/** An outline that settles onto a UI element. Lives inside the camera so it tracks the zoom. */
export const Ring: React.FC<{ box?: Box; from: number; to?: number; color: string; pad?: number; maxWidth?: number }> = ({
  box,
  from,
  to,
  color,
  pad = 8,
  maxWidth,
}) => {
  const frame = useCurrentFrame();
  const { inP, opacity } = inOut(frame, from, to, 10, 8);
  if (!box || opacity <= 0) return null;
  // Block-level elements report the full row width; maxWidth hugs the content at its left edge.
  const width = maxWidth === undefined ? box.width : Math.min(box.width, maxWidth);
  return (
    <div
      style={{
        position: "absolute",
        left: box.left - pad,
        top: box.top - pad,
        width: width + pad * 2,
        height: box.height + pad * 2,
        border: `3px solid ${color}`,
        borderRadius: 12,
        boxShadow: `0 0 0 6px ${color}2e, 0 0 36px ${color}55`,
        opacity,
        transform: `scale(${1 + (1 - inP) * 0.06})`,
        transformOrigin: "center",
        pointerEvents: "none",
        zIndex: 50,
      }}
    />
  );
};

/** A one-shot sound effect at a scene-relative frame; honours the global SFX toggle. */
export const Sfx: React.FC<{ at: number; entry: SFXEntry; duration?: number; volume?: number }> = ({
  at,
  entry,
  duration,
  volume,
}) => {
  const { sfxEnabled } = useVideoProps();
  if (!sfxEnabled) return null;
  return (
    <Sequence from={at} durationInFrames={Math.max(1, duration ?? entry.durationInFrames ?? 30)} layout="none">
      <Audio src={staticFile(entry.src)} volume={volume ?? entry.volume ?? 0.5} />
    </Sequence>
  );
};
