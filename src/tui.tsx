import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { createSignal, Show } from "solid-js";
import { loadCodexUsage, type CodexUsage } from "./usage.js";

type InstallOptions = {
  load?: () => Promise<CodexUsage | undefined>;
  refreshIntervalMs?: number;
};

export function formatUsage(usage: CodexUsage): string {
  const remaining = (used: number) => Math.round(Math.max(0, Math.min(100, 100 - used)));
  return `5h ${remaining(usage.fiveHour.usedPercent)}% left · wk ${remaining(usage.weekly.usedPercent)}% left`;
}

function newestWindow(current: CodexUsage["fiveHour"], next: CodexUsage["fiveHour"]) {
  if (current.resetsAt !== undefined && next.resetsAt !== undefined && next.resetsAt < current.resetsAt) return current;
  return next;
}

export function mergeUsage(current: CodexUsage, next: CodexUsage): CodexUsage {
  return {
    fiveHour: newestWindow(current.fiveHour, next.fiveHour),
    weekly: newestWindow(current.weekly, next.weekly),
  };
}

export async function installUsagePlugin(api: TuiPluginApi, options: InstallOptions = {}): Promise<void> {
  const [usage, setUsage] = createSignal<CodexUsage>();
  const load = options.load ?? (() => loadCodexUsage({ cacheBuster: crypto.randomUUID() }));
  let disposed = false;

  const refresh = async (sampleLimit = 1) => {
    let next: CodexUsage | undefined;
    let unavailable = false;
    const results = await Promise.allSettled(Array.from({ length: sampleLimit }, () => load()));

    for (const result of results) {
      if (result.status === "rejected") continue;
      if (!result.value) {
        unavailable = true;
        continue;
      }
      next = next ? mergeUsage(next, result.value) : result.value;
    }

    if (disposed) return;
    if (next) setUsage((current) => (current ? mergeUsage(current, next) : next));
    else if (unavailable) setUsage(undefined);
  };

  const Usage = () => (
    <Show when={usage()} keyed>
      {(value: CodexUsage) => <text fg={api.theme.current.textMuted}>{formatUsage(value)}</text>}
    </Show>
  );

  api.slots.register({
    order: 100,
    slots: {
      home_prompt_right() {
        return <Usage />;
      },
      session_prompt_right() {
        return <Usage />;
      },
    },
  });

  const timer = setInterval(() => void refresh(), options.refreshIntervalMs ?? 60_000);
  timer.unref?.();
  api.lifecycle.onDispose(() => {
    disposed = true;
    clearInterval(timer);
  });

  // The upstream endpoint can alternate between an older and newer reset
  // window. Sample at startup, then retain the one with later resets.
  void refresh(options.load ? 1 : 10);
}
