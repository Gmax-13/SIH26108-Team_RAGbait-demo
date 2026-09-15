import React from "react";
import { Img, staticFile } from "remotion";
import { resolveWindowPose } from "../../engine";
import type { WindowPose } from "../../engine";
import { CHROME_HEIGHT, Window } from "../../primitives";
import type { WindowLayout } from "../../schema";
import { useWindowLayout } from "../../VideoPropsContext";
import layoutJson from "../../captured/layout.json";
import { UI } from "./palette";

type Rect4 = [x: number, y: number, w: number, h: number];

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface StateInfo {
  w: number;
  h: number;
  topbarH: number;
  rects: Record<string, Rect4>;
  [extra: string]: unknown;
}

interface SidebarInfo {
  w: number;
  h: number;
  nav: Rect4[];
  foot?: Rect4;
}

interface CaptureLayout {
  viewport: { width: number; height: number };
  states: Record<string, StateInfo>;
  sidebars: Record<string, SidebarInfo>;
  corpus: Record<string, number>;
}

/** What scripts/capture.py recorded from the live dashboard. Rects are CSS px relative to `.main`. */
export const CAPTURE = layoutJson as unknown as CaptureLayout;

const VIEW = CAPTURE.viewport;

/** An app window shows the 1600×1000 dashboard viewport at 0.95 scale, plus window chrome. */
export const APP_WINDOW_DEFAULTS = {
  startX: 200,
  startY: 45,
  startW: 1520,
  startH: 950 + CHROME_HEIGHT,
} as const;

export function useAppWindow(id: string, frame: number) {
  const defs = useWindowLayout();
  const def: WindowLayout = defs.find((w) => w.id === id) ?? {
    id,
    title: "ManakSetu",
    ...APP_WINDOW_DEFAULTS,
    enterAt: 0,
    enterDuration: 1,
    enterFrom: "fade",
    animateDuration: 18,
    exitDuration: 12,
    zIndex: 1,
  };
  const pose = resolveWindowPose(def, frame);
  const box: Box = { left: pose.left, top: pose.top, width: pose.width, height: pose.height };
  return { def, pose, box, k: pose.width / VIEW.width };
}

const sidebarWidth = (nav: string) => CAPTURE.sidebars[nav]?.w ?? CAPTURE.sidebars.query?.w ?? 0;

export function maxScroll(state: string): number {
  const s = CAPTURE.states[state];
  return s ? Math.max(0, s.h - VIEW.height) : 0;
}

/** The scroll that puts a captured element `offset` CSS px below the top of the viewport. */
export function scrollTo(state: string, key: string, offset = 120): number {
  const r = CAPTURE.states[state]?.rects[key];
  if (!r) return 0;
  return Math.min(maxScroll(state), Math.max(0, r[1] - offset));
}

/** Canvas rect of an element captured in `state`, inside a window at `win` scrolled to `scrollY`. */
export function appBox(win: Box, k: number, state: string, key: string, scrollY: number, nav = "query"): Box | undefined {
  const r = CAPTURE.states[state]?.rects[key];
  if (!r) return undefined;
  return {
    left: win.left + (sidebarWidth(nav) + r[0]) * k,
    top: win.top + CHROME_HEIGHT + (r[1] - scrollY) * k,
    width: r[2] * k,
    height: r[3] * k,
  };
}

/** Canvas rect of `foot` or `nav-<i>` in the fixed sidebar. */
export function sidebarBox(win: Box, k: number, nav: string, key: string): Box | undefined {
  const s = CAPTURE.sidebars[nav];
  const r = key === "foot" ? s?.foot : s?.nav[Number(key.replace("nav-", ""))];
  if (!r) return undefined;
  return {
    left: win.left + r[0] * k,
    top: win.top + CHROME_HEIGHT + r[1] * k,
    width: r[2] * k,
    height: r[3] * k,
  };
}

/**
 * getRect for Cursor, FocusCam and Ring. Ids are the window id, `sidebar:<key>`,
 * or `<state>:<key>` for an element captured in that state.
 */
