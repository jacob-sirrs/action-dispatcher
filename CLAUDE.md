# CLAUDE.md — Project Instructions for Claude Code

## Project Overview

Action Dispatch turns a call/meeting transcript into a reviewable, editable
queue of proposed actions across the operator's connected Zapier apps.
Nothing executes without explicit operator approval.

**Stack:** TanStack Start · TanStack Router · React 19 · Vite · TypeScript
(strict) · Tailwind CSS · Zod · Bun (package manager/lockfile) ·
`@zapier/zapier-sdk`. **Vitest is planned for automated tests but is not
installed yet** — there is currently no test runner and no test files in
this repo.

**Package manager:** Bun. Use `bun install`, `bun run dev`, `bun run
build`, `bun run lint`, `bun run format`. Do not introduce `npm`/`yarn`
commands or lockfiles into project tooling or docs.

## What this project is not

- **Not Next.js.** No App Router, no `app/` directory, no
  `next.config.js`, no `error.tsx`/`global-error.tsx` boundaries. Routes
  live under `src/routes/` via TanStack Router (file-based routing;
  `src/routeTree.gen.ts` is generated — never hand-edit it).
- **No database.** No Prisma, no PostgreSQL, no Redis. No persistence
  layer exists or is planned for the current phase.
- **No NextAuth, no passwords, no new authentication system.** The only
  credential model is the existing Zapier SDK authentication: CLI login
  locally (`npx zapier-sdk login`), or `ZAPIER_CREDENTIALS` for CI/prod.
  Never propose a login form, session store, or password hashing.
- **No Sentry, no Winston/Pino, no invented logging infrastructure.**
  Error visibility currently goes through Lovable's own utilities
  (`src/lib/error-capture.ts`, `src/lib/error-page.ts`,
  `src/lib/lovable-error-reporting.ts`). Don't introduce a new logging
  library without being asked.

## Git workflow (see also AGENTS.md)

- **Never rewrite already-pushed git history** — no force-push, no
  rebase/amend/squash of pushed commits. This project is connected to
  Lovable; rewriting history desyncs Lovable's copy and can lose project
  history (see `AGENTS.md`).
- Never commit directly to `main`. Work on a feature branch
  (`feature/…`, `fix/…`, `chore/…`, `docs/…`) and keep changes small and
  reviewable — one increment at a time.
- Use conventional commits: `type(scope): short description`.
- **Stop before staging, committing, or pushing anything — obtain
  explicit user approval first, every time**, regardless of how small the
  change is.

## Before proposing code is "done"

- Map each new behavior to an approved acceptance criterion in
  `FDO-action-dispatch/ACTION_DISPATCH_ACCEPTANCE_CRITERIA.md` — don't
  build behavior that isn't traceable to one.
- Run `bun run lint` and `bun run build`; once Vitest is installed, also
  run the test command. All must pass.
- Never describe planned or in-progress work as "implemented." Use the
  status vocabulary in `docs/IMPLEMENTATION_LOG.md` (Planned / In
  Progress / Implemented / Tested / Stakeholder Approved) accurately.
- After each completed and verified implementation increment, propose
  the `docs/IMPLEMENTATION_LOG.md` update and **show it for review before
  committing it.**

## Error handling

- Catch errors where they can be handled meaningfully.
- Never show a raw exception, stack trace, or parser internals to the
  operator — always a short, user-safe message.
- Distinguish expected/operational failures (e.g. unsupported file type)
  from unexpected ones where practical, but always fail visibly, never
  silently.

## Logging and privacy

- Never log transcript content, credentials, tokens, or other personal
  information — not to the console, not anywhere persistent.
- If logging is ever added, log only what's needed to debug (event name,
  error type, non-sensitive identifiers) — never raw user-submitted text.

## Capability F — Transcript file upload (current work)

Scope, confirmed in `FDO-action-dispatch/ACTION_DISPATCH_ACCEPTANCE_CRITERIA.md`
(PH1-F) and `ACTION_DISPATCH_PHASE_PLAN.md`:

- Accept `.txt` and `.vtt` files only.
- **Maximum file size is 5 MB.** Reject oversized files by checking
  `file.size` **before** any read is attempted (before `file.text()` or
  any other content-reading call).
- Read files entirely in the browser — no server endpoint, no network
  call, no upload.
- Do not persist the file or its extracted text beyond the current
  session — no cloud storage, no database, no history.
- Loading a file into the editor never triggers analysis automatically —
  the operator still explicitly clicks "Analyze," exactly as with pasted
  text.
- `.vtt` parsing strips only structural content — the `WEBVTT` header,
  cue-number identifiers, and timestamp lines. **Preserve inline speaker
  labels exactly as part of the cue text** (e.g. `JACOB:`) — never
  detect or remove them.
- A malformed `.vtt` file (missing header, broken cue syntax) is
  **rejected outright — no partial/best-effort extraction.**
- If the editor already has non-empty content, warn and require
  confirmation before replacing it with the uploaded file's content.
- On any failed or cancelled upload (wrong extension, oversized, empty,
  malformed, undecodable, or the operator cancels the overwrite prompt),
  the existing editor content must remain exactly as it was.
- Manual paste keeps working, unchanged.

Do not add: a transcript library/browse screen, audio/video
upload/transcription, automatic (non-user-initiated) import, any
database, or a connection to Zoom/Teams/Meet/Gong (that's Capability E,
a separate future phase).
