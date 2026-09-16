# Action Dispatch — Implementation Log

**Status:** Living document, created 2026-09-13. Tracks planning/documentation
contributions and application-code implementation entries **separately**, so
planned work is never described as implemented.

**Companion to:** `ACTION_DISPATCH_PRD.md`, `ACTION_DISPATCH_PHASE_PLAN.md`,
`ACTION_DISPATCH_ACCEPTANCE_CRITERIA.md` (all in `FDO-action-dispatch/`).

**As of this version: Capability F, Increment 2 (transcript-upload UI and
integration) is Implemented — core upload/overwrite/cancel flow has been
manually verified live**, by you, against a real, SDK-connected session,
using the actual macOS file picker. Error-rejection paths (unsupported
extension, oversized, empty, malformed `.vtt`), inline VTT speaker-label
preservation, the rapid-reselection race behavior, and the DevTools
network/console checks remain manually unverified — see the Increment 2
entry below for exactly what's confirmed vs. still open.
**User — 19 — App Search has reached Stakeholder Approved status; no other
capability has reached "Tested" or "Stakeholder Approved" yet.**

---

## Executive Summary

_To be written once at least one capability reaches "Implemented" status.
Nothing qualifies yet — see Implementation Summary below._

---

## Implementation Summary

| Capability | Status | Date | Branch | PR | Stakeholder Approval |
|---|---|---|---|---|---|
| F — Transcript file upload (Increment 1: validation & parsing) | In Progress | 2026-09-13 | `feature/transcript-file-upload` | — | Not yet requested |
| F — Transcript file upload (Increment 2: upload UI & integration) | Implemented — core flow manually verified, some scenarios still unverified | 2026-09-13 | `feature/transcript-file-upload` | — | Not yet requested |
| User — 19 — App Search (connected-app list search/filter) | Stakeholder Approved — automated tests pass, lint clean, build succeeds, manually verified live; no PR opened yet | 2026-09-14 | `feature/app-search` | — | Approved by Jacob — 2026-09-14 |

_No row in this table may say "Implemented," "Tested," or "Stakeholder
Approved" until the corresponding Detailed Implementation Entry below
supports that status with evidence (tests, files changed, commit hashes)._

---

## Detailed Implementation Entries

_Template for future entries — copy this structure exactly:_

### [Capability ID] — [Capability name]

- **Date:**
- **Status:** Planned / In Progress / Implemented / Tested / Stakeholder Approved
- **User problem:**
- **Why the change was selected:**
- **What existed before:**
- **What was actually changed:**
- **What the user can now do:**
- **Acceptance criteria verified:**
- **Automated tests and results:**
- **Manual tests and results:**
- **Exact files changed:**
- **Branch name:**
- **Commit hashes:**
- **Pull-request URL:**
- **Known limitations:**
- **Deliberately excluded scope:**
- **Stakeholder approval status:**

---

### F — Transcript file upload (Increment 1: validation & parsing)

- **Date:** 2026-09-13
- **Status:** In Progress — **not implemented.** This increment is a pure
  parsing/validation module with no UI. The operator cannot yet upload a
  file through the app; nothing user-facing has shipped.
- **User problem:** The operator has to manually copy/paste transcript
  text into the editor even when they already have a `.txt` or `.vtt`
  file in hand.
- **Why the change was selected:** First slice of Capability F (PH1-F,
  approved as Phase 1). Building and testing the parsing/validation rules
  in isolation, before touching the editor UI, keeps each change small
  and independently verifiable per `CLAUDE.md`'s "small, reviewable
  changes" requirement.
- **What existed before:** Nothing — no file-reading or `.vtt`-parsing
  code existed anywhere in the repo. The transcript editor only accepted
  pasted text or the "Load sample transcript" button.
- **What was actually changed:** Added a new, pure client-side module
  (`src/lib/transcript-file.ts`) that validates a `File` and extracts
  transcript text from it. Added the project's first test suite and a
  minimal Vitest setup. **The module is not imported or wired into
  `src/routes/index.tsx` or any UI — it is inert, unused code until the
  next increment.**
- **What the user can now do:** **Nothing new yet.** No upload control
  exists in the app. This increment only adds tested, not-yet-connected
  logic.
