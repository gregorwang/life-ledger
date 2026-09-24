# Web authentication

The web Worker uses one password stored as a Cloudflare Worker secret. The
password value and the session-signing value must never be committed to this
repository or added to `wrangler.jsonc`.

## Production setup

Run these commands from the repository root. Wrangler prompts for each value
without adding it to source control:

```powershell
pnpm --filter @life-ledger/web exec wrangler secret put AUTH_PASSWORD
pnpm --filter @life-ledger/web exec wrangler secret put AUTH_SESSION_SECRET
```

Enter the owner-approved fixed access password at the first prompt. Keep the
literal value only in Cloudflare Secrets, not in source control. For
`AUTH_SESSION_SECRET`, use an independently generated random value of at least
32 bytes. Rotating that secret invalidates every existing browser session.

To generate and upload the signing secret without saving it to disk:

```powershell
$sessionSigningKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$sessionSigningKey | pnpm --filter @life-ledger/web exec wrangler secret put AUTH_SESSION_SECRET
Remove-Variable sessionSigningKey
```

## Local development

Create `apps/web/.dev.vars` locally with both required bindings:

```dotenv
AUTH_PASSWORD=<chosen local password>
AUTH_SESSION_SECRET=<at least 32 bytes of random key material>
ENVIRONMENT=development
```

`.dev.vars` is ignored by Git. Do not reuse the production signing secret in a
development environment.

## Security boundary

- Every private page, static asset, and `/api/*` request runs through the
  session guard before the asset or Core service binding is reached.
- `/public/v1/anime` and `/public/v1/timeline` remain intentionally
  unauthenticated because they are the product's explicit field-whitelisted
  public projections.
- Login attempts are rate-limited per hashed client address. Cloudflare's
  Workers Rate Limiting API is intentionally eventually consistent and
  per-location, so it is a strong abuse control rather than a strict global
  counter.
- Logout clears the browser cookie. Sessions are stateless and expire after
  12 hours; rotate `AUTH_SESSION_SECRET` to revoke all sessions immediately.
- The MCP Worker is a separate ingress surface and is not covered by the web
  session cookie.