export function makeGetRect(opts: {
  windowId: string;
  win: Box;
  k: number;
  nav?: string;
  scrollOf: (state: string) => number;
}) {
  const nav = opts.nav ?? "query";
  return (id: string): Box | undefined => {
    if (id === opts.windowId) return opts.win;
    const sep = id.indexOf(":");
    if (sep < 0) return undefined;
    const state = id.slice(0, sep);
    const key = id.slice(sep + 1);
    if (state === "sidebar") return sidebarBox(opts.win, opts.k, nav, key);
    return appBox(opts.win, opts.k, state, key, opts.scrollOf(state), nav);
  };
}

export interface ShotLayer {
  state: string;
  opacity?: number;
  scrollY?: number;
}

export interface SidebarLayer {
  nav: string;
  opacity?: number;
}

const topmostOpaque = (layers: { opacity?: number }[]) => {
  for (let i = layers.length - 1; i >= 0; i--) if ((layers[i].opacity ?? 1) >= 1) return i;
  return 0;
};

/**
 * The dashboard, rebuilt from captures: the sidebar stays fixed, the `.main`
 * column scrolls beneath a pinned copy of its sticky top bar, and later layers
 * cross-fade over earlier ones.
 */
export const AppView: React.FC<{ k: number; layers: ShotLayer[]; sidebars: SidebarLayer[] }> = ({
  k,
  layers,
  sidebars,
}) => {
  const fallback = Object.values(CAPTURE.states)[0];
  const sbW = sidebarWidth(sidebars[0]?.nav ?? "query");
  const firstLayer = topmostOpaque(layers);
  const firstSidebar = topmostOpaque(sidebars);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: UI.page }}>
      {layers.slice(firstLayer).map((l) => {
        const opacity = l.opacity ?? 1;
        if (opacity <= 0) return null;
        const info = CAPTURE.states[l.state] ?? fallback;
        const y = l.scrollY ?? 0;
        const w = info.w * k;
        const src = staticFile(`screenshots/${l.state}.png`);
        return (
          <div
            key={l.state}
            style={{ position: "absolute", left: sbW * k, top: 0, bottom: 0, width: w, overflow: "hidden", opacity }}
          >
            <Img src={src} style={{ position: "absolute", left: 0, top: -y * k, width: w }} />
            {y > 0 && (
              <div style={{ position: "absolute", left: 0, top: 0, width: w, height: info.topbarH * k, overflow: "hidden" }}>
                <Img src={src} style={{ position: "absolute", left: 0, top: 0, width: w }} />
              </div>
            )}
          </div>
        );
      })}
      {sidebars.slice(firstSidebar).map((s) => {
        const opacity = s.opacity ?? 1;
        if (opacity <= 0) return null;
        return (
          <Img
            key={s.nav}
            src={staticFile(`screenshots/sidebar-${s.nav}.png`)}
            style={{ position: "absolute", left: 0, top: 0, width: (CAPTURE.sidebars[s.nav]?.w ?? sbW) * k, opacity }}
          />
        );
      })}
    </div>
  );
};

/** A macOS-style window placed at its resolved pose, as the template's scenes do. */
export const AppWindow: React.FC<{ def: WindowLayout; pose: WindowPose; children: React.ReactNode }> = ({
  def,
  pose,
  children,
}) => {
  if (!pose.visible) return null;
  return (
    <div
      data-cursor-target={def.id}
      style={{
        position: "absolute",
        left: pose.left,
        top: pose.top,
        width: pose.width,
        height: pose.height,
        opacity: pose.opacity,
        transform: `scale(${pose.scale}) translate(${pose.translateX}px, ${pose.translateY}px) translateZ(0)`,
        transformOrigin: "top left",
        zIndex: def.zIndex,
        willChange: "transform",
      }}
    >
      <Window id={def.id} title={def.title}>
        {children}
      </Window>
    </div>
  );
};
