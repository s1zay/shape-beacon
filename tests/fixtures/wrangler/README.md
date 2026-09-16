# Wrangler contract fixtures

These fixtures are synthetic and contain no production observations. Their field names and
record shapes are derived from the installed, pinned Wrangler 4.132.0 package implementation:

- `wrangler-session`, `deploy`, and `command-failed` records come from Wrangler's structured
  output writers (`WRANGLER_OUTPUT_FILE_PATH`).
- deployment objects mirror the JSON printed by `deployments list --json` and
  `deployments status --json` from Cloudflare's deployments API response.

They prove strict local parser behavior only. One authenticated, read-only capture against the
expected account remains required before a production mutation path may rely on the account and
deployment JSON contracts.
