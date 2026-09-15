import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ScenePush } from "../primitives";
import { SCENE_OVERLAP, TRANSITION_SFX } from "../content";
import { EASE, F } from "../tokens";
import { useBrand } from "../VideoPropsContext";
import { AppView, AppWindow, CAPTURE, makeGetRect, useAppWindow } from "./shared/AppView";
import { BrandMark } from "./shared/BrandMark";
import { FocusCam } from "./shared/FocusCam";
import type { FocusKey } from "./shared/FocusCam";
import { Caption } from "./shared/Overlays";
import { UI } from "./shared/palette";
import { useSceneStaging } from "./shared/scene";
import { fade, fmtCount } from "./shared/timeline";

export const REVEAL_DURATION = 182;
const WINDOW_ID = "reveal-app";

/** Brand lockup, then the real dashboard rises into frame under a slow push. */
const FOCUS: FocusKey[] = [
  { at: 0, scale: 1 },
  { at: 90, scale: 1 },
  { at: 182, target: "reveal-app", scale: 1.07 },
];

export const Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const brand = useBrand();
  const staging = useSceneStaging("reveal", { durationInFrames: REVEAL_DURATION, enterFrom: "bottom", exitTo: "top", background: "gradient" });
  const { def, pose, box, k } = useAppWindow(WINDOW_ID, frame);
  const getRect = makeGetRect({ windowId: WINDOW_ID, win: box, k, scrollOf: () => 0 });

  const leave = interpolate(frame, [52, 70], [0, 1], EASE.cinematic);
  const lockupOpacity = Math.min(fade(frame, 8, 16), 1 - leave);

  return (
    <ScenePush
      duration={staging.durationInFrames}
      overlap={SCENE_OVERLAP}
      enterFrom={staging.enterFrom}
      exitTo={staging.exitTo}
      background={staging.background}
      enterSfx={TRANSITION_SFX}
    >
      {lockupOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 30,
            opacity: lockupOpacity,
            transform: `translateY(${(1 - fade(frame, 8, 16)) * 30 - leave * 60}px) scale(${1 - leave * 0.08})`,
          }}
        >
          <BrandMark size={132} />
          <div style={{ fontFamily: F.serif, fontSize: 132, fontWeight: 600, color: "#F5F7FB", letterSpacing: "-0.03em", lineHeight: 1 }}>
            {brand.name}
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 30, fontWeight: 600, color: "#9FB2CC", letterSpacing: "0.22em", textTransform: "uppercase" }}>
            Indian Standards Engine
          </div>
        </div>
      )}
      <FocusCam keys={FOCUS} getRect={getRect}>
        <AppWindow def={def} pose={pose}>
          <AppView k={k} layers={[{ state: "query-empty" }]} sidebars={[{ nav: "query" }]} />
        </AppWindow>
      </FocusCam>
      <Caption
        text={`${fmtCount(CAPTURE.corpus.standards)} real BIS standards · ${fmtCount(CAPTURE.corpus.chunks)} citable passages`}
        from={132}
        accent={UI.accent}
      />
    </ScenePush>
  );
};
