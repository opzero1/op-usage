import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { type CodexUsage } from "./usage.js";
type InstallOptions = {
    load?: () => Promise<CodexUsage | undefined>;
    refreshIntervalMs?: number;
};
export declare function formatUsage(usage: CodexUsage): string;
export declare function installUsagePlugin(api: TuiPluginApi, options?: InstallOptions): Promise<void>;
export {};
