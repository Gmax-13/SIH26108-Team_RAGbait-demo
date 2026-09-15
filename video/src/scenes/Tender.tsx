import React from "react";
import { useCurrentFrame } from "remotion";
import { Cursor } from "../engine";
import type { CursorAction } from "../engine";
import { ScenePush } from "../primitives";
import { CURSOR_SFX, SCENE_OVERLAP, SFX, TRANSITION_SFX } from "../content";
import { useCursorStyle } from "../VideoPropsContext";
import { AppView, AppWindow, makeGetRect, scrollTo, useAppWindow } from "./shared/AppView";
import { FocusCam } from "./shared/FocusCam";
import type { FocusKey } from "./shared/FocusCam";
import { Caption, Ring, Sfx } from "./shared/Overlays";
import { UI } from "./shared/palette";
import { useSceneStaging } from "./shared/scene";
import { fade, track } from "./shared/timeline";

export const TENDER_DURATION = 350;
const WINDOW_ID = "tender-app";

/** Batch mode: the sample tender becomes a compliance report that catches an outdated citation. */
const LOADED_AT = 44;
const REPORT_AT = 88;
const TILE_COUNT = 5;

const CURSOR: CursorAction[] = [
  { at: 0, action: "idle", position: { x: 1500, y: 900 } },
  { at: 16, action: "moveTo", target: "upload-tab:load-sample", duration: 18 },
  { at: 40, action: "click", target: "upload-tab:load-sample" },
  { at: 56, action: "moveTo", target: "tender-loaded:generate", duration: 16 },
  { at: 80, action: "click", target: "tender-loaded:generate" },
];

const FOCUS: FocusKey[] = [
  { at: 0, scale: 1 },
  { at: 12, target: "upload-tab:dropzone", scale: 1.15 },
  { at: 42, target: "upload-tab:dropzone", scale: 1.15 },
  { at: 58, target: "tender-loaded:generate", scale: 1.3 },
  { at: 82, target: "tender-loaded:generate", scale: 1.3 },
  { at: 96, scale: 1 },
  { at: 114, target: "tender-report:tiles", scale: 1.35 },
  { at: 160, target: "tender-report:tiles", scale: 1.35 },
  { at: 178, scale: 1 },
  { at: 206, target: "tender-report:outdated-row-0", scale: 1.4 },
];

export const Tender: React.FC = () => {
  const frame = useCurrentFrame();
  const staging = useSceneStaging("tender", { durationInFrames: TENDER_DURATION, enterFrom: "right", exitTo: "left", background: "gradient" });
  const cursorStyle = useCursorStyle();
  const { def, pose, box, k } = useAppWindow(WINDOW_ID, frame);

  const reportY = track(frame, [[162, 0], [192, scrollTo("tender-report", "outdated-panel", 160)]]);
  const scrollOf = (state: string) => (state === "tender-report" ? reportY : 0);
  const getRect = makeGetRect({ windowId: WINDOW_ID, win: box, k, scrollOf });

  const layers = [
    { state: "upload-tab" },
    { state: "tender-loaded", opacity: fade(frame, LOADED_AT, 5) },
    { state: "tender-report", opacity: fade(frame, REPORT_AT, 10), scrollY: reportY },
  ];
  const sidebars = [{ nav: "query" }, { nav: "reports", opacity: fade(frame, REPORT_AT, 10) }];

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
          <AppView k={k} layers={layers} sidebars={sidebars} />
        </AppWindow>
        <Ring box={getRect("tender-report:outdated-row-0")} from={214} color={UI.bad} />
        <Cursor
          actions={CURSOR}
          getRect={getRect}
          sfx={CURSOR_SFX}
          size={Math.round(52 * cursorStyle.scale)}
          baseRotation={cursorStyle.rotation}
        />
      </FocusCam>
      {Array.from({ length: TILE_COUNT }, (_, i) => (
        <Sfx key={i} at={REPORT_AT + 16 + i * 5} entry={SFX.pop} volume={0.22} />
      ))}
      <Sfx at={212} entry={SFX.notification} />
      <Caption text="A whole tender in. A compliance report out." from={112} to={174} accent={UI.accent} />
      <Caption text="Caught: IS 3043 cited as 1987 — the current edition is 2018." from={218} accent={UI.bad} />
    </ScenePush>
  );
};
