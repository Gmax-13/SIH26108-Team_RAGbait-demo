/**
 * Regenerates the literal defaults Studio edits in place — `defaultProps` in
 * src/Root.tsx and DEFAULT_PROPS in src/defaultProps.ts — from schema.ts.
 *
 *   npx tsx scripts/sync-default-props.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { CinematicSchema } from "../src/schema";

const props = CinematicSchema.parse({});

// Studio's saveDefaultProps needs an inline object literal; enum-valued strings
// need `as const` to satisfy the schema's literal union types.
const ENUM_KEYS = ["enterFrom", "exitTo", "background", "easing", "action", "anchor", "curve", "layout", "type", "variant", "messageVariant"];
const literal = JSON.stringify(props).replace(
  new RegExp(`"(${ENUM_KEYS.join("|")})":("[^"]*")`, "g"),
  '"$1":$2 as const',
);

const rootPath = "src/Root.tsx";
const root = readFileSync(rootPath, "utf8");
const pattern = /defaultProps=\{\{[\s\S]*?\}\}\n(\s*)calculateMetadata/;
if (!pattern.test(root)) throw new Error("defaultProps literal not found in Root.tsx");
writeFileSync(rootPath, root.replace(pattern, (_m, indent: string) => `defaultProps={${literal}}\n${indent}calculateMetadata`));

writeFileSync(
  "src/defaultProps.ts",
  `import type { CinematicProps } from "./schema";\n\nexport const DEFAULT_PROPS: CinematicProps = ${JSON.stringify(props, null, 2)};\n`,
);

console.log(`synced ${props.scenes.length} scenes, ${props.windowLayout.length} windows`);
