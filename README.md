# op-usage

An unobtrusive Codex usage monitor for OpenCode.

`op-usage` reads the current Codex login from `$CODEX_HOME/auth.json` (or `~/.codex/auth.json`), fetches the same ChatGPT usage endpoint used by Codex, and shows both limits beside OpenCode's text input:

```text
5h 100% left · wk 100% left
```

The values are the percentage remaining in Codex's rolling 5-hour primary window and weekly secondary window, matching ChatGPT's usage page. They refresh once per minute. Missing auth hides the indicator; network, auth, and malformed-response errors keep the last good reading and never show a toast or interrupt the prompt.

The ChatGPT usage endpoint can briefly return stale snapshots from an older reset window. The plugin samples it on startup and ignores later responses with older reset timestamps, preventing the displayed limit from jumping between ledgers.

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
