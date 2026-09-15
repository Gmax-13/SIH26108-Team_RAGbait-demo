import React from "react";
import { useCurrentFrame } from "remotion";
import { Cursor } from "../engine";
import type { CursorAction } from "../engine";
import { ScenePush, TypeWriter } from "../primitives";
import { CURSOR_SFX, SCENE_OVERLAP, SFX, TRANSITION_SFX } from "../content";
import { F } from "../tokens";
import { useCursorStyle } from "../VideoPropsContext";
import { AppView, AppWindow, makeGetRect, scrollTo, useAppWindow } from "./shared/AppView";
import { FocusCam } from "./shared/FocusCam";
import type { FocusKey } from "./shared/FocusCam";
import { Caption, Ring, Sfx } from "./shared/Overlays";
import { UI } from "./shared/palette";
import { useSceneStaging } from "./shared/scene";
import { fade, track } from "./shared/timeline";

export const REFUSAL_DURATION = 350;
const WINDOW_ID = "refusal-app";

/** The hero beat: a vague tender phrase goes in, and the engine declines to name a standard. */
export const VAGUE_QUERY = "good quality durable product";
const TYPE_AT = 44;
const TYPE_SPEED = 2;
const TYPED_AT = TYPE_AT + VAGUE_QUERY.length * TYPE_SPEED + 4;
export const REFUSAL_RESULT_AT = 142;
/** Scene-relative span the music ducks under, so the refusal lands in near-silence. */
export const REFUSAL_HUSH = { from: REFUSAL_RESULT_AT, to: 320 } as const;

const CURSOR: CursorAction[] = [
  { at: 0, action: "idle", position: { x: 1450, y: 880 } },
  { at: 14, action: "moveTo", target: "query-empty:textarea", anchor: { xPct: 12, yPct: 30 }, duration: 18 },
  { at: 36, action: "click", target: "query-empty:textarea", anchor: { xPct: 12, yPct: 30 } },
  { at: 112, action: "moveTo", target: "refusal-typed:find", duration: 16 },
  { at: 134, action: "click", target: "refusal-typed:find" },
];

const FOCUS: FocusKey[] = [
  { at: 0, scale: 1 },
  // Wide enough to keep the whole textarea, so the typed text never starts off-frame.
  { at: 26, target: "query-empty:textarea", scale: 1.35 },
  { at: 106, target: "query-empty:textarea", scale: 1.35 },
  { at: 124, target: "refusal-typed:find", scale: 1.35 },
  { at: 140, target: "refusal-typed:find", scale: 1.35 },
  { at: 160, scale: 1 },
  { at: 186, target: "refusal-result:statusbar", scale: 1.45 },
];

export const Refusal: React.FC = () => {
  const frame = useCurrentFrame();
  const staging = useSceneStaging("refusal", { durationInFrames: REFUSAL_DURATION, enterFrom: "right", exitTo: "left", background: "gradient" });
  const cursorStyle = useCursorStyle();
  const { def, pose, box, k } = useAppWindow(WINDOW_ID, frame);

  const resultY = track(frame, [
    [REFUSAL_RESULT_AT + 8, 0],
    [REFUSAL_RESULT_AT + 34, scrollTo("refusal-result", "statusbar", 170)],
  ]);
  const scrollOf = (state: string) => (state === "refusal-result" ? resultY : 0);
  const getRect = makeGetRect({ windowId: WINDOW_ID, win: box, k, scrollOf });

  const layers = [
    { state: "query-empty" },
    { state: "refusal-typed", opacity: fade(frame, TYPED_AT, 4) },
    { state: "refusal-result", opacity: fade(frame, REFUSAL_RESULT_AT, 8), scrollY: resultY },
  ];

  // Typed over the empty capture, then handed to the real typed capture.
  const textarea = getRect("query-empty:textarea");
  const typing = textarea && frame >= TYPE_AT - 2 && frame < TYPED_AT + 4;

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
        {typing && (
          <div
            style={{
              position: "absolute",
              left: textarea.left + 3 * k,
              top: textarea.top + 3 * k,
              width: textarea.width - 6 * k,
              height: textarea.height - 6 * k,
              padding: `${9 * k}px ${11 * k}px`,
              background: "#ffffff",
              borderRadius: 8 * k,
              lineHeight: 1.5,
              zIndex: 20,
            }}
          >
            <TypeWriter text={VAGUE_QUERY} delay={TYPE_AT} speed={TYPE_SPEED} fontSize={15 * k} color={UI.ink} fontFamily={F.sans} />
          </div>
        )}
        <Ring box={getRect("refusal-result:statusbar")} from={188} color={UI.abstain} />
        <Cursor
          actions={CURSOR}
          getRect={getRect}
          sfx={CURSOR_SFX}
          size={Math.round(52 * cursorStyle.scale)}
          baseRotation={cursorStyle.rotation}
        />
      </FocusCam>
      <Sfx at={TYPE_AT} entry={SFX.typing} duration={VAGUE_QUERY.length * TYPE_SPEED} />
      <Sfx at={180} entry={SFX.impact} />
      <Caption text="Not sure? It refuses — and shows you why." from={198} accent={UI.abstain} />
    </ScenePush>
  );
};
