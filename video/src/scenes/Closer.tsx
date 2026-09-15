import React from "react";
import { useCurrentFrame } from "remotion";
import { EndCard, ScenePush } from "../primitives";
import { SCENE_OVERLAP, TRANSITION_SFX } from "../content";
import { F } from "../tokens";
import { useHeadlines, useVideoProps } from "../VideoPropsContext";
import { BrandMark } from "./shared/BrandMark";
import { useSceneStaging } from "./shared/scene";
import { fade } from "./shared/timeline";

const DURATION = 120;

export const Closer: React.FC = () => {
  const frame = useCurrentFrame();
  const headlines = useHeadlines();
  const { cta, brand } = useVideoProps();
  const staging = useSceneStaging("closer", { durationInFrames: DURATION, enterFrom: "bottom", exitTo: "none", background: "light" });

  return (
    <ScenePush
      duration={staging.durationInFrames}
      overlap={SCENE_OVERLAP}
      enterFrom={staging.enterFrom}
      exitTo={staging.exitTo}
      background={staging.background}
      enterSfx={TRANSITION_SFX}
    >
      <EndCard
        tagline={brand.name}
        cta={headlines.closer[0] ?? cta}
        entranceDelay={5}
        entranceDuration={18}
        logo={<BrandMark size={112} />}
        backgroundColor={brand.colors.background}
        textColor={brand.colors.text}
        accentColor={brand.colors.primary}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 92,
          textAlign: "center",
          fontFamily: F.sans,
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: "0.14em",
          color: brand.colors.textMuted,
          opacity: fade(frame, 30, 16),
        }}
      >
        SMART INDIA HACKATHON 2026 · SIH26108 · TEAM RAGBAIT
      </div>
    </ScenePush>
  );
};
