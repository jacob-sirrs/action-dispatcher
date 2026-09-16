# Admin Architecture Direction

**Status:** Approved direction, documentation-only. No implementation exists
yet. This is the canonical source of truth for the multi-user/Admin
capability's architecture. It supersedes the single-user / no-auth /
no-persistence assumptions in `CLAUDE.md`, `USER_STORIES.md`, and
`.cursor/rules/core/{railguard-security,coding-standards,project-stack}.mdc`
**for the Admin capability only** — those documents remain accurate for the
original, non-Admin product surface (transcript analysis, review, execution).

**Decided:** 2026-09-16.

## 1. Product-direction decision

Action Dispatch is becoming a multi-user organization application. The prior
"single-account tool by design" / "no end-user login exists" assumptions
applied to the product as originally built and are superseded for the new
Admin capability.

## 2. MVP scope: one organization, multiple users

- The MVP supports exactly **one Organization** with **multiple Users** as
  members.
- Multi-organization support is explicitly deferred (§11), but the identity
  model below is shaped so adding it later doesn't require reworking the
  User/Membership relationship.

## 3. Shared deployment-level Zapier credentials

- All users in the (single, MVP) organization continue to operate against
  the deployment's existing shared `ZAPIER_CREDENTIALS` /
  `ZAPIER_CONNECTION_IDS` — unchanged from the current architecture.
- The Zapier SDK credential model is **orthogonal** to the new Admin identity
  system: it answers "which Zapier account do actions run against"
  (deployment-level, one per deployment, unchanged); the new identity system
  answers "which person, with what role and status, is making this request"
  (per-user, new).
- No per-user or per-organization Zapier credential isolation exists in the
  MVP — every user in the org shares the same underlying Zapier connections.

## 4. Organization / User / Membership model

| Entity | Fields (minimum) | Notes |
|---|---|---|
| **Organization** | id, name, created_at | MVP: exactly one row will exist in practice, but this is a real entity with an id, not an implicit singleton — so multi-org later is additive, not a rewrite. |
| **User** | id, email (unique), created_at | Kept separate from Organization; a user's relationship to an org lives in Membership, not on User directly. |
| **Membership** | user_id, organization_id, role, status, created_at | Role and status are properties of the *membership*, not the user globally — this is what keeps multi-org-per-user representable later without a schema change, even though the MVP only ever creates one Membership per user. |

Design rule: never collapse Role/Status onto `User` directly, even though the
MVP has only one Organization — that shortcut is exactly what would make
multi-org support (§11) unnecessarily difficult later.

## 5. Roles: Admin and Operator

- MVP defines exactly two roles, both scoped to a Membership: **Admin**,
  **Operator**.
- **Admin:** can manage Membership records (invite, deactivate/reactivate,
  change role) in addition to everything an Operator can do.
- **Operator:** can use the existing product surface (connect apps, analyze
  transcripts, review and execute actions) but cannot manage other users'
  Memberships.
- No custom/admin-editable roles in the MVP (deferred, §11).

## 6. Membership status: invited / active / deactivated

- Every Membership carries a status: `invited` (created via an invite, not
  yet accepted), `active` (accepted, can use the app), `deactivated` (access
  revoked).
- Status is independent of Role — a deactivated Admin and a deactivated
  Operator are both fully blocked, identically.
- Status must be checked fresh on every request (§7), never cached in a
  long-lived, unrevocable credential.

## 7. Server-side request identity requirement

- Every request reaching a privileged operation (anything in
  `action-dispatcher.ts` / `zapier-dispatch.ts`, and any future
  Admin-management operation) must resolve to exactly one (User,
  Organization, Membership) triple server-side, with that Membership's
  current Role and Status, before the operation runs.
- This resolution must never trust a client-supplied claim of identity,
  role, or status — it is looked up (or cryptographically verified plus
  live-status-checked) from the persisted Membership record on the server,
  on every request.
- Enforced at a single, shared guard point, not duplicated ad hoc per route
  or server function — so a function added later can't silently skip it.