- **Acceptance criteria verified (PH1-F, parsing/validation subset only):**
  - Valid `.txt` file content loads exactly, unchanged.
  - Valid `.vtt` file loads with cue text extracted and
    headers/timestamps/cue-identifiers stripped.
  - Inline VTT speaker labels are preserved exactly.
  - An unsupported extension is rejected before any read.
  - A file over 5 MB is rejected before any read (`file.text()` is never
    called).
  - An empty or no-text-found file is rejected with a clear error.
  - A malformed `.vtt` file is rejected outright, with no partial
    extraction.
  - **Not yet verified (require the UI, out of scope for this
    increment):** the overwrite-confirmation prompt, manual paste
    remaining unaffected, rapid double-file-selection race handling, and
    the "analysis is not triggered automatically" behavior.
- **Automated tests and results:** 13/13 passing (`bun run test`,
  Vitest). Covers: exact `.txt` preservation, whitespace-only `.txt`
  rejected as empty, valid `.vtt` cue extraction, header/timestamp/cue-ID
  stripping, speaker-label preservation, missing-header rejection, broken
  cue-timing rejection with no partial result, valid-header-zero-cues
  treated as empty (not malformed), unsupported extension rejected before
  reading, oversized file rejected before reading, zero-byte file
  rejected, binary/undecodable content rejected safely, and a dedicated
  test asserting no `console.*` call ever fires when handling five
  different failure scenarios seeded with a marker string standing in for
  transcript content.
- **Manual tests and results:** None performed — there is no UI to
  exercise manually yet. Deferred to the increment that wires this module
  into the transcript editor.
- **Exact files changed:**
  - `src/lib/transcript-file.ts` (new)
  - `src/lib/transcript-file.test.ts` (new)
  - `vitest.config.ts` (new)
  - `package.json` (added `vitest` devDependency and a `test` script)
  - `bun.lock` (updated for the new dependency)
- **Branch name:** `feature/transcript-file-upload`
- **Commit hashes:** `9b77197ee5e210232742f5faa0f2903780f935a8` — *(corrected
  retroactively: this entry originally said "None yet" at the time it was
  drafted, before the commit landed; not updated again after committing
  until this correction.)*
- **Pull-request URL:** None yet.
- **Known limitations:**
  - VTT parsing enforces at most one identifier line before the timing
    line; a cue block with more than one non-timing line before its
    timing line is treated as malformed rather than tolerated.
  - The undecodable-content check is a heuristic (NUL byte or a high
    ratio of U+FFFD replacement characters), not a definitive encoding
    detector — an unusual but validly-encoded file could theoretically
    be misclassified; not observed in testing.
  - No file-reading UI exists yet — this module cannot be exercised by
    an operator.
- **Deliberately excluded scope:** The file-selection control, the
  overwrite-confirmation dialog, wiring into `transcript`/
  `onTranscriptChange` state, race-handling for rapid re-selection, and
  triggering (or not triggering) analysis — all deferred to the next
  increment, per the approved scope for Increment 1.
- **Stakeholder approval status:** Not yet requested — awaiting your
  review of this increment first.

---

### F — Transcript file upload (Increment 2: upload UI & integration)

- **Date:** 2026-09-13
- **Status:** Implemented. Automated tests pass, lint is clean, the build
  succeeds, and the core upload/overwrite/cancel flow has now been
  manually verified live by you against a real, SDK-connected session.
  Several specific scenarios (error-rejection paths, VTT speaker-label
  preservation, the rapid-reselection race, DevTools network/console
  checks) remain manually unverified — see "Manual tests and results."
- **User problem:** The operator has to manually copy/paste transcript
  text into the editor even when they already have a `.txt` or `.vtt`
  file in hand.
- **Why the change was selected:** Second and final slice of Capability F
  (PH1-F) — wires the Increment 1 parsing module into the transcript
  editor so the operator can actually use it.
- **What existed before:** Increment 1's tested `extractTranscriptText`
  module existed but was not imported or referenced anywhere in the app.
  The transcript editor only accepted pasted text or "Load sample
  transcript."
