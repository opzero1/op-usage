import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { loadCodexUsage, parseCodexUsage } from "../usage.js";

const response = {
  rate_limit: {
    primary_window: { used_percent: 42, limit_window_seconds: 18_000, reset_at: 1_735_689_720 },
    secondary_window: { used_percent: 5, limit_window_seconds: 604_800, reset_at: 1_735_776_120 },
  },
};

describe("Codex usage", () => {
  test("maps the primary and secondary windows to five-hour and weekly usage", () => {
    expect(parseCodexUsage(response)).toEqual({
      fiveHour: { usedPercent: 42, resetsAt: 1_735_689_720 },
      weekly: { usedPercent: 5, resetsAt: 1_735_776_120 },
    });
  });

  test("rejects responses missing either limit window", () => {
    expect(parseCodexUsage({ rate_limit: { primary_window: response.rate_limit.primary_window } })).toBeUndefined();
  });

  test("uses Codex auth for the ChatGPT usage request", async () => {
    const root = await mkdtemp(join(tmpdir(), "op-usage-"));
    const authFile = join(root, "auth.json");
    await writeFile(authFile, JSON.stringify({ tokens: { access_token: "secret", account_id: "account-1" } }));
    const requests: Array<{ url: string; init?: RequestInit }> = [];

    const usage = await loadCodexUsage({
      authFile,
      endpoint: "https://example.test/wham/usage",
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });
        return Response.json(response);
      },
    });

    expect(usage?.fiveHour.usedPercent).toBe(42);
    expect(requests[0]?.url).toBe("https://example.test/wham/usage");
    expect(requests[0]?.init?.headers).toEqual({
      Authorization: "Bearer secret",
      "ChatGPT-Account-Id": "account-1",
    });
  });

  test("can independently sample the same usage path", async () => {
    const root = await mkdtemp(join(tmpdir(), "op-usage-"));
    const authFile = join(root, "auth.json");
    await writeFile(authFile, JSON.stringify({ tokens: { access_token: "secret", account_id: "account-1" } }));
    let requested = "";

    await loadCodexUsage({
      authFile,
      cacheBuster: "sample-1",
      fetch: async (url) => {
        requested = String(url);
        return Response.json(response);
      },
    });

    expect(requested).toBe("https://chatgpt.com/backend-api/wham/usage?_=sample-1");
  });

  test("falls back to the account and FedRAMP claims in the ID token", async () => {
    const root = await mkdtemp(join(tmpdir(), "op-usage-"));
    const authFile = join(root, "auth.json");
    const claims = Buffer.from(
      JSON.stringify({
        "https://api.openai.com/auth.chatgpt_account_id": "account-from-token",
        "https://api.openai.com/auth.chatgpt_account_is_fedramp": true,
      }),
    ).toString("base64url");
    await writeFile(
      authFile,
      JSON.stringify({ tokens: { access_token: "secret", id_token: `header.${claims}.signature` } }),
    );
    let headers: RequestInit["headers"];

    await loadCodexUsage({
      authFile,
      fetch: async (_url, init) => {
        headers = init?.headers;
        return Response.json(response);
      },
    });

    expect(headers).toEqual({
      Authorization: "Bearer secret",
      "ChatGPT-Account-Id": "account-from-token",
      "X-OpenAI-Fedramp": "true",
    });
  });

  test("returns unavailable without making a request when Codex auth is absent", async () => {
    let requested = false;
    const usage = await loadCodexUsage({
      authFile: join(tmpdir(), `missing-op-usage-${crypto.randomUUID()}.json`),
      fetch: async () => {
        requested = true;
        return Response.json(response);
      },
    });

    expect(usage).toBeUndefined();
    expect(requested).toBe(false);
  });

  test("cancels an in-flight request when the plugin lifecycle aborts", async () => {
    const root = await mkdtemp(join(tmpdir(), "op-usage-"));
    const authFile = join(root, "auth.json");
    await writeFile(authFile, JSON.stringify({ tokens: { access_token: "secret", account_id: "account-1" } }));
    const controller = new AbortController();

    const request = loadCodexUsage({
      authFile,
      signal: controller.signal,
      fetch: async (_url, init) =>
        await new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return reject(new Error("missing signal"));
          if (signal.aborted) return reject(signal.reason);
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    });
    controller.abort(new Error("plugin disposed"));

    await expect(request).rejects.toThrow("plugin disposed");
  });
});
