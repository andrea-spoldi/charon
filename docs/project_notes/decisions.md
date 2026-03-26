# Architectural Decision Records

## Entries

### ADR-001: Native OIDC Device Authorization (2026-02-19)
**Context:** Needed SSO login without shelling out to `aws sso login` (slow, poor UX).
**Decision:** Implement RFC 8628 OIDC device authorization natively in Rust using `reqwest`.
**Alternatives:** AWS CLI subprocess (`aws sso login`) — rejected for latency and lack of control.
**Consequences:** Full control over polling, token caching, UX. Must maintain OIDC client code.

### ADR-002: SSO cache compatibility with AWS CLI v2 (2026-02-19)
**Context:** Users expect `aws s3 ls --profile foo` to work after logging in via Charon.
**Decision:** Write SSO token cache to `~/.aws/sso/cache/{SHA1(session_name)}.json` in the exact format AWS CLI v2 expects.
**Consequences:** Charon login is transparent to CLI tools. Must match AWS CLI hashing algorithm exactly.

### ADR-003: Double-click delete instead of window.confirm (2026-02-19)
**Context:** `window.confirm()` doesn't work in Tauri 2 webview.
**Decision:** Use a double-click-to-delete pattern with visual confirmation state and auto-clear timeout.
**Alternatives:** Custom modal dialog — rejected for being heavy for a simple confirmation.
**Consequences:** Consistent delete UX across all pages. 3-second auto-clear prevents accidental stale confirm states.

### ADR-004: Split SSO region from working region (2026-02-19)
**Context:** SSO endpoint region (where Identity Center lives) differs from the user's working region (console/CLI destination).
**Decision:** All commands accept two separate region params: `sso_region` and `console_region`/`cli_region`.
**Consequences:** Correct API calls + correct destination. Settings page `default_region` controls the working region.

### ADR-006: Long-lived process management for SSM tunnels (2026-03-12)
**Context:** SSM port-forwarding tunnels are persistent child processes, unlike all other Charon commands which are run-to-completion.
**Decision:** Use `tokio::process::Command` with Tauri managed state (`Arc<Mutex<HashMap>>`) to track child process handles. Poll status via `try_wait()` every 2 seconds from frontend. Pass STS credentials as env vars (never disk). Kill all children on app exit via `on_event(ExitRequested)`.
**Alternatives:** (1) Tauri events for push-based status — rejected for complexity vs polling pattern already used by useSsoStatus. (2) Writing temp credentials file — rejected for security (disk exposure).
**Consequences:** Must handle process lifecycle edge cases (zombie processes, port conflicts, credential expiry). Introduces first use of Tauri managed state in the app.

### ADR-007: Credential model rework — Leapp-inspired session start/stop (2026-03-25)

**Context:** Users want a "Stop" button to revoke CLI access without terminating the SSO session.
Under the previous model, profiles in `~/.aws/config` contained `sso_session`, `sso_account_id`,
and `sso_role_name` — which let the AWS CLI auto-derive fresh STS credentials from the SSO token
in `~/.aws/sso/cache/`. This made it impossible to selectively revoke CLI access: clearing
`~/.aws/credentials` and `~/.aws/cli/cache/` was futile because the CLI silently re-derived
credentials from the config + SSO token.

**Decision:** Adopt a Leapp-inspired credential model:

1. **Profile storage decoupled from `~/.aws/config`.**
   Charon stores its own profile definitions in `~/.charon/profiles.json` (same pattern as
   `tunnels.json` and `settings.json`). Profiles are no longer read from / written to
   `~/.aws/config` SSO-backed sections.

2. **Session start = write raw STS credentials.**
   When the user clicks "Configure CLI" (or a new "Start" action), Charon fetches temporary
   STS credentials via `sso get-role-credentials` and writes them to `~/.aws/credentials`
   under a named profile section (access_key_id, secret_access_key, session_token, region).
   No `sso_session`/`sso_account_id`/`sso_role_name` are written to `~/.aws/config`.

3. **Session stop = remove credentials.**
   On "Stop", Charon removes the profile's section from `~/.aws/credentials` and clears
   `~/.aws/cli/cache/`. The SSO token in `~/.aws/sso/cache/` is untouched, so Charon
   stays logged in. The CLI can no longer resolve credentials because there are no
   SSO-backed profiles in `~/.aws/config` and no raw credentials in `~/.aws/credentials`.

4. **SSO session sections (`[sso-session X]`) remain in `~/.aws/config`.**
   These are needed for Charon's OIDC login flow and do not grant CLI access on their own.

5. **`[default]` profile in `~/.aws/config`** is optionally written with region/output only
   (no SSO credential source fields).

**Alternatives considered:**
- Clear `~/.aws/sso/cache/` on stop — works but kills Charon's session too (equivalent to logout).
- Remove SSO-backed profiles from `~/.aws/config` on stop — deletes Charon's own profiles.
- Accept that CLI access lives as long as SSO session — rejected per user requirement.

**Consequences:**
- Profile migration needed: existing profiles in `~/.aws/config` must be imported to `~/.charon/profiles.json` on first run.
- `list_profiles`, `save_profile`, `delete_profile`, `set_default_profile` all change to use the new store.
- `configure_cli_credentials` and `clear_profile_credentials` become start/stop session operations.
- Breaking change for users who relied on `aws --profile X` working automatically via SSO resolution. They now need to explicitly "start" a session via Charon first.

### ADR-005: [default] profile as mirror copy (2026-02-19)
**Context:** AWS CLI uses `[default]` section as the fallback profile.
**Decision:** `set_default_profile` copies SSO fields from `[profile X]` into `[default]`. Updates/deletes to the source profile sync `[default]`.
**Consequences:** Must always check `is_current_default()` when mutating profiles. Keeps `[default]` in sync automatically.
