import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
import { installUsagePlugin } from "../src/tui.js";

const module = {
  id: "op-usage-dev",
  async tui(api) {
    await installUsagePlugin(api);
  },
} satisfies TuiPluginModule;

export default module;