- **What was actually changed:** Added a small, independently testable
  `TranscriptUpload` component (`src/components/TranscriptUpload.tsx`)
  and wired it into `src/routes/index.tsx`'s `Connected` component, next
  to the existing "Load sample transcript" button. The component: shows a
  hidden native file input behind an accessible button; calls
  `extractTranscriptText`; loads text immediately into the editor via the
  existing `onTranscriptChange` when the editor is empty; shows the
  existing `AlertDialog` component as an overwrite-confirmation step when
  the editor has content; shows a static, user-safe error message on any
  rejection; guards against races with a selection-token ref so only the
  most recently selected file's outcome can ever apply; and resets the
  file input's value after every selection so the same file can be
  re-selected.
- **What the user can now do:** Select a `.txt` or `.vtt` file next to
  the transcript editor and have its text (or extracted `.vtt` cue text)
  load into the editor, with an overwrite warning if the editor already
  has content, and a clear error if the file is rejected. Nothing is sent
  anywhere, and analysis is never triggered automatically.
- **Acceptance criteria verified (PH1-F, automated):**
  - Valid file loads into an empty editor immediately.
  - Overwrite confirmation appears when the editor has content, and is
    skipped when it's empty.
  - Cancelling the confirmation preserves existing content.
  - Confirming the overwrite replaces the content.
  - Any rejection (unsupported/oversized/empty/malformed/unreadable)
    shows a clear, user-safe error and leaves existing content untouched.
  - Rapid selection of a second file resolves to only the most recent
    file's outcome.
  - The same file can be selected twice in a row and is handled both
    times.
  - A successful load never triggers analysis itself.
  - **Not yet verified (require a live browser + connected Zapier
    session — see checklist below):** real keyboard/screen-reader
    operability of the button; real `.txt`/`.vtt` files through actual
    OS file-picker dialogs; visual correctness of the error text and
    confirmation dialog; that manual paste and "Load sample transcript"
    are visually and functionally unaffected in the running app; that no
    network request fires in a real browser session (only inferred from
    the code, not observed in DevTools).
- **Automated tests and results:** 21/21 passing (`bun run test`,
  Vitest) — 13 from Increment 1 (unchanged) plus 8 new component tests
  covering: load-into-empty-editor, overwrite-confirmation-shown,
  cancel-preserves-content, confirm-replaces-content, user-safe-error-
  displayed-and-preserves-content, latest-file-wins under a simulated
  race (mocked, controlled promise resolution order), input-reset-allows-
  reselecting-the-same-file, and no-automatic-analysis. The component
  tests mock `extractTranscriptText` rather than re-testing parsing logic
  (already covered by Increment 1), keeping the two test suites
  independent. Test fixtures use placeholder strings only (e.g.
  `"irrelevant"`, `"Extracted transcript text."`) — no real or private
  transcript content.
- **Manual tests and results:** An initial attempt found a pre-existing,
  unrelated `vite dev` process already running on port 3333 (elapsed ~2
  days, predating this session) whose stale HMR module graph returned the
  app's generic error page. The launch configuration was fixed (it had
  been starting the dev server from the wrong working directory) and a
  fresh server was started successfully — the app loaded past the
  SDK-connection screen straight into a real, connected session
  (`jacob@simplifyelevation.com`, 13 apps).

  **Verified live by you, using the actual macOS native file picker (not
  simulated), against that connected session:**
  - The "↑ Upload transcript file" button opens the real macOS file
    picker.
  - A selected `.txt` file's contents load correctly into the editor and
    remain fully editable afterward.
  - The same file can be selected a second time and is handled again
    (confirms the input-reset behavior).
  - The overwrite-confirmation dialog appears when replacing existing
    editor content.
  - Clicking **Replace** correctly replaces the editor's content with the
    newly uploaded file's text.
  - Clicking **Cancel** correctly preserves the existing editor content
    unchanged.
  - Loading a file does **not** automatically trigger transcript
    analysis.
  - This verification pass was deliberately side-effect-free: you did not
    click "Analyze Transcript" or execute any Zapier action at any point.

  **Not yet manually verified** (still open):
  1. Rejection behavior for an unsupported file extension.
  2. Rejection of a file over 5 MB.
  3. Rejection of an empty (zero-byte / no-text-found) file.
  4. Rejection of a malformed `.vtt` file (missing header / broken
     timing), with no partial extraction.
  5. Inline VTT speaker-label preservation in a real `.vtt` file (e.g. a
     line like `NAME: ...` surviving extraction unchanged).
  6. The latest-file-wins race behavior under rapid re-selection of two
     different files.
  7. Explicit keyboard-only operation (Tab to the button, activate with
     Enter/Space) — this pass used a mouse click.
  8. DevTools Network tab confirmation that zero requests fire from any
     file selection.
  9. DevTools Console confirmation that no transcript content is ever
     printed, in success or failure cases.
