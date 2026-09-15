import React, { useMemo } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { CameraRig, AudioManager, getSceneStartFrame } from "./engine";
import type { SceneTiming } from "./engine";
import type { AudioCue } from "./engine";
import { CAMERA_TIMELINE, SFX_TIMELINE } from "./content";
import { Wallpaper } from "./primitives";
import { VideoPropsProvider } from "./VideoPropsContext";
import { EditorOverlay } from "./editor";
import type { CinematicProps } from "./schema";
import "./fonts";
import {
  ChaosDesktop,
  ProductReveal,
  FeatureShowcase,
  Hook,
  Reveal,
  Match,
  Refusal,
  Tender,
  Graph,
  HeadlineResolution,
  Closer,
} from "./scenes";
import { REFUSAL_HUSH } from "./scenes/Refusal";
import { DynamicWindows } from "./scenes/DynamicWindows";

export const SCENE_COMPONENTS: Record<string, React.FC> = {
  "hook": Hook,
  "reveal": Reveal,
  "match": Match,
  "refusal": Refusal,
  "tender": Tender,
  "graph": Graph,
  "headline-resolution": HeadlineResolution,
  "closer": Closer,
  // The template's original demo scenes, still available to enable in Studio.
  "chaos": ChaosDesktop,
  "product-reveal": ProductReveal,
  "feature-showcase": FeatureShowcase,
};

export const CinematicDemo: React.FC<CinematicProps> = (props) => {
  const enabledScenes: SceneTiming[] = useMemo(
    () =>
      props.scenes
        .filter((s) => s.enabled)
        .map((s) => ({ id: s.id, durationInFrames: s.durationInFrames })),
    [props.scenes],
  );

  const sfxTimeline: AudioCue[] = useMemo(
    () =>
      props.sfxEnabled
        ? SFX_TIMELINE.map((cue) => ({ ...cue, volume: (cue.volume ?? 1) * props.sfxVolume }))
        : [],
    [props.sfxEnabled, props.sfxVolume],
  );

  const musicConfig = useMemo(
    () =>
      props.music.enabled
        ? {
            src: "music/background.mp3",
            volume: props.music.volume,
            fadeInFrames: props.music.fadeInFrames,
            fadeOutFrames: props.music.fadeOutFrames,
          }
        : undefined,
    [props.music],
  );

  // The music drops away under the refusal, so the moment lands in near-silence.
  const duckRanges = useMemo(() => {
    const refusalStart = getSceneStartFrame(enabledScenes, "refusal", props.overlap);
    if (refusalStart < 0) return [];
    return [{
      startFrame: refusalStart + REFUSAL_HUSH.from,
      endFrame: refusalStart + REFUSAL_HUSH.to,
      duckedVolume: 0.1,
    }];
  }, [enabledScenes, props.overlap]);

  return (
    <VideoPropsProvider value={props}>
      <EditorOverlay>
      <AbsoluteFill>
        <Wallpaper variant="dark" />
        <CameraRig
          timeline={CAMERA_TIMELINE}
          scenes={enabledScenes}
          overlap={props.overlap}
        >
          {enabledScenes.map((scene) => {
            const Component = SCENE_COMPONENTS[scene.id];
            if (!Component) return null;
            const from = getSceneStartFrame(enabledScenes, scene.id, props.overlap);
            return (
              <Sequence
                key={scene.id}
                from={from}
                durationInFrames={scene.durationInFrames}
                layout="none"
              >
                <Component />
                <DynamicWindows sceneId={scene.id} />
              </Sequence>
            );
          })}
        </CameraRig>
        {musicConfig && (
          <AudioManager
            music={musicConfig}
            sfxTimeline={sfxTimeline}
            scenes={enabledScenes}
            overlap={props.overlap}
            duckMusicDuring={duckRanges}
          />
        )}
      </AbsoluteFill>
      </EditorOverlay>
    </VideoPropsProvider>
  );
};
