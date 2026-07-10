import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { testRender, type JSX } from "@opentui/solid";
import { describe, expect, test } from "bun:test";
import type { CodexUsage } from "../usage.js";
import { formatUsage, installUsagePlugin } from "../tui.js";

const usage: CodexUsage = {
  fiveHour: { usedPercent: 42.4 },
  weekly: { usedPercent: 5.2 },
};

function harness() {
  const registrations: Array<{ slots: Record<string, SlotRenderer> }> = [];
  const disposals: Array<() => void | Promise<void>> = [];
  const api = {
    theme: { current: { textMuted: "gray" } },
    slots: {
      register(plugin: { slots: Record<string, SlotRenderer> }) {
        registrations.push(plugin);
        return "op-usage";
      },
    },
    lifecycle: {
      signal: new AbortController().signal,
      onDispose(dispose: () => void | Promise<void>) {
        disposals.push(dispose);
        return () => undefined;
      },
    },
  } as unknown as TuiPluginApi;
  return { api, registrations, disposals };
}

type SlotRenderer = (context: unknown, props: unknown) => JSX.Element;

describe("usage TUI plugin", () => {
  test("formats both requested limits compactly", () => {
    expect(formatUsage(usage)).toBe("5h 42% · wk 5%");
  });

  test("registers usage beside both prompt surfaces", async () => {
    const h = harness();
    await installUsagePlugin(h.api, { load: async () => usage, refreshIntervalMs: 60_000 });

    expect(h.registrations).toHaveLength(1);
    expect(typeof h.registrations[0]?.slots.home_prompt_right).toBe("function");
    expect(typeof h.registrations[0]?.slots.session_prompt_right).toBe("function");
    expect(h.disposals).toHaveLength(1);
    await h.disposals[0]?.();
  });

  test("renders both live usage windows in the prompt slot", async () => {
    const h = harness();
    await installUsagePlugin(h.api, { load: async () => usage, refreshIntervalMs: 60_000 });
    await Bun.sleep(0);
    const slot = h.registrations[0]?.slots.session_prompt_right;
    expect(slot).toBeDefined();

    const app = await testRender(() => slot?.({}, { session_id: "s1" }), { width: 40, height: 2 });
    try {
      await app.renderOnce();
      expect(app.captureCharFrame()).toContain("5h 42% · wk 5%");
    } finally {
      app.renderer.destroy();
      await h.disposals[0]?.();
    }
  });

  test("absorbs refresh failures without rejecting plugin installation", async () => {
    const h = harness();
    await expect(
      installUsagePlugin(h.api, {
        load: async () => {
          throw new Error("offline");
        },
        refreshIntervalMs: 60_000,
      }),
    ).resolves.toBeUndefined();
    await Bun.sleep(0);
    await h.disposals[0]?.();
  });
});
