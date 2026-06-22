# Task: Multi-platform production hardening for XpressProfx

## Context

This repo was previously broken by having multiple conflicting build configs at root at the same time (nixpacks.toml, railpack.toml, render.yaml, fly.toml, Procfile, Procfile.backup) — different platforms’ tooling picked different ones, causing Railway to silently fall back to a static-file server with no Node runtime (`node: command not found` in every log). The repo also had ~480 duplicate loose .ts/.tsx files at root that already existed properly nested inside artifacts/*/src and lib/*/src.

I am actively deploying this same codebase to FOUR different targets in parallel: Railway, Render, a VPS, and Vercel, plus running it locally for development. Each platform must work from its OWN config file without interfering with the others. Do not let one platform’s config silently override or break another’s.

## Step 0 — Audit before touching anything

Before writing or changing any file:

1. List every build/deploy config file currently in the repo root (railpack.toml, railway.json, render.yaml, vercel.json, Procfile, nixpacks.toml, fly.toml, Dockerfile, etc.) and tell me what each one currently does.
1. List every package.json in the repo (root + each artifacts/* + each lib/*) and confirm none contain non-ASCII smart-quote characters or other invalid JSON.
1. Confirm there is exactly ONE copy of each source file — search for duplicate filenames that exist both loose at repo root AND nested inside artifacts/*/src or lib/*/src. If found, the root loose copy is stray; tell me before deleting anything.
1. Report file count before and after any cleanup so I can verify nothing was silently lost.

## Step 1 — Clean the repo structure

- Delete any loose .ts/.tsx files sitting directly at repo root that are duplicates of files already properly nested in artifacts/*/src or lib/*/src.
- Delete any stale duplicate folders (e.g. a folder with a numeric suffix that duplicates lib/ or artifacts/).
- Delete one-off stray files at root that don’t belong there (scratch text dumps, stray docx/pdf/jpeg not referenced by any package’s public/ folder).
- Do NOT delete root-level package.json, pnpm-workspace.yaml, pnpm-lock.yaml, tsconfig.base.json, tsconfig.json, .env.example, .gitignore — these are required workspace config, not duplicates.
- After cleanup, re-run the file count check from Step 0 and confirm the diff only removed the files you listed as duplicates.

## Step 2 — Per-platform command files

Build SEPARATE, platform-specific configs. Each platform reads its own file and must not be affected by the others’ presence:

### Railway (railway.json + railpack.toml)

- Build: pnpm install –frozen-lockfile, then pnpm –filter @workspace/api-server build (and any frontend builds it serves)
- Start: node artifacts/api-server/dist/index.mjs
- Healthcheck path: /healthz (liveness only — must NOT depend on DB, or a DB blip triggers a restart loop)
- Set restart policy to ON_FAILURE with a bounded max retry count (not infinite)

### Render (render.yaml)

- Build command: pnpm install –frozen-lockfile && pnpm –filter @workspace/api-server build
- Start command: node artifacts/api-server/dist/index.mjs
- Health check path: /healthz
- Document any Render-specific env vars needed (PORT is injected by Render automatically — confirm the app reads process.env.PORT, not a hardcoded port)

### VPS (a documented systemd service file or PM2 config, plus a deploy.sh script)

- Install: pnpm install –frozen-lockfile –prod (or full if build runs on the VPS itself)
- Build: pnpm –filter @workspace/api-server build
- Start: node artifacts/api-server/dist/index.mjs, run under a process manager (PM2 or systemd) that auto-restarts on crash with a backoff, NOT an infinite restart loop
- Predeploy: confirm DATABASE_URL and other required env vars are present in the VPS’s environment before starting (fail fast and loud with a clear error message if missing, do not start in a broken half-state)

### Vercel (vercel.json)

- IMPORTANT: Vercel is serverless — there is no long-running process, so the current app.listen() server entrypoint will NOT work as-is. Tell me explicitly whether the api-server needs a serverless adapter/wrapper for Vercel, or whether only the frontend packages (NeXTrade, admin-portal) should deploy to Vercel while the API server stays on Railway/Render/VPS. Do not silently force a serverless shape onto code that assumes a persistent process (background sweepers, in-memory state) without flagging the architectural mismatch to me first.

### Local terminal

- Install: pnpm install
- Build: pnpm –filter @workspace/api-server build
- Dev: pnpm dev (or whatever the existing dev script is — confirm it exists and works)
- Document the minimum required .env values for local dev to boot without crashing

## Step 3 — Pre-deploy validation (the realistic version of “won’t crash”)

Add a pre-deploy script that runs BEFORE any deploy command, on every platform, and fails loudly with a clear error message if any of these are wrong — do not let a broken config silently reach the build/start stage:

- All required env vars are present (list them explicitly, fail with the missing var’s name if absent)
- Every package.json in the repo is valid JSON (no smart quotes, no trailing commas)
- Only one build-config file per platform exists at root (flag it if you find leftover conflicting configs like nixpacks.toml or Procfile.backup still present)
- The DB connection string is reachable at startup IF the platform’s healthcheck depends on it — otherwise confirm the liveness healthcheck does NOT depend on DB so a DB blip doesn’t kill a healthy process

## Step 4 — Runtime resilience (be honest about what this can and cannot do)

This is the realistic version of “auto-fix” and “won’t break” — implement these, and do not claim more than this:

- Graceful shutdown on SIGTERM/SIGINT: stop accepting new requests, let in-flight requests finish (10s timeout), then exit cleanly
- uncaughtException / unhandledRejection handlers that log full context and keep the process alive for transient errors, rather than crashing the whole server over one bad request
- Retry-with-exponential-backoff for transient failures only (DB reconnects, flaky outbound HTTP) — NOT for on-chain send transactions or anything where a retry could cause a duplicate side effect
- DB pool error handling that allows a fresh reconnect attempt after a connection drop, instead of permanently disabling persistence for the rest of the process lifetime
- Explicitly do NOT attempt to detect or auto-correct logic bugs in application code. A real bug should fail clearly and loudly every time it’s hit — log it with full context so it can be fixed, not suppressed or silently “repaired.” If you are tempted to add any mechanism that rewrites, patches, or silently bypasses application logic at runtime, stop and ask me first instead of implementing it.

## Step 5 — Cross-check every change against existing code

Before committing anything:

- Confirm new code doesn’t duplicate logic that already exists elsewhere in the same file or a sibling file
- Run a typecheck (pnpm typecheck or tsc –noEmit) and report the actual output, not just “it should work”
- Confirm the build script (pnpm –filter @workspace/api-server build) still produces artifacts/api-server/dist/index.mjs successfully
- List every file you changed or added, and for each one, state in one sentence what it does and why it was necessary

## Step 6 — Production-readiness gaps (fill in what’s missing, but tell me what you added and why)

For a fintech/forex brokerage platform handling real user funds, check for and add if missing:

- Structured logging with request IDs for tracing issues across the request lifecycle
- Rate limiting on auth and withdrawal-related endpoints
- Input validation (zod schemas) on every endpoint that mutates state, especially anything touching balances or withdrawals
- CORS configured explicitly (not wildcard) for production
- Secrets loaded only from environment variables, never hardcoded — confirm none exist in the codebase
- A documented rollback procedure (how do I revert to the previous working deploy on each platform if a new push breaks something)

## Final output required

1. A summary list of every file created or modified
1. The exact install/build/deploy/predeploy commands for each of the 5 targets (Railway, Render, VPS, Vercel, local), in one clearly labeled table or section per platform
1. Confirmation that you ran a typecheck and/or build locally in Replit and it passed, with the actual command output — not just a claim that it works
1. An explicit list of anything you were unsure about or chose not to implement, and why