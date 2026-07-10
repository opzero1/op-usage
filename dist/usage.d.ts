export declare const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
export type UsageWindow = {
    usedPercent: number;
    resetsAt?: number;
};
export type CodexUsage = {
    fiveHour: UsageWindow;
    weekly: UsageWindow;
};
type LoadUsageOptions = {
    authFile?: string;
    endpoint?: string;
    fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
    signal?: AbortSignal;
};
export declare function parseCodexUsage(value: unknown): CodexUsage | undefined;
export declare function codexAuthFile(env?: NodeJS.ProcessEnv): string;
export declare function loadCodexUsage(options?: LoadUsageOptions): Promise<CodexUsage | undefined>;
export {};
