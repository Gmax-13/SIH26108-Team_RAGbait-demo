// ManakSetu: the dashboard sidebar's navy as the stage, its blue as brand,
// and the abstention purple as the accent.
export const C = {
  bg: "#0A1630",
  bgLight: "#11234A",
  surface: "#172D57",
  surfaceLight: "#1F3868",
  border: "#2A4474",

  text: "#F5F7FB",
  textMuted: "#93A7C4",
  textDim: "#61779A",

  brand: "#2A78D6",
  brandLight: "#5B9BE6",
  brandDim: "#1C5CAB",

  accent: "#6D4BC4",
  accentDim: "#55389F",

  success: "#0CA30C",
  warning: "#E0A63A",
  error: "#E25555",

  windowChrome: "#0E1C38",
  windowBorder: "#2A4474",
  trafficRed: "#FF5F57",
  trafficYellow: "#FEBC2E",
  trafficGreen: "#28C840",
} as const;

export const F = {
  sans: "'Inter', system-ui, sans-serif",
  serif: "'Fraunces', Georgia, serif",
  mono: "'JetBrains Mono', monospace",
} as const;

export const CANVAS = { width: 1920, height: 1080 } as const;
export const FPS = 30;

export { Easing } from "remotion";
import { Easing } from "remotion";

const CLAMP = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export const EASE = {
  cinematic: { ...CLAMP, easing: Easing.bezier(0.22, 0.61, 0.36, 1) },
  snappy: { ...CLAMP, easing: Easing.out(Easing.exp) },
  smooth: { ...CLAMP, easing: Easing.out(Easing.cubic) },
  elastic: { ...CLAMP, easing: Easing.elastic(1) },
  bounce: { ...CLAMP, easing: Easing.bounce },
  spring: { ...CLAMP, easing: Easing.bezier(0.34, 1.56, 0.64, 1) },
} as const;

export type EasingPresetKey = keyof typeof EASE;
