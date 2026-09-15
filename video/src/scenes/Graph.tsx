import React from "react";
import { useCurrentFrame } from "remotion";
import { ScenePush } from "../primitives";
import { SCENE_OVERLAP, TRANSITION_SFX } from "../content";
import { AppView, AppWindow, CAPTURE, makeGetRect, useAppWindow } from "./shared/AppView";
import { FocusCam } from "./shared/FocusCam";
import type { FocusKey } from "./shared/FocusCam";
import { Caption } from "./shared/Overlays";
import { UI } from "./shared/palette";
import { useSceneStaging } from "./shared/scene";
import { fmtCount } from "./shared/timeline";

export const GRAPH_DURATION = 182;
const WINDOW_ID = "graph-app";

/** One slow push into the dependency web. */
const FOCUS: FocusKey[] = [
  { at: 0, scale: 1 },
  { at: 160, target: "graph:graph", scale: 1.3 },
];

export const Graph: React.FC = () => {
  const frame = useCurrentFrame();
  const staging = useSceneStaging("graph", { durationInFrames: GRAPH_DURATION, enterFrom: "right", exitTo: "top", background: "gradient" });
  const { def, pose, box, k } = useAppWindow(WINDOW_ID, frame);
  const getRect = makeGetRect({ windowId: WINDOW_ID, win: box, k, nav: "graph", scrollOf: () => 0 });

  return (
    <ScenePush
      duration={staging.durationInFrames}
      overlap={SCENE_OVERLAP}
      enterFrom={staging.enterFrom}
      exitTo={staging.exitTo}
      background={staging.background}
      enterSfx={TRANSITION_SFX}
    >
      <FocusCam keys={FOCUS} getRect={getRect}>
        <AppWindow def={def} pose={pose}>
          <AppView k={k} layers={[{ state: "graph" }]} sidebars={[{ nav: "graph" }]} />
        </AppWindow>
      </FocusCam>
      <Caption
        text={`${fmtCount(CAPTURE.corpus.edges_confirmed)} dependencies, read from the standards' own text.`}
        from={22}
        accent={UI.accent}
      />
    </ScenePush>
  );
};
