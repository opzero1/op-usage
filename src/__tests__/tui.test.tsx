import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { testRender, type JSX } from "@opentui/solid";
import { describe, expect, test } from "bun:test";
import type { CodexUsage } from "../usage.js";
import { formatUsage, installUsagePlugin, selectConsensusUsage } from "../tui.js";

const usage: CodexUsage = {
  fiveHour: { usedPercent: 42.4, resetsAt: 10_900 },
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
  test("formats both limits as remaining usage to match ChatGPT", () => {
    expect(formatUsage(usage, 10_000)).toBe("5h 58% left (15m) · wk 95% left");
  });

  test("formats the five-hour reset countdown compactly", () => {
    expect(formatUsage(usage, 100)).toBe("5h 58% left (3h 0m) · wk 95% left");
  });

  test("formats a weekly-only limit instead of hiding the usage display", () => {
    expect(formatUsage({ weekly: { usedPercent: 8, resetsAt: 1_784_529_832 } })).toBe("wk 92% left");
  });

  test("selects the majority reset window instead of earlier or later timestamps", () => {
    const website: CodexUsage = {
      fiveHour: { usedPercent: 37, resetsAt: 1_783_693_896 },
      weekly: { usedPercent: 17, resetsAt: 1_784_200_309 },
    };
    const alternate: CodexUsage = {
      fiveHour: { usedPercent: 1, resetsAt: 1_783_695_278 },
      weekly: { usedPercent: 0, resetsAt: 1_784_214_046 },
    };

    expect(selectConsensusUsage([website, alternate, website, website, alternate])).toEqual(website);
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
      expect(app.captureCharFrame()).toContain("5h 58% left");
      expect(app.captureCharFrame()).toContain("wk 95% left");
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
