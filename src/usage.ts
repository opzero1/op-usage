import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

export type UsageWindow = {
  usedPercent: number;
  resetsAt?: number;
};

export type CodexUsage = {
  fiveHour: UsageWindow;
  weekly: UsageWindow;
};

type CodexAuth = {
  accessToken: string;
  accountID?: string;
  fedramp: boolean;
};

type LoadUsageOptions = {
  authFile?: string;
  cacheBuster?: string;
  endpoint?: string;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function window(value: unknown): UsageWindow | undefined {
  const input = record(value);
  if (!input || typeof input.used_percent !== "number" || !Number.isFinite(input.used_percent)) return;

  return {
    usedPercent: input.used_percent,
    resetsAt: typeof input.reset_at === "number" && Number.isFinite(input.reset_at) ? input.reset_at : undefined,
  };
}

export function parseCodexUsage(value: unknown): CodexUsage | undefined {
  const rateLimit = record(record(value)?.rate_limit);
  const fiveHour = window(rateLimit?.primary_window);
  const weekly = window(rateLimit?.secondary_window);
  if (!fiveHour || !weekly) return;
  return { fiveHour, weekly };
}

export function codexAuthFile(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.CODEX_HOME || join(homedir(), ".codex");
  if (!isAbsolute(root)) throw new Error("CODEX_HOME must be an absolute path");
  return join(root, "auth.json");
}

function jwtClaims(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string") return;
  const payload = value.split(".")[1];
  if (!payload) return;
  try {
    return record(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  } catch {
    return;
  }
}

async function readCodexAuth(file: string): Promise<CodexAuth | undefined> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return;
  }

  const tokens = record(record(input)?.tokens);
  const accessToken = tokens?.access_token;
  if (typeof accessToken !== "string" || !accessToken) return;

  const claims = jwtClaims(tokens?.id_token);
  const accountClaim = claims?.["https://api.openai.com/auth.chatgpt_account_id"];
  const fedrampClaim = claims?.["https://api.openai.com/auth.chatgpt_account_is_fedramp"];
  const storedAccountID = tokens?.account_id;
  const accountID =
    typeof storedAccountID === "string" && storedAccountID
      ? storedAccountID
      : typeof accountClaim === "string" && accountClaim
        ? accountClaim
        : undefined;
  return { accessToken, accountID, fedramp: fedrampClaim === true };
}

export async function loadCodexUsage(options: LoadUsageOptions = {}): Promise<CodexUsage | undefined> {
  const auth = await readCodexAuth(options.authFile ?? codexAuthFile());
  if (!auth) return;

  const headers: Record<string, string> = { Authorization: `Bearer ${auth.accessToken}` };
  if (auth.accountID) headers["ChatGPT-Account-Id"] = auth.accountID;
  if (auth.fedramp) headers["X-OpenAI-Fedramp"] = "true";

  const endpoint = new URL(options.endpoint ?? CODEX_USAGE_URL);
  if (options.cacheBuster) endpoint.searchParams.set("_", options.cacheBuster);
  const timeout = AbortSignal.timeout(10_000);

  const response = await (options.fetch ?? globalThis.fetch)(endpoint, {
    headers,
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error(`Codex usage request failed with HTTP ${response.status}`);

  const usage = parseCodexUsage(await response.json());
  if (!usage) throw new Error("Codex usage response did not contain both rate-limit windows");
  return usage;
}
