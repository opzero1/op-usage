import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { createSignal, Show } from "solid-js";
import { loadCodexUsage, type CodexUsage } from "./usage.js";

type InstallOptions = {
  load?: () => Promise<CodexUsage | undefined>;
  refreshIntervalMs?: number;
};

export function formatUsage(usage: CodexUsage): string {
  return `5h ${Math.round(usage.fiveHour.usedPercent)}% · wk ${Math.round(usage.weekly.usedPercent)}%`;
}

export async function installUsagePlugin(api: TuiPluginApi, options: InstallOptions = {}): Promise<void> {
  const [usage, setUsage] = createSignal<CodexUsage>();
  const load = options.load ?? loadCodexUsage;
  let disposed = false;

  const refresh = async () => {
    try {
      const next = await load();
      if (!disposed) setUsage(next);
    } catch {
      // Usage monitoring is optional. Keep the last good reading and never
      // interrupt normal OpenCode use for an auth or network failure.
    }
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

  void refresh();
}
