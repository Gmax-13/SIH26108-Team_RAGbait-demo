import React from "react";
import { useCurrentFrame } from "remotion";
import { Cursor } from "../engine";
import type { CursorAction } from "../engine";
import { ScenePush } from "../primitives";
import { CURSOR_SFX, SCENE_OVERLAP, TRANSITION_SFX } from "../content";
import { useCursorStyle } from "../VideoPropsContext";
import { AppView, AppWindow, CAPTURE, makeGetRect, scrollTo, useAppWindow } from "./shared/AppView";
import { FocusCam } from "./shared/FocusCam";
import type { FocusKey } from "./shared/FocusCam";
import { Caption, Ring } from "./shared/Overlays";
import { UI } from "./shared/palette";
import { useSceneStaging } from "./shared/scene";
import { fade, track } from "./shared/timeline";

export const MATCH_DURATION = 434;
const WINDOW_ID = "match-app";

/** A recorded pipeline run: click an example, watch the stages stream, land on the answer and its evidence. */
const STAGE_SLOTS = [50, 84, 118, 152];
// Only as many pipeline stills as the capture managed to take while the query ran.
const STAGES_AT = STAGE_SLOTS.slice(0, Math.max(1, Number(CAPTURE.states["match-result"]?.stageStills ?? 1)));
const RESULT_AT = 176;
const EVIDENCE_AT = 318;

const CURSOR: CursorAction[] = [
  { at: 0, action: "idle", position: { x: 1480, y: 900 } },
  { at: 18, action: "moveTo", target: "query-empty:pill-earthing", anchor: { xPct: 35, yPct: 50 }, duration: 20 },
  { at: 44, action: "click", target: "query-empty:pill-earthing", anchor: { xPct: 35, yPct: 50 } },
  { at: 292, action: "moveTo", target: "match-result:show-evidence", duration: 16 },
  { at: 314, action: "click", target: "match-result:show-evidence" },
];

const FOCUS: FocusKey[] = [
  { at: 0, scale: 1 },
  { at: 14, target: "query-empty:pill-earthing", scale: 1.3 },
  { at: 46, target: "query-empty:pill-earthing", scale: 1.3 },
  { at: 70, scale: 1 },
  { at: 180, scale: 1 },
  { at: 206, target: "match-result:answer", scale: 1.6 },
  { at: 264, target: "match-result:answer", scale: 1.6 },
  { at: 286, scale: 1 },
  { at: 330, scale: 1 },
  { at: 358, target: "match-evidence:cite-0", scale: 1.5 },
];

export const Match: React.FC = () => {
  const frame = useCurrentFrame();
  const staging = useSceneStaging("match", { durationInFrames: MATCH_DURATION, enterFrom: "bottom", exitTo: "left", background: "gradient" });
  const cursorStyle = useCursorStyle();
  const { def, pose, box, k } = useAppWindow(WINDOW_ID, frame);

  const mapY = scrollTo("match-result", "map", 110);
  const queryY = track(frame, [[STAGES_AT[0], 0], [STAGES_AT[0] + 36, mapY]]);
  const resultY = track(frame, [
    [RESULT_AT + 8, mapY],
    [RESULT_AT + 32, scrollTo("match-result", "statusbar", 90)],
    [268, scrollTo("match-result", "statusbar", 90)],
    [290, scrollTo("match-result", "clause", 300)],
  ]);
  const evidenceY = track(frame, [
    [EVIDENCE_AT + 10, scrollTo("match-evidence", "evidence-toggle", 140)],
    [EVIDENCE_AT + 36, scrollTo("match-evidence", "citation-trail", 110)],
  ]);
  const scrollOf = (state: string) =>
    state === "match-evidence" ? evidenceY : state === "match-result" ? resultY : queryY;

  const getRect = makeGetRect({ windowId: WINDOW_ID, win: box, k, scrollOf });

  const layers = [
    { state: "query-empty", scrollY: 0 },
    ...STAGES_AT.map((at, i) => ({ state: `match-stage-${i + 1}`, opacity: fade(frame, at, 6), scrollY: queryY })),
    { state: "match-result", opacity: fade(frame, RESULT_AT, 8), scrollY: resultY },
    { state: "match-evidence", opacity: fade(frame, EVIDENCE_AT, 8), scrollY: evidenceY },
  ];

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
          <AppView k={k} layers={layers} sidebars={[{ nav: "query" }]} />
        </AppWindow>
        <Ring box={getRect("match-result:answer-no")} from={214} to={270} color={UI.accent} maxWidth={300 * k} />
        <Ring box={getRect("match-evidence:excerpt-0")} from={366} color={UI.good} />
        <Cursor
          actions={CURSOR}
          getRect={getRect}
          sfx={CURSOR_SFX}
          size={Math.round(52 * cursorStyle.scale)}
          baseRotation={cursorStyle.rotation}
        />
      </FocusCam>
      <Caption text="Finds the governing standard — and checks it is current." from={212} to={282} accent={UI.accent} />
      <Caption text="Every claim cites the sentence it came from." from={362} accent={UI.good} />
    </ScenePush>
  );
};