- **Exact files changed:**
  - `src/components/TranscriptUpload.tsx` (new)
  - `src/components/TranscriptUpload.test.tsx` (new)
  - `src/routes/index.tsx` (modified — import + one control added next to
    "Load sample transcript")
  - `vitest.config.ts` (modified — `environment: "jsdom"`,
    `resolve.tsconfigPaths: true`, broadened test glob to include `.tsx`)
  - `package.json` (added `@testing-library/react` and `jsdom`
    devDependencies)
  - `bun.lock` (updated for the two new dependencies)
- **Branch name:** `feature/transcript-file-upload`
- **Commit hashes:** None yet — nothing in this increment has been
  staged or committed.
- **Pull-request URL:** None yet.
- **Known limitations:**
  - The core happy-path/overwrite/cancel flow is manually verified live;
    error-rejection paths, VTT speaker-label preservation, the
    rapid-reselection race, keyboard-only operation, and DevTools
    network/console checks are not yet manually verified (see above).
  - The overwrite-confirmation dialog's copy is a first draft ("Replace
    existing transcript? ... This can't be undone.") — not reviewed for
    tone/wording.
  - Error messages are generic per error type (e.g. one fixed sentence
    for any oversized file) — they don't include the file name or size,
    by design, to avoid any risk of echoing file content, but this also
    means two different oversized files produce identical-looking errors.
- **Deliberately excluded scope:** Persistence, network calls, server
  endpoints, databases, meeting-platform imports, audio/video support,
  and D2's execution guard — none touched. No changes to
  `src/routes/__root.tsx` or `src/styles.css` (the stashed, unrelated
  font change remains untouched and unstaged).
- **Stakeholder approval status:** Not yet requested — awaiting your
  review, including the manual checklist above, before this can move
  past "Implemented."

---

### User — 19 — App Search (connected-app list search/filter)

- **Date:** 2026-09-14
- **Status:** Stakeholder Approved. Automated tests pass, lint is clean,
  the production build succeeds, the feature has been manually verified
  live against a real, SDK-connected session, and Jacob has manually
  reviewed the feature's behavior and approved it on 2026-09-14. Not yet
  staged, committed, or opened as a pull request.
- **Backlog source:** This story is tracked in the user's Google Drive
  sheet **"User Stories – Action Dispatch"** as **User — 19 — App
  Search**: *"As a user, I want to be easily able to search for apps and
  have them sorted so I can identify/find them efficiently."* The sheet,
  not this repository's `USER_STORIES.md` (an older, incomplete snapshot
  that doesn't list this story), is the working source of truth for
  backlog approval on this item.
- **User problem:** With many connected apps (13 in the verified session),
  scanning the full alphabetical list to find the one relevant to a given
  transcript is slow. Sorting already existed (`appName.localeCompare`,
  pre-existing); nothing let the operator narrow the list.
- **Why the change was selected:** Direct implementation of the confirmed
  User — 19 — App Search scope: name search only, no category matching,
  no fuzzy search, no advanced filters, no saved search/persistence, no
  backend changes, no new dependencies — approved by the user ahead of
  implementation.
- **What existed before:** `Connected()` in `src/routes/index.tsx` grouped
  connected accounts into one alphabetically sorted row per app with no
  way to filter the list.
