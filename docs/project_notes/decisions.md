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

### ADR-005: [default] profile as mirror copy (2026-02-19)
**Context:** AWS CLI uses `[default]` section as the fallback profile.
**Decision:** `set_default_profile` copies SSO fields from `[profile X]` into `[default]`. Updates/deletes to the source profile sync `[default]`.
**Consequences:** Must always check `is_current_default()` when mutating profiles. Keeps `[default]` in sync automatically.
