# Redacted production Wrangler fixtures

Captured read-only on 2026-09-15 America/Chicago (2026-09-16 UTC) with the locally pinned
Wrangler 4.132.0 and the existing default OAuth authentication session.

Commands used:

```text
npx --no-install wrangler whoami --json
CLOUDFLARE_ACCOUNT_ID=c8923ddc9f252b8b35696c5278e3855b npx --no-install wrangler deployments list --json --name shape-beacon --config wrangler.jsonc
CLOUDFLARE_ACCOUNT_ID=c8923ddc9f252b8b35696c5278e3855b npx --no-install wrangler deployments status --json --name shape-beacon --config wrangler.jsonc
CLOUDFLARE_ACCOUNT_ID=c8923ddc9f252b8b35696c5278e3855b npx --no-install wrangler versions list --json --name shape-beacon --config wrangler.jsonc
```

These files derive from real production responses. They contain no tokens, credential material,
authorization headers, or token permission details. The authenticated email, account display
name (which embeds that email), deployment author email, and version author ID/email were
redacted. The whoami token-permission array was omitted because neither its values nor its shape
is used by the identity parser. Older entries from the ten-item deployment/version responses
were omitted; the retained entries are the exact active production deployment and version.

Identifiers required for baseline and correlation proof—Cloudflare account, deployment, and
version IDs—are retained. No mutation occurred during capture.