- **What was actually changed:** Added inline, case-insensitive substring
  search over app name only, directly in `Connected()` — no extraction
  into a separate component. Specifically:
  - `appSearchQuery` state and a `filteredAppGroups` memo that filters the
    existing sorted `appGroups` array via `.filter()`, which preserves
    alphabetical order without re-sorting.
  - A labeled text input (`<label htmlFor="app-search-input"
    className="sr-only">Search connected apps by name</label>`) rendered
    directly above the app list.
  - A "Clear search" button, shown only when the query is non-empty, that
    resets the query.
  - An explicit "No apps match "{query}"." block shown in place of the
    list when the query is non-empty and nothing matches — gated so the
    pre-existing empty-list rendering (no accounts connected at all, query
    empty) is unchanged.
  - A visually-hidden (`sr-only`) `aria-live="polite"` region announcing
    either the no-match message or an "N of M apps shown" count, so
    screen-reader users get feedback without a focus change.
  - `selectedByApp` (owned by the parent `DispatchApp` component) is never
    read from or derived off the filtered list — `selectedCount` and the
    "N app(s) selected" / Zapier-task-count text still read from the full
    `selectedByApp` prop — so a filtered-out app's selection is untouched
    by search and reappears checked when the filter is cleared.
  - `Connected` was changed from a module-private function to a named
    export solely so it could be imported directly in a new test file;
    no other change to its signature or behavior.
- **What the user can now do:** Type into the new search field above the
  app list to narrow the connected-app list to apps whose name contains
  the typed text (case-insensitive), clear the search to instantly
  restore the full alphabetical list, see an explicit message when a
  search matches nothing, and keep an app checked even while a search
  query is hiding its row.
- **Acceptance criteria verified (automated + manual):**
  - Case-insensitive partial matching on app name — automated + manual
    (typed "goo" and "SLACK"/"slack" against real app names).
  - Search input rendered directly above the connected-app list, with an
    accessible label — automated (`getByLabelText`) + manual (visual
    placement).
  - Clear control appears only with a non-empty query and restores the
    full list — automated + manual.
  - Explicit "No apps match…" state, not a blank list — automated + manual
    (typed a nonsense query against the live session).
  - Alphabetical ordering preserved among filtered results — automated
    (DOM-order assertion) + manual (Google Drive before Google Sheets
    under a "goo" filter).
  - A filtered-out app's selection is preserved and restored on clearing
    the filter — automated + manual (selected Google Drive, filtered to
    "slack" hiding it, confirmed the "1 app · ~1 Zapier task" counter
    still reflected it, cleared the filter, confirmed Google Drive still
    showed checked).
  - Client-side filtering only, no network request — manual (DevTools
    Network tab showed no new requests beyond the three initial
    `getSdkStatus`/`getConnections`/`getConnectedAccounts` server-function
    calls made on page load, across all search/clear/filter interactions).
  - Search resets on full page refresh — manual (typed "slack" against the
    live 13-app session, narrowing the list to 1 of 13; did a full page
    reload via the browser's navigation, not client-side routing; the
    search input returned to empty with no "Clear search" button and all
    13 apps were shown again). Consistent with `appSearchQuery` being
    local `useState` with no persistence layer, the same mechanism the
    existing transcript textarea and app-selection state already rely on.
  - Accessible label and screen-reader feedback — automated (`aria-live`
    region content assertions) + manual (confirmed via page-text
    extraction that the live region text updates between "1 of 13 apps
    shown." and "13 of 13 apps shown." as the filter changes).
- **Automated tests and results:** 11/11 new tests passing in the new
  `src/routes/index.test.tsx`, covering: accessible search input present,
  full list shown with an empty query, case-insensitive partial-match
  filtering, alphabetical order preserved among filtered results, explicit
  no-results state, clear control present only with a non-empty query and
  restores the list, a filtered-out selection surviving a filter/clear
  round-trip (asserted via the "N app(s) selected" text and the row's
  `aria-pressed` attribute), the `aria-live` region's announced text, and
  a no-regression check that an empty account list doesn't spuriously
  trigger the no-results state. Full suite: **32/32 passing** (21
  pre-existing + 11 new), run via `node_modules/.bin/vitest run` — `bun`
  is not on `PATH` in this execution environment, so the installed Vitest
  binary was invoked directly; this is an environment workaround only, no
  project tooling, scripts, or docs were changed to use `npm`/`yarn`.
  `node_modules/.bin/eslint .` reports 0 errors (6 pre-existing warnings
  in unrelated `src/components/ui/*.tsx` files, unchanged by this work).
  `node_modules/.bin/vite build` completes successfully (exit code 0, no
  errors in the full build log).
- **Manual tests and results:** Verified live in the browser preview
  against a real, SDK-connected session (`jacob@simplifyelevation.com`,
  13 connected apps) started via the existing `action-dispatch-dev` launch
  configuration (`bun run dev` under the hood). Confirmed: the search
  input renders directly above the app list with placeholder "Search
  apps…"; typing "goo" filters to exactly Google Drive and Google Sheets,
  in that order; typing "SLACK"/"slack" matches "Slack" regardless of
  case; selecting Google Drive, then filtering to "slack" (hiding Google
  Drive), left the "1 app · ~1 Zapier task" indicator unchanged; clearing
  the search restored all 13 apps with Google Drive still shown checked
  and its account label; typing a nonsense query ("zzznotanapp") rendered
  the visible "No apps match "zzznotanapp"." block in place of the list;
  DevTools Network tab showed no request fired by any search/clear
  interaction; typing "slack" to narrow the list to 1 of 13 apps, then
  doing a full page reload (not client-side navigation), returned the
  search input to empty with the "Clear search" button gone and all 13
  apps shown again. This pass was deliberately side-effect-free — "Analyze
  Transcript" was never clicked and no Zapier action was executed. One
  unrelated console warning (a React hydration-mismatch notice pointing
  at `src/routes/__root.tsx` `data-tsd-source` attributes) was observed
  during this session; confirmed via `git diff main -- src/routes/__root.tsx`
  that this file has zero changes on this branch, so the warning is
  pre-existing dev-mode noise unrelated to this feature, not a regression
  introduced by it.
- **Exact files changed:**
  - `src/routes/index.tsx` (modified — search state, filtered/sorted memo,
    search input + clear control + no-results block + `aria-live` region
    added inline in `Connected()`; `Connected` changed from
    module-private to a named export)
  - `src/routes/index.test.tsx` (new)
- **Branch name:** `feature/app-search`
- **Commit hashes:** None yet — nothing staged or committed.
- **Pull-request URL:** None yet.
- **Known limitations:**
  - `bun` is not installed on `PATH` in this execution environment;
    verification commands ran the already-installed `node_modules/.bin/`
    binaries directly instead of `bun run test` / `bun run lint` / `bun
    run build`. Same underlying tools and config, no changes to
    `package.json` scripts or any lockfile.
  - The `data-tsd-source` hydration-mismatch console warning noted above
    is pre-existing and unrelated (confirmed via `git diff` against
    `main`), but was not independently fixed or filed as its own issue
    here, since `src/routes/__root.tsx` is out of scope for this story.
- **Deliberately excluded scope (per approved plan):** category matching,
  fuzzy search, advanced filters, saved search or persistence, backend
  changes, new dependencies, general refactoring of `Connected()` or
  `index.tsx`, and any unrelated UI changes.
- **Stakeholder approval status:** Approved by Jacob on 2026-09-14, after
  manually reviewing the feature's behavior live in the browser (dev
  server, real SDK-connected session). Approval covers behavior only —
  the change is still not staged, committed, or opened as a PR.

