import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const sandbox = join(repo, ".sandbox");
const args = new Set(Bun.argv.slice(2));

if (args.has("--reset")) await rm(sandbox, { recursive: true, force: true });
await mkdir(sandbox, { recursive: true });
await Bun.write(
  join(sandbox, "tui.json"),
  `${JSON.stringify({ $schema: "https://opencode.ai/tui.json", plugin: [join(repo, "dev", "tui.tsx")] }, null, 2)}\n`,
);

console.log(`[dev] Sandbox project: ${sandbox}`);
if (args.has("--print")) process.exit(0);

const child = Bun.spawn(["opencode"], { cwd: sandbox, stdio: ["inherit", "inherit", "inherit"] });
process.exit(await child.exited);
