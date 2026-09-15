import type { SceneConfig } from "../../schema";
import { useVideoProps } from "../../VideoPropsContext";

type Staging = Pick<SceneConfig, "durationInFrames" | "enterFrom" | "exitTo" | "background">;

/** A scene's Studio-editable staging (duration, push directions, wallpaper), falling back to its defaults. */
export function useSceneStaging(id: string, fallback: Staging): Staging {
  const cfg = useVideoProps().scenes.find((s) => s.id === id);
  return cfg
    ? { durationInFrames: cfg.durationInFrames, enterFrom: cfg.enterFrom, exitTo: cfg.exitTo, background: cfg.background }
    : fallback;
}
