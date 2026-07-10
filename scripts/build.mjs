import solid from "@opentui/solid/bun-plugin";
import { mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

const result = await Bun.build({
  entrypoints: ["src/tui.entry.ts"],
  target: "bun",
  format: "esm",
  external: ["@opencode-ai/plugin/tui", "@opentui/solid", "solid-js"],
  plugins: [solid],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const output = result.outputs[0];
if (!output) throw new Error("Bun build produced no TUI output");
await Bun.write("dist/tui.js", output);
