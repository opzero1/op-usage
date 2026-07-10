import { describe, expect, test } from "bun:test";

async function loadDefault(path: string) {
  const mod = (await import(path)) as { default?: Record<string, unknown> };
  expect(mod.default).toBeDefined();
  return mod.default as Record<string, unknown>;
}

describe("plugin entry shapes", () => {
  test("published entry is TUI-only", async () => {
    const entry = await loadDefault("../tui.entry.js");
    expect(entry.id).toBe("op-usage");
    expect(typeof entry.tui).toBe("function");
    expect("server" in entry).toBe(false);
  });

  test("development entry is TUI-only", async () => {
    const entry = await loadDefault("../../dev/tui.js");
    expect(entry.id).toBe("op-usage-dev");
    expect(typeof entry.tui).toBe("function");
    expect("server" in entry).toBe(false);
  });

  test("package exports the TUI target", async () => {
    const pkg = (await import("../../package.json")) as { default: { exports: Record<string, Record<string, string>> } };
    expect(pkg.default.exports["./tui"]?.import).toBe("./dist/tui.js");
  });
});
