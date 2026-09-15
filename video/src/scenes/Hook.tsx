import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { Headline, ScenePush } from "../primitives";
import { SCENE_OVERLAP, SFX } from "../content";
import { CANVAS, Easing, EASE, F } from "../tokens";
import { useHeadlines } from "../VideoPropsContext";
import { Sfx } from "./shared/Overlays";
import { UI } from "./shared/palette";
import { useSceneStaging } from "./shared/scene";
import { fade } from "./shared/timeline";

export const HOOK_DURATION = 187;

// Real IS numbers, all from the recorded runs and the sample tender's report.
const FIELD = [
  "IS 3043:2018", "IS 694:2010", "IS 18732:2023", "IS 13252 (Part 1):2010",
  "IS 4591 (Part 2):2022", "IS 3854:2023", "IS 302 (Part 1):2008", "IS 8437 (Part 2):1993",
  "IS 14231 (Part 1):2026", "IS 732:2019",
];
const ROWS = 5;
const COLS = 4;

const HEADLINE_EXIT = 92;
const HERO_AT = 100;
const STAMP_AT = 126;

/** Deterministic 0–1 noise; Math.random() would jitter between render workers. */
const noise = (i: number) => ((Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1 + 1) % 1;

const FieldCard: React.FC<{ i: number; frame: number; dim: number }> = ({ i, frame, dim }) => {
  const row = Math.floor(i / COLS);
  const col = i % COLS;
  const depth = 0.55 + noise(i) * 0.55;
  const x = col * 500 + (row % 2) * 250 - 150 + noise(i + 7) * 40;
  const y = 40 + row * 225 + noise(i + 3) * 40 - frame * 0.4 * depth;
  // Cards thin out across the middle band, where the headline and hero card sit.
  const band = Math.min(1, Math.max(0.12, Math.abs(y + 20 - CANVAS.height / 2) / 330));
  const opacity = fade(frame, 2 + i * 1.5, 16) * (0.18 + 0.34 * depth) * dim * band;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        padding: `${12 * depth}px ${22 * depth}px`,
        borderRadius: 12 * depth,
        border: "1px solid rgba(147, 167, 196, 0.35)",
        background: "rgba(22, 41, 75, 0.55)",
        color: "#C9D6EA",
        fontFamily: F.mono,
        fontSize: 26 * depth,
        whiteSpace: "nowrap",
        opacity,
        filter: depth < 0.75 ? `blur(${(0.75 - depth) * 5}px)` : undefined,
      }}
    >
      {FIELD[i % FIELD.length]}
    </div>
  );
};

/** Cold open: a drifting field of standards, the question, then one outdated citation gets stamped. */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const headlines = useHeadlines();
  const staging = useSceneStaging("hook", { durationInFrames: HOOK_DURATION, enterFrom: "none", exitTo: "top", background: "gradient" });

  const dim = 1 - 0.65 * interpolate(frame, [HEADLINE_EXIT, HERO_AT + 12], [0, 1], EASE.smooth);
  const heroIn = fade(frame, HERO_AT, 16);
  const stampIn = interpolate(frame, [STAMP_AT, STAMP_AT + 7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  // A short, decaying shake as the stamp lands.
  const since = frame - (STAMP_AT + 7);
  const shake = since >= 0 && since < 12 ? Math.sin(since * 2.4) * 9 * (1 - since / 12) : 0;

  return (
    <ScenePush
      duration={staging.durationInFrames}
      overlap={SCENE_OVERLAP}
      enterFrom={staging.enterFrom}
      exitTo={staging.exitTo}
      background={staging.background}
    >
      {Array.from({ length: ROWS * COLS }, (_, i) => (
        <FieldCard key={i} i={i} frame={frame} dim={dim} />
      ))}

      <Headline
        lines={headlines.pain}
        fontSize={headlines.painFontSize ?? 96}
        color={headlines.color ?? "#F5F7FB"}
        lineDelay={14}
        entranceDuration={12}
        exitAt={HEADLINE_EXIT}
        exitDuration={12}
        wordStream={{ stagger: 3, duration: 7, yRise: 30 }}
        headlineKey="pain"
      />

      {heroIn > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 64,
          }}
        >
          <div
            style={{
              position: "relative",
              padding: "34px 70px 40px",
              borderRadius: 24,
              background: "#F8FAFD",
              boxShadow: "0 30px 90px rgba(0, 0, 0, 0.55)",
              opacity: heroIn,
              transform: `translateX(${shake}px) scale(${0.86 + 0.14 * heroIn})`,
            }}
          >
            <div style={{ fontFamily: F.sans, fontSize: 22, fontWeight: 700, letterSpacing: "0.2em", color: "#47566b" }}>
              CITED IN THE TENDER
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 92, fontWeight: 500, color: UI.ink, marginTop: 8 }}>
              IS 3043 : 1987
            </div>
            {stampIn > 0 && (
              <div
                style={{
                  position: "absolute",
                  right: -96,
                  top: -48,
                  padding: "6px 26px",
                  border: `7px solid ${UI.bad}`,
                  borderRadius: 12,
                  color: UI.bad,
                  background: "rgba(248, 250, 253, 0.92)",
                  fontFamily: F.sans,
                  fontSize: 58,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  opacity: stampIn,
                  transform: `rotate(-11deg) scale(${2.3 - 1.3 * stampIn})`,
                }}
              >
                SUPERSEDED
              </div>
            )}
          </div>
          <div
            style={{
              fontFamily: F.sans,
              fontSize: 36,
              fontWeight: 500,
              color: "#9FB2CC",
              opacity: fade(frame, STAMP_AT + 18, 14),
            }}
          >
            The current edition is IS 3043:2018. Would anyone have caught it?
          </div>
        </div>
      )}

      <Sfx at={STAMP_AT + 5} entry={SFX.boom} />
    </ScenePush>
  );
};
