// Renders review stills at the given frames with one bundle: node scripts/stills.mjs 60 160 ...
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const frames = process.argv.slice(2).map(Number);
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const composition = await selectComposition({ serveUrl, id: "CinematicDemo" });
console.log(`composition: ${composition.durationInFrames} frames @ ${composition.fps}fps, ${composition.width}x${composition.height}`);
for (const frame of frames) {
  const output = path.resolve(`out/frames/f${String(frame).padStart(4, "0")}.jpg`);
  await renderStill({ serveUrl, composition, frame, output, imageFormat: "jpeg", jpegQuality: 85 });
  console.log(`rendered ${output}`);
}