## 8. Immediate deactivation requirement

- Setting a Membership's status to `deactivated` must block that user's
  access starting with their **very next request** — not their next login,
  not after a token-expiry window.
- This rules out relying solely on a long-lived, self-contained token (e.g.
  a JWT with no server-side check and a multi-day expiry) as the *only*
  mechanism. Whatever authentication approach is chosen (§10) must be paired
  with a live Membership-status check on every request, regardless of how
  the credential itself is verified.

## 9. Hardcoded MVP role→capability mapping

The MVP does **not** build an admin-editable permission-scope system.
Role→capability mapping is a fixed, code-defined table, checked at the same
shared server-side guard point as identity resolution (§7).

Illustrative shape (not final):

| Capability | Admin | Operator |
|---|---|---|
| Connect/analyze/review/execute actions | ✅ | ✅ |
| Invite a user | ✅ | ❌ |
| Deactivate/reactivate a user | ✅ | ❌ |
| Change a user's role | ✅ | ❌ |

A live, admin-editable permission-scope UI is deferred (§11).

## 10. Authentication and persistence requirements (vendor-neutral)

**Direction for future implementation work:** prefer a **managed**
authentication/session solution over hand-rolled session/credential
security. No vendor has been selected — this is a constraint on the options
to evaluate at implementation-planning time, not a technology choice.

**Authentication — minimum requirements:**
- A per-request credential (cookie or token) the server can verify without
  trusting client-supplied claims.
- Verification cheap enough to run in the request path on the app's existing
  edge/worker runtime.
- Revocable, or paired with a live status check, so §8's immediate
  deactivation holds regardless of the credential's own expiry.
- Supports a single-use, expiring, out-of-band-delivered invite-acceptance
  flow (email link) to create the first credential for a new user.
- Coexists with, does not replace, the existing Zapier SDK credential (§3).
- Never logs credentials/tokens (per `CLAUDE.md`, "Logging and privacy").

**Persistence — minimum requirements:**
- Durable storage for Organization, User, Membership (role + status), and
  Invite (token, expiry, target email, inviter, consumed flag) records.
- Fast, indexed lookup by session/credential reference — runs on every
  request.
- Consistency strong enough that a Membership status change is visible on
  the very next request (§8) — not eventually-consistent with meaningful
  lag.
- Reachable from the app's existing Cloudflare Workers runtime.
- Does not need complex relational queries, high write throughput, or
  analytics — this is a small, low-write identity dataset.
- Never holds transcript content or proposed/executed action content —
  unrelated to, and unaffected by, this persistence.

No technology (Prisma, Postgres, Redis, a specific managed-auth provider, a
specific KV/Durable Object/D1-class store, etc.) is selected by this
document.

## 11. Deferred scope

- **Multi-organization support and per-organization Zapier credentials.**
  The Organization/User/Membership model (§4) is deliberately shaped so this
  can be added later (more Organization rows, more Memberships per User)
  without restructuring the core identity model — but no per-org Zapier
  credential isolation, org-switching UI, or cross-org data isolation is
  being built now.
- Admin-editable custom roles or a live permission-scope editing UI (beyond
  the hardcoded map in §9).
- Per-user or per-role rate limits.
- SSO / enterprise identity-provider integration.
- Audit log of Admin actions.
- Self-service organization creation / billing.
- Custom, admin-authored "why this is disabled" messaging (only
  system-computed reasons are in scope for the version of that story that
  doesn't depend on this identity work).

## 12. Rate-limit storage: a separate future infrastructure decision

Rate limiting (capping action-execution or analysis volume) is **not** part
of this identity architecture. It needs its own durable shared-counter
mechanism, which may or may not reuse whatever persistence technology is
eventually chosen for §10. Called out explicitly so it isn't assumed
"solved for free" once Organization/User/Membership persistence exists — a
durable counter (frequent increments) has different consistency/throughput
characteristics than the low-write identity data above, and deserves its own
technology decision when that work starts.