---

## Planning and Documentation Contributions

_Documentation and process work completed so far. Kept separate from the
Detailed Implementation Entries above — nothing here implies application
code exists._

### 2026-09-13 — Git remote reconfiguration

- **What:** Repointed `origin` (in this repository's working copy)
  from `tomnassr/action-dispatcher.git` to `jacob-sirrs/action-dispatcher.git`,
  and added `upstream` as `https://github.com/tomnassr/action-dispatcher.git`,
  matching the fork model described in the PRD (§7).
- **Verification:** Fetched both remotes and confirmed `origin/main` and
  `upstream/main` point to the identical commit
  (`eff37c8c5db82c366d796dfeceae333b258a1942`) — no divergence between the
  fork and upstream at this time.
- **Scope:** Remote configuration only. No files staged, committed, or
  pushed. Two pre-existing uncommitted changes in the working tree
  (`src/routes/__root.tsx`, `src/styles.css` — a font swap unrelated to this
  work) were left untouched throughout.

### 2026-09-13 — Phase 1 (Capability F) file-size limit confirmed at 5 MB

- **What:** Resolved the previously open "is there a file-size limit"
  question in `ACTION_DISPATCH_PHASE_PLAN.md` (§7, item 2) and
  `ACTION_DISPATCH_ACCEPTANCE_CRITERIA.md` (PH1-F: top confirmed-decisions
  list, Scope list, Missing-data/empty-file behaviour, Technical-verification
  needs, and Open questions) from `[Open question]` to
  `[Confirmed — decided by you]`: a fixed **5 MB** ceiling, checked against
  the file's size before any read is attempted, not derived from measuring
  the existing paste-path or AI-by-Zapier prompt-size limits.
- **Process note:** Earlier in this same working session, 1 MB was briefly
  stated as the confirmed figure. That was superseded by this 5 MB decision
  before either number had been written into any planning document — no
  document ever stated 1 MB, so this is a first-time recorded decision, not
  a correction of stale doc text.
- **`ACTION_DISPATCH_PRD.md` intentionally left unchanged** — it contains no
  file-size text at all, and per its own stated scope (acceptance criteria
  and phasing detail are deliberately excluded from the PRD, see its header),
  it remains consistent with this decision by omission.
- **Scope:** Documentation only. No application code, tests, staging, or
  commits.

---

### 2026-09-16 — Admin architecture direction approved (multi-user/organization model)

- **What:** Approved the product direction for Action Dispatch's Admin
  capability to evolve from a single-user, single-credential tool to a
  multi-user organization application. Created `docs/ADMIN_ARCHITECTURE.md`
  as the canonical source of truth for this direction, and updated the
  conflicting single-user/no-persistence/no-auth wording in `CLAUDE.md`,
  `USER_STORIES.md`, and
  `.cursor/rules/core/{railguard-security,coding-standards,project-stack}.mdc`
  to mark those statements as applying to the original, non-Admin product
  and superseded for the Admin capability, each cross-referencing
  `docs/ADMIN_ARCHITECTURE.md`.
- **Key decisions recorded in `docs/ADMIN_ARCHITECTURE.md`:**
  - MVP scope is **one Organization with multiple Users** — not full
    multi-tenant/multi-org support.
  - All users in that organization continue to operate against the
    deployment's existing shared `ZAPIER_CREDENTIALS` /
    `ZAPIER_CONNECTION_IDS` — unchanged from the current architecture; no
    per-user or per-organization Zapier credential isolation in the MVP.
  - Defined an **Organization / User / Membership** identity model, with
    **Role** and **Status** as properties of a Membership (not of User
    globally), so multi-organization support can be added later without
    reworking the core model.
  - MVP roles: **Admin** and **Operator**.
  - Membership status lifecycle: **invited / active / deactivated**,
    checked fresh on every request — deactivation must take effect on the
    user's very next request, not their next login.
  - Server-side request identity resolution (User + Organization +
    Membership + Role + Status) is required at a single shared guard point
    before any privileged operation runs; never trusted from
    client-supplied data.
  - MVP role→capability mapping is a fixed, code-defined table — no
    admin-editable permission-scope UI yet.
  - Authentication and persistence are now **approved requirements** for
    the Admin capability, specified vendor-neutrally in
    `docs/ADMIN_ARCHITECTURE.md` §10 — no vendor or specific technology
    (auth provider, database, KV store, etc.) has been selected.
  - Explicitly **deferred**: multi-organization support, per-organization
    Zapier credentials, admin-editable/custom permission scopes,
    per-user/per-role rate limits, SSO, audit logging, self-service org
    creation/billing.
  - Rate-limit storage is called out as a **separate future infrastructure
    decision**, not assumed solved by whatever persistence is chosen for
    identity data.
- **Scope:** Documentation and planning only. **No application
  functionality has been implemented** — no code in `src/` was touched, no
  database or authentication mechanism exists yet, and none of the Admin
  user stories has begun implementation.
- **Files changed:** `docs/ADMIN_ARCHITECTURE.md` (new), `CLAUDE.md`,
  `USER_STORIES.md`, `.cursor/rules/core/railguard-security.mdc`,
  `.cursor/rules/core/coding-standards.mdc`,
  `.cursor/rules/core/project-stack.mdc`.
- **Branch:** `claude/action-dispatch-admin-planning-rgd36t`.
- **Commit hashes:** None yet — nothing has been staged or committed.

---

## Final Presentation Summary

_To be written once at least one capability reaches "Stakeholder Approved"
status — the demo-day-facing summary of what shipped, what was deferred,
and why._
