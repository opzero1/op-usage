declare const module: {
    id: string;
    tui(api: import("@opencode-ai/plugin/tui").TuiPluginApi): Promise<void>;
};
export default module;
