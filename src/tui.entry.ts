import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
import { installUsagePlugin } from "./tui.js";

const module = {
  id: "op-usage",
  async tui(api) {
    await installUsagePlugin(api);
  },
} satisfies TuiPluginModule;

export default module;
