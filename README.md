# op-usage

An unobtrusive Codex usage monitor for OpenCode.

`op-usage` reads the current Codex login from `$CODEX_HOME/auth.json` (or `~/.codex/auth.json`), fetches the same ChatGPT usage endpoint used by Codex, and shows the available limits beside OpenCode's text input:

```text
wk 92% left
```

The values are the percentage remaining in the rate-limit windows returned by ChatGPT. Plans that expose only the weekly window show only that limit. If ChatGPT also returns a 5-hour window, the plugin shows it with the time until reset. Values refresh once per minute. Missing auth hides the indicator; network, auth, and malformed-response errors keep the last good reading and never show a toast or interrupt the prompt.

The ChatGPT endpoint can occasionally return a different reset-window pair for identical requests. The plugin uses the majority response at startup and resamples only when the reported reset windows suddenly change.

## Install

Clone the repository, then add its committed TUI bundle to the plugin list in `~/.config/opencode/tui.json`:

```sh
git clone https://github.com/opzero1/op-usage.git
```

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["file:///absolute/path/to/op-usage/dist/tui.js"]
}
```

Restart OpenCode after changing the config. TUI plugins are loaded only at startup.

This repository commits `dist/`, so the published checkout can load without a local build. The file URL uses OpenCode's supported path-plugin loader and avoids relying on unsupported Git package specifiers.

## Codex Compatibility

The integration follows the local OpenAI Codex source:

- ChatGPT base URL: `https://chatgpt.com/backend-api/`
- Usage path: `/wham/usage`
- Auth: `tokens.access_token` from `$CODEX_HOME/auth.json`
- Account: `tokens.account_id`, falling back to the ChatGPT account claim in `tokens.id_token`
- Windows: `rate_limit.primary_window` and `rate_limit.secondary_window`

The plugin only reads usage. It does not refresh tokens, consume reset credits, or modify Codex state.

## Development

The global config can load `dev/tui.tsx` directly while developing:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["file:///absolute/path/to/op-usage/dev/tui.tsx"]
}
```

Run the checks with:

```sh
bun install
bun test
bun run typecheck
bun run build
```

`bun run dev` opens a scratch OpenCode project wired to the source entry. Use `bun run dev --print` to create and inspect the sandbox without launching OpenCode. The repository intentionally has no root `tui.json`, so a globally installed copy is not loaded twice when OpenCode runs inside this checkout.
