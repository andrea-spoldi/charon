# Bug Log

Chronological log of bugs encountered and their solutions.

## Entries

### 2026-02-19 - Errors silently swallowed, no UI feedback (v0.3.3)
- **Issue**: Logout failures, account list errors from wrong session config, and other connection errors were only logged to console — user saw no feedback in the UI
- **Root Cause**: All `catch` blocks across TopBar, SessionsPage, ProfilesPage only called `console.error` with no visible notification to the user
- **Solution**: Added a global toast notification system (`useToast` hook + `ToastContainer` component). All error `catch` blocks now call `onError()` which adds a toast with 8s auto-dismiss. Toasts appear bottom-right above the status bar with slide-in animation
- **Prevention**: Every new `catch` block should surface errors via `onError` toast callback, not just `console.error`
- **Files**: `src/hooks/useToast.ts`, `src/components/ToastContainer.tsx`, `src/App.tsx`, `src/components/TopBar.tsx`, `src/pages/SessionsPage.tsx`, `src/pages/ProfilesPage.tsx`

### 2026-02-19 - [default] profile stale after update or delete (v0.3.2)
- **Issue**: When a profile set as `[default]` in `~/.aws/config` was updated or deleted, the `[default]` section retained the old values
- **Root Cause**: `set_default_profile` copies SSO fields from `[profile X]` into `[default]`, but `save_profile` and `delete_profile` only modified `[profile X]` without syncing `[default]`
- **Solution**: Added `is_current_default()` helper that compares SSO fields between `[profile X]` and `[default]`. Both `save_profile` (syncs `[default]`) and `delete_profile` (removes `[default]`) now check and act on this
- **Prevention**: Any operation that mutates a profile section must consider the `[default]` mirror. The `is_current_default()` guard centralises this check
- **File**: `src-tauri/src/aws/config.rs`

### 2026-02-19 - StatusBar "Expires: Invalid Date" (v0.3.1)
- **Issue**: Status bar showed "Expires: Invalid Date" instead of the token expiry time
- **Root Cause**: Rust `epoch_to_utc_string` produces timestamps with `UTC` suffix (e.g. `2026-02-19T10:30:00UTC`) but JavaScript `new Date()` cannot parse `UTC` — it expects `Z` or `+00:00`
- **Solution**: Normalise with `.replace("UTC", "Z")` before passing to `new Date()` in `StatusBar.tsx`
- **Prevention**: When producing timestamps for cross-language consumption, always use standard ISO 8601 / RFC 3339 suffixes (`Z`)
- **File**: `src/components/StatusBar.tsx`, `src-tauri/src/commands/sso.rs`

### 2026-02-19 - Double browser window on first SSO login (v0.2.0+)
- **Issue**: Clicking "Login" from the TopBar opened two browser windows on the first attempt; second attempt worked fine
- **Root Cause**: `React.StrictMode` double-fires effects in dev mode. The `useEffect` watching `loginSessionName` called `handleLogin` twice
- **Solution**: Added `loginTriggeredRef` guard in `SessionsPage.tsx` to prevent duplicate calls for the same session name
- **Prevention**: Always guard side-effectful `useEffect` callbacks with refs when using StrictMode
- **File**: `src/pages/SessionsPage.tsx`

### 2026-02-19 - Console/CLI broken after region refactor
- **Issue**: Clicking console or CLI config icon flashed red briefly and did nothing
- **Root Cause**: The working region (e.g. `us-east-1`) was passed to `get-role-credentials --region` which needs the SSO endpoint region (e.g. `eu-west-1`)
- **Solution**: Split into two params everywhere: `sso_region` (for SSO API calls) and `console_region`/`cli_region` (for destination)
- **Prevention**: SSO endpoint region != working region — always pass them separately
- **Files**: `src-tauri/src/commands/accounts.rs`, `src/pages/AccountsPage.tsx`, `src/pages/ProfilesPage.tsx`

### 2026-02-19 - Profile/session deletion not working (window.confirm)
- **Issue**: Trash icon had no effect when deleting profiles or sessions
- **Root Cause**: `window.confirm()` does not work in Tauri 2 webview
- **Solution**: Replaced with double-click-to-delete pattern using `confirmDelete` state + auto-clear timeout
- **Prevention**: Never use `window.confirm()` / `window.alert()` / `window.prompt()` in Tauri — use custom UI patterns
- **Files**: `src/pages/ProfilesPage.tsx`, `src/pages/SessionsPage.tsx`

### 2026-02-19 - SSO token cache hash mismatch ("Token for docebo does not exist")
- **Issue**: AWS CLI v2 couldn't find SSO token after Charon login
- **Root Cause**: Cache file was named with `SHA1(start_url)` but AWS CLI expects `SHA1(session_name)`
- **Solution**: Updated `write_sso_cache` to hash `session_name` instead of `start_url`
- **Prevention**: Always verify cache filename algorithm against AWS CLI source
- **File**: `src-tauri/src/commands/sso.rs`
