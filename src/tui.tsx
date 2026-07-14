import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { createSignal, Show } from "solid-js";
import { loadCodexUsage, type CodexUsage } from "./usage.js";

type InstallOptions = {
  load?: () => Promise<CodexUsage | undefined>;
  refreshIntervalMs?: number;
};

function formatReset(resetsAt: number | undefined, now: number): string {
  if (resetsAt === undefined) return "";
  const minutes = Math.max(0, Math.ceil((resetsAt - now) / 60));
  if (minutes === 0) return " (now)";
  if (minutes < 60) return ` (${minutes}m)`;
  return ` (${Math.floor(minutes / 60)}h ${minutes % 60}m)`;
}

export function formatUsage(usage: CodexUsage, now = Date.now() / 1000): string {
  const remaining = (used: number) => Math.round(Math.max(0, Math.min(100, 100 - used)));
  return [
    usage.fiveHour &&
      `5h ${remaining(usage.fiveHour.usedPercent)}% left${formatReset(usage.fiveHour.resetsAt, now)}`,
    usage.weekly && `wk ${remaining(usage.weekly.usedPercent)}% left`,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}

function windowKey(usage: CodexUsage): string {
  const minute = (value?: number) => (value === undefined ? "?" : Math.floor(value / 60));
  return `${minute(usage.fiveHour?.resetsAt)}/${minute(usage.weekly?.resetsAt)}`;
}

export function selectConsensusUsage(samples: CodexUsage[]): CodexUsage | undefined {
  const groups = new Map<string, { count: number; usage: CodexUsage }>();
  for (const usage of samples) {
    const key = windowKey(usage);
    const group = groups.get(key);
    groups.set(key, { count: (group?.count ?? 0) + 1, usage });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count)[0]?.usage;
}

export async function installUsagePlugin(api: TuiPluginApi, options: InstallOptions = {}): Promise<void> {
  const [usage, setUsage] = createSignal<CodexUsage>();
  const [now, setNow] = createSignal(Date.now() / 1000);
  const load =
    options.load ??
    (() => loadCodexUsage({ cacheBuster: crypto.randomUUID(), signal: api.lifecycle.signal }));
  let disposed = false;

  const sample = async (count: number) => {
    const results = await Promise.allSettled(Array.from({ length: count }, () => load()));
    return {
      unavailable: results.some((result) => result.status === "fulfilled" && !result.value),
      values: results.flatMap((result) =>
        result.status === "fulfilled" && result.value ? [result.value] : [],
      ),
    };
  };

  const refresh = async (initial = false) => {
    const result = await sample(initial ? 5 : 1);
    const current = usage();
    if (!initial && current && result.values[0] && windowKey(current) !== windowKey(result.values[0])) {
      result.values.push(...(await sample(4)).values);
    }

    const next = selectConsensusUsage(result.values);
    if (!disposed && next) setUsage(next);
    else if (!disposed && result.unavailable) setUsage(undefined);
  };

  const Usage = () => (
    <Show when={usage()} keyed>
      {(value: CodexUsage) => <text fg={api.theme.current.textMuted}>{formatUsage(value, now())}</text>}
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

  const timer = setInterval(() => {
    setNow(Date.now() / 1000);
    void refresh();
  }, options.refreshIntervalMs ?? 60_000);
  timer.unref?.();
  api.lifecycle.onDispose(() => {
    disposed = true;
    clearInterval(timer);
  });

  void refresh(!options.load);
}
