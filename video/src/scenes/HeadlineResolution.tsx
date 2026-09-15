import React from "react";
import { Headline, ScenePush } from "../primitives";
import { SCENE_OVERLAP, TRANSITION_SFX } from "../content";
import { useHeadlines } from "../VideoPropsContext";
import { useSceneStaging } from "./shared/scene";

const DURATION = 182;

export const HeadlineResolution: React.FC = () => {
  const headlines = useHeadlines();
  const staging = useSceneStaging("headline-resolution", { durationInFrames: DURATION, enterFrom: "bottom", exitTo: "top", background: "gradient" });

  return (
    <ScenePush
      duration={staging.durationInFrames}
      overlap={SCENE_OVERLAP}
      enterFrom={staging.enterFrom}
      exitTo={staging.exitTo}
      background={staging.background}
      enterSfx={TRANSITION_SFX}
    >
      <Headline
        lines={headlines.resolution}
        fontSize={headlines.resolutionFontSize ?? 110}
        color={headlines.color ?? "#F5F7FB"}
        lineDelay={18}
        entranceDuration={12}
        yRise={80}
        wordStream={{ stagger: 3, duration: 5, yRise: 50 }}
        headlineKey="resolution"
      />
    </ScenePush>
  );
};
