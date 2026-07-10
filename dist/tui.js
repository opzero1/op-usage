// @bun
// src/tui.tsx
import { setProp as _$setProp } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { createSignal, Show } from "solid-js";

// src/usage.ts
import { readFile } from "fs/promises";
import { homedir } from "os";
import { isAbsolute, join } from "path";
var CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
function window(value) {
  const input = record(value);
  if (!input || typeof input.used_percent !== "number" || !Number.isFinite(input.used_percent))
    return;
  return {
    usedPercent: input.used_percent,
    resetsAt: typeof input.reset_at === "number" && Number.isFinite(input.reset_at) ? input.reset_at : undefined
  };
}
function parseCodexUsage(value) {
  const rateLimit = record(record(value)?.rate_limit);
  const fiveHour = window(rateLimit?.primary_window);
  const weekly = window(rateLimit?.secondary_window);
  if (!fiveHour || !weekly)
    return;
  return { fiveHour, weekly };
}
function codexAuthFile(env = process.env) {
  const root = env.CODEX_HOME || join(homedir(), ".codex");
  if (!isAbsolute(root))
    throw new Error("CODEX_HOME must be an absolute path");
  return join(root, "auth.json");
}
function jwtClaims(value) {
  if (typeof value !== "string")
    return;
  const payload = value.split(".")[1];
  if (!payload)
    return;
  try {
    return record(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  } catch {
    return;
  }
}
async function readCodexAuth(file) {
  let input;
  try {
    input = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return;
  }
  const tokens = record(record(input)?.tokens);
  const accessToken = tokens?.access_token;
  if (typeof accessToken !== "string" || !accessToken)
    return;
  const claims = jwtClaims(tokens?.id_token);
  const accountClaim = claims?.["https://api.openai.com/auth.chatgpt_account_id"];
  const fedrampClaim = claims?.["https://api.openai.com/auth.chatgpt_account_is_fedramp"];
  const storedAccountID = tokens?.account_id;
  const accountID = typeof storedAccountID === "string" && storedAccountID ? storedAccountID : typeof accountClaim === "string" && accountClaim ? accountClaim : undefined;
  return { accessToken, accountID, fedramp: fedrampClaim === true };
}
async function loadCodexUsage(options = {}) {
  const auth = await readCodexAuth(options.authFile ?? codexAuthFile());
  if (!auth)
    return;
  const headers = { Authorization: `Bearer ${auth.accessToken}` };
  if (auth.accountID)
    headers["ChatGPT-Account-Id"] = auth.accountID;
  if (auth.fedramp)
    headers["X-OpenAI-Fedramp"] = "true";
  const endpoint = new URL(options.endpoint ?? CODEX_USAGE_URL);
  if (options.cacheBuster)
    endpoint.searchParams.set("_", options.cacheBuster);
  const response = await (options.fetch ?? globalThis.fetch)(endpoint, {
    headers,
    signal: options.signal ?? AbortSignal.timeout(1e4)
  });
  if (!response.ok)
    throw new Error(`Codex usage request failed with HTTP ${response.status}`);
  const usage = parseCodexUsage(await response.json());
  if (!usage)
    throw new Error("Codex usage response did not contain both rate-limit windows");
  return usage;
}

// src/tui.tsx
function formatUsage(usage) {
  const remaining = (used) => Math.round(Math.max(0, Math.min(100, 100 - used)));
  return `5h ${remaining(usage.fiveHour.usedPercent)}% left \xB7 wk ${remaining(usage.weekly.usedPercent)}% left`;
}
function newestWindow(current, next) {
  if (current.resetsAt !== undefined && next.resetsAt !== undefined && next.resetsAt < current.resetsAt)
    return current;
  return next;
}
function mergeUsage(current, next) {
  return {
    fiveHour: newestWindow(current.fiveHour, next.fiveHour),
    weekly: newestWindow(current.weekly, next.weekly)
  };
}
async function installUsagePlugin(api, options = {}) {
  const [usage, setUsage] = createSignal();
  const load = options.load ?? (() => loadCodexUsage({
    cacheBuster: crypto.randomUUID()
  }));
  let disposed = false;
  const refresh = async (sampleLimit = 1) => {
    let next;
    let unavailable = false;
    const results = await Promise.allSettled(Array.from({
      length: sampleLimit
    }, () => load()));
    for (const result of results) {
      if (result.status === "rejected")
        continue;
      if (!result.value) {
        unavailable = true;
        continue;
      }
      next = next ? mergeUsage(next, result.value) : result.value;
    }
    if (disposed)
      return;
    if (next)
      setUsage((current) => current ? mergeUsage(current, next) : next);
    else if (unavailable)
      setUsage(undefined);
  };
  const Usage = () => _$createComponent(Show, {
    get when() {
      return usage();
    },
    keyed: true,
    children: (value) => (() => {
      var _el$ = _$createElement("text");
      _$insert(_el$, () => formatUsage(value));
      _$effect((_$p) => _$setProp(_el$, "fg", api.theme.current.textMuted, _$p));
      return _el$;
    })()
  });
  api.slots.register({
    order: 100,
    slots: {
      home_prompt_right() {
        return _$createComponent(Usage, {});
      },
      session_prompt_right() {
        return _$createComponent(Usage, {});
      }
    }
  });
  const timer = setInterval(() => void refresh(), options.refreshIntervalMs ?? 60000);
  timer.unref?.();
  api.lifecycle.onDispose(() => {
    disposed = true;
    clearInterval(timer);
  });
  refresh(options.load ? 1 : 10);
}

// src/tui.entry.ts
var module = {
  id: "op-usage",
  async tui(api) {
    await installUsagePlugin(api);
  }
};
var tui_entry_default = module;
export {
  tui_entry_default as default
};
