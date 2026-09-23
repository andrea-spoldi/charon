# Charon — Task Backlog

```json
{
  "project": "charon",
  "updated": "2026-09-22",

  "current_session": {
    "id": "S-006",
    "goal": "T-014, T-016, T-017 done (isolated-console backend command, frontend action, Chrome location setting). T-018 test coverage already satisfied along the way. Remaining: T-015 (likely redundant, needs confirm/cancel), T-019 (stretch cleanup).",
    "task_ref": null,
    "started": "2026-09-22",
    "status": "in-progress",
    "blocker": null
  },

  "backlog": [
    {
      "id": "T-014",
      "title": "Backend: launch AWS console federation URL in an isolated browser profile",
      "description": "New Tauri command (or flag on open_aws_console) that, instead of open::that() + the forced OAuth-logout wrapper, launches the federation login URL in a dedicated OS browser profile/user-data-dir per account (macOS-first: Chrome --user-data-dir/--profile-directory or an equivalent per-browser mechanism), so its cookies don't collide with other open console sessions. Keep the existing single-session Play behavior as the default; this is a new, opt-in path.",
      "size": "M",
      "priority": 1,
      "status": "done",
      "tags": ["backend", "rust", "browser", "multi-session-console"]
    },
    {
      "id": "T-015",
      "title": "Backend: persist account-to-browser-profile mapping",
      "description": "Extend account/profile config storage to record which isolated browser profile dir an account is assigned to, auto-assigning one on first isolated open (T-014) and reusing it on subsequent opens so the same account always lands in the same profile. NOTE: T-014 shipped with browser_profile_dir() deriving the directory deterministically from account_id, with no mapping table — this may already satisfy the requirement. Confirm with user whether a real mapping is still needed (e.g. for per-role rather than per-account isolation) before starting, or cancel this task.",
      "size": "S",
      "priority": 2,
      "status": "pending",
      "tags": ["backend", "rust", "config", "multi-session-console"]
    },
    {
      "id": "T-016",
      "title": "Frontend: 'Open in new session' action for accounts/profiles",
      "description": "Add an action on AccountsPage/ProfilesPage that calls the isolated-open command (T-014) instead of the current Play flow that replaces the browser's single console session. Show which accounts currently have an isolated session open (reuse the sso-token-badge pattern from T-004).",
      "size": "M",
      "priority": 3,
      "status": "done",
      "tags": ["frontend", "react", "multi-session-console"]
    },
    {
      "id": "T-017",
      "title": "Settings: default browser/isolation strategy",
      "description": "Settings UI to pick the isolation strategy (default single-session browser vs. per-account isolated Chrome profiles) and fall back gracefully with a clear message when the required browser (e.g. Chrome) isn't installed. NARROWED at user's request to just a configurable Chrome location (see T-017 in completed[]) rather than a full strategy toggle; the graceful-fallback message still applies whether or not Chrome is found.",
      "size": "S",
      "priority": 4,
      "status": "done",
      "tags": ["frontend", "settings", "multi-session-console"]
    },
    {
      "id": "T-018",
      "title": "Tests for isolated console-session launch",
      "description": "Rust unit tests for the new command's URL/profile-argument construction (mirror existing get_role_credentials/open_aws_console test style), and a Vitest test for the new frontend 'open in new session' action.",
      "size": "S",
      "priority": 5,
      "status": "done",
      "tags": ["testing", "multi-session-console"]
    },
    {
      "id": "T-019",
      "title": "Reap stale isolated browser profile data dirs",
      "description": "Stretch/cleanup task: track created per-account browser profile directories and prune ones no longer referenced by any account, to avoid unbounded disk growth from ephemeral profiles over time.",
      "size": "S",
      "priority": 6,
      "status": "pending",
      "tags": ["backend", "cleanup", "multi-session-console"]
    }
  ],

  "housekeeping": [
    {
      "date": "2026-07-14",
      "notes": "Removed stale git worktree .claude/worktrees/happy-beaver-fb2f80 (branch claude/happy-beaver-fb2f80, already merged into main, dated May 4). Committed Cargo.lock version sync (0.13.0->0.14.1 drift from the 0.14.1 release) and regenerated Tauri capability schemas (acl-manifests.json, desktop-schema.json, macOS-schema.json). See commit 22c42a9."
    },
    {
      "date": "2026-09-22",
      "notes": "Backfilled TASKS.md at session start (S-006): the S-005 record was left at status 'done' since 2026-07-15 despite two releases (v0.15.0, v0.16.0) and a substantial design-system/accessibility commit (1c368a1) landing on main afterward with no task entry. Added T-013 to close that gap. Also flagged untracked .claude/agents/ and .claude/skills/impeccable/ in the working tree — left as-is pending user decision, not part of this backfill."
    }
  ],

  "decisions": [
    {
      "id": "D-005",
      "date": "2026-09-22",
      "decision": "Multi-account concurrent AWS console sessions (T-014..T-019) will use per-account isolated OS browser profiles (separate user-data-dir), not multiple tabs/windows in one browser profile.",
      "rationale": "open_aws_console (src-tauri/src/commands/accounts.rs:184) already federates console sign-in but deliberately wraps every login in an OAuth logout redirect first, because AWS's signin.aws.amazon.com federation endpoint is single-session per browser origin — a second account's login silently replaces the first's cookie otherwise. Isolated browser profiles give each account its own cookie jar, the same approach tools like granted/Leapp use.",
      "supersedes": null
    },
    {
      "id": "D-001",
      "date": "2026-05-04",
      "decision": "Expose get_session_sso_token(session_name) as a Tauri command so the frontend can resolve the correct access token per profile without embedding token-lookup logic in each caller.",
      "rationale": "Consistent with how get_sso_status() already surfaces tokens to the frontend. Avoids duplicating the SHA1 cache-lookup logic across multiple backend commands.",
      "supersedes": null
    },
    {
      "id": "D-002",
      "date": "2026-05-05",
      "decision": "Use cargo-dist for releases with a root Cargo.toml workspace manifest, [workspace.metadata.dist] config, and allow-dirty=[\"ci\"] to suppress workflow freshness checks.",
      "rationale": "cargo-dist requires a workspace root; Tauri projects keep Cargo.toml in src-tauri/ so a thin root manifest is needed. allow-dirty avoids regenerating the workflow on every dist init.",
      "supersedes": null
    },
    {
      "id": "D-003",
      "date": "2026-05-05",
      "decision": "Build the frontend (pnpm build) as a step in the release workflow before cargo-dist compiles the Rust backend.",
      "rationale": "tauri::generate_context!() embeds the frontend at compile time; without a pre-built dist/ the Rust compilation fails.",
      "supersedes": null
    },
    {
      "id": "D-004",
      "date": "2026-06-11",
      "decision": "Use semantic-release with @semantic-release/exec to automate version bumps across package.json, Cargo.toml, tauri.conf.json, and both Cargo.lock files. Requires RELEASE_TOKEN PAT because GITHUB_TOKEN pushes don't trigger downstream workflows.",
      "rationale": "Eliminates manual version bumping in 4+ files. Tag push from semantic-release triggers existing cargo-dist release.yml.",
      "supersedes": null
    }
  ],

  "completed": [
    {
      "id": "T-017",
      "title": "Settings: configurable Google Chrome location for isolated console sessions",
      "completed_date": "2026-09-23",
      "session_ref": "S-006",
      "notes": "Triggered by user hitting 'requires Google Chrome, which is not found at the expected install location' testing T-014 locally (Chrome installed at a non-default path). Added AppSettings.chrome_path (src-tauri/src/commands/settings.rs) with #[serde(default)] so existing settings.json files without the field still deserialize (verified with a dedicated backward-compat test, not just the happy path) instead of silently resetting ALL settings to defaults on load. Added resolve_chrome_path_override()/resolve_chrome_path() in accounts.rs, mirroring the existing aws_cli_path/resolve_aws_cli override convention exactly (empty string = auto-detect, non-empty = trust the configured path outright, no existence check). Added a 'Google Chrome Location' field in SettingsPage.tsx next to AWS CLI Path. TDD throughout: settings roundtrip/backward-compat tests, resolve_chrome_path_override unit tests, and a new SettingsPage.test.tsx (page had no test file before). NARROWED from the original T-017 backlog description (see backlog[] T-017) — just the location override, not a full isolation-strategy toggle, per direct user request. All green: 38/38 cargo tests, 10/10 vitest, clippy/tsc/eslint/prettier clean."
    },
    {
      "id": "T-016",
      "title": "Frontend: 'Open in new session' action for accounts/profiles",
      "completed_date": "2026-09-22",
      "session_ref": "S-006",
      "notes": "Added handleOpenIsolatedConsole in AccountsPage.tsx (TDD-first: RED test in new AccountsPage.test.tsx asserting invoke('open_aws_console_isolated', {...}) is called on click, verified failing before implementing) and a new role-actions button (Layers icon, title 'Open in isolated session (keeps other accounts signed in)') next to the existing 'Open AWS Console' button, reusing the same actionStatus loading/error key pattern as handleOpenConsole/handleConfigureCli. Scoped to AccountsPage only, not ProfilesPage — profiles are for CLI credentials, not console sessions, so there was no equivalent action to extend there. DESCOPED from the original description: did not add a persistent 'this account has an isolated session open' badge (the sso-token-badge pattern from T-004). Reason: unlike CLI credentials, the app has no way to know whether a spawned isolated Chrome window/profile is still open or its console session still valid once open_aws_console_isolated returns (it's fire-and-forget, same as the existing open_aws_console) — a badge would have to fake or guess that state. Flagged for user: worth a real answer only if there's a reliable signal to hang it on (e.g. polling profile-dir lock files, or just accept fire-and-forget like the existing console button). All tests pass (9/9 vitest, 35/35 cargo), tsc/eslint/prettier clean."
    },
    {
      "id": "T-014",
      "title": "Backend: launch AWS console federation URL in an isolated browser profile",
      "completed_date": "2026-09-22",
      "session_ref": "S-006",
      "notes": "Added open_aws_console_isolated Tauri command (src-tauri/src/commands/accounts.rs), registered in lib.rs generate_handler!. Built TDD-first (RED-GREEN per function, verified in cargo test output each cycle): browser_profile_dir() derives ~/Library/Application Support/charon/browser-profiles/<account_id> deterministically from account_id — no separate mapping table needed, which may make T-015 redundant (flagged for confirmation before starting T-015). candidate_chrome_paths()/find_chrome_executable_with() locate a Chrome install (macOS-only for now; command errors clearly if Chrome isn't found, since --user-data-dir isolation isn't supported by Safari). build_isolated_launch_command() builds `chrome --user-data-dir=<profile_dir> --no-first-run --new-window <url>`, spawned (not waited on) so the browser stays open independent of the app. Refactored open_aws_console's inline signin-token-fetch and login-URL-building into shared get_signin_token()/build_login_url() (extracted const SIGN_IN_BASE), reused by the new isolated command; the isolated command skips the OAuth logout-redirect wrapper that open_aws_console uses (that wrapper is what makes the existing flow single-session — see D-005). Added 6 new unit tests, all passing; full suite (35 tests) + clippy clean. No frontend wiring yet — that's T-016."
    },
    {
      "id": "T-013",
      "title": "Document design system (PRODUCT.md, DESIGN.md) and harden accessibility, contrast, and nav",
      "completed_date": "2026-09-16",
      "session_ref": null,
      "notes": "Commit 1c368a1, released as v0.15.0/v0.16.0 (not logged at the time — backfilled 2026-09-22). Added PRODUCT.md + DESIGN.md + .impeccable/design.json sidecar documenting the 'Operator's Console' VS Code Dark+-derived visual system. Fixed WCAG AA contrast failures (-onprose text-safe variants for Muted Text/Editor Blue/Danger Red; fixed undefined --color-text-muted breaking the SSO token badge color). Added aria-live toast region, aria-labels on icon-only buttons, per-page <h1>, aria-current on active nav, prefers-reduced-motion fallbacks. Recompressed background asset 3.1MB PNG -> 346KB JPEG. Pinned tauri.conf.json minWidth/minHeight (900x600). Normalized stray font-size/radius/color one-offs into CSS variables. Reordered sidebar nav to match real usage (Sessions, Profiles, Accounts, Tunnels, Shell, Settings) and defaulted app to Sessions on launch. Fixed a vitest localStorage mock bug (Node's native stub was shadowing jsdom's, silently failing all App.test.tsx assertions)."
    },
    {
      "id": "T-008",
      "title": "Return credential expiration from configure_cli_credentials",
      "completed_date": "2026-07-14",
      "session_ref": "S-005",
      "notes": "Changed configure_cli_credentials return type from String to ConfigureCliCredentialsResult { message, expires_at } (camelCase expiresAt), sourced from RoleCredentials.expiration (epoch ms). Updated ProfilesPage.tsx Play button call site and types.ts. Added Rust serialization test. Foundation for T-009 auto-refresh."
    },
    {
      "id": "T-009",
      "title": "Frontend: auto-refresh a profile's CLI credentials shortly before expiry, only if its SSO session is still active",
      "completed_date": "2026-07-14",
      "session_ref": "S-005",
      "notes": "Added per-profile expirations state in ProfilesPage.tsx keyed by profile name, populated only from an explicit Play click via configure_cli_credentials' expiresAt (see T-011 fix — an initial 'seed from persisted session_active' effect was removed for over-reaching). Interval effect (paced by settings.refresh_interval_secs) reissues credentials via the shared applyCredentials() helper once within REFRESH_BUFFER_MS (5 min) of expiry, but only if resolveSessionToken() reports the profile's SSO session status is still 'active' — otherwise it's a silent no-op. Also removed the old single default-profile-only expiration tracking (App.tsx effect + StatusBar 'Profile Expires' text), which only ever reflected the default profile regardless of which profiles were actually active; StatusBar's stop-all button now gates on hasActiveSessions instead."
    },
    {
      "id": "T-010",
      "title": "UI feedback for auto-refreshed profile credentials + test coverage",
      "completed_date": "2026-07-14",
      "session_ref": "S-005",
      "notes": "Each profile row now shows its own credential-expiry badge (active/expired, reusing SessionsPage's sso-token-badge CSS classes from T-004) plus an expiry timestamp line, instead of one global status-bar reading. Added src/pages/ProfilesPage.test.tsx with fake-timer Vitest coverage: one test confirms auto-refresh fires while the SSO session is active, another confirms it's skipped once the session has expired."
    },
    {
      "id": "T-011",
      "title": "Fix bug: visiting Profiles auto-fetched/refreshed credentials for ALL saved profiles, not just ones Played this session",
      "completed_date": "2026-07-14",
      "session_ref": "S-005",
      "notes": "Root cause: T-009's seeding effect scanned profiles.session_active (a flag persisted forever once a profile is Played, only cleared by an explicit Stop) to resurrect expiry-tracking on every ProfilesPage mount. Any profile ever Played and not explicitly Stopped — plausibly most/all saved profiles in daily use — got swept into get_role_credentials fetches and, subsequently, periodic configure_cli_credentials writes to ~/.aws/credentials. Fix: removed the seeding effect entirely; expirations (and therefore auto-refresh eligibility) is now populated only by an explicit Play click in the current running session. Tradeoff: after an app restart, a profile won't auto-refresh until Played again in that session, even if its Stop button still shows session_active from before. Added a regression test in ProfilesPage.test.tsx that fails on the old seeding-effect code and passes on the fix (verified both ways before committing). Follow-up in the same task: the profile-row Play/Stop icon was still driven by the stale persisted session_active flag directly, so a profile Played in a prior run (and not Stopped) kept showing the Stop (square) icon after restart even though it was no longer tracked/auto-refreshed. Switched the icon condition (and the now-redundant session_active checks on the credential badges and the auto-refresh interval) to key off expirations[profile.name] != null instead, so the icon accurately reflects in-session tracking state. Verified this specific regression the same way (test fails on session_active-based condition, passes on expirations-based one)."
    },
    {
      "id": "T-012",
      "title": "Revert an abandoned profile to Play once its credentials actually expire without being refreshed",
      "completed_date": "2026-07-15",
      "session_ref": "S-005",
      "notes": "Edge case: if a profile's SSO session dies before its STS credentials do, the auto-refresh loop correctly no-ops (per spec), but expirations[name] stayed set until an explicit Stop — so the row kept showing Stop even after the credentials genuinely expired and stopped working, requiring an extra manual Stop-then-Play to recover. Added abandonExpiredProfile() in ProfilesPage.tsx: the auto-refresh interval now checks expiresAt <= now first: if a tracked profile's expiry has actually passed, it clears the expirations entry and best-effort calls stop_session to clean up the dead ~/.aws/credentials section, reverting the row to Play automatically. Added a regression test verified against the pre-fix code (fails without it, passes with it).",
      "commit": "pending"
    },
    {
      "id": "T-001",
      "title": "Handle accounts from multiple AWS Identity Center portals in Sessions",
      "completed_date": "2026-05-04",
      "session_ref": "S-001",
      "notes": "Added list_all_portal_accounts command. SsoAccountWithSession carries token+region per account. Frontend useAccounts and AccountsPage updated to use per-account context."
    },
    {
      "id": "T-002",
      "title": "Fix wrong SSO token used in ProfilesPage for cross-session profiles",
      "completed_date": "2026-05-04",
      "session_ref": "S-002",
      "notes": "Added get_session_sso_token Tauri command. ProfilesPage resolveSessionToken() looks up the correct token per profile's sso_session before each action."
    },
    {
      "id": "T-003",
      "title": "Fix cargo-dist release pipeline for Tauri project structure",
      "completed_date": "2026-05-05",
      "session_ref": "S-002",
      "notes": "Added root Cargo.toml workspace manifest, [workspace.metadata.dist] config with targets and allow-dirty, [profile.dist], repository field in src-tauri/Cargo.toml, Tauri GTK/WebKit apt deps step, and frontend build steps in release.yml."
    },
    {
      "id": "T-004",
      "title": "Show per-session SSO token status in SessionsPage",
      "completed_date": "2026-05-06",
      "session_ref": "S-003",
      "notes": "Added sessionTokens state and fetchSessionTokens callback. Each session card now shows a status badge (Active/Expired/No token) with icon and formatted expiry timestamp, refreshed on mount and after login."
    },
    {
      "id": "T-005",
      "title": "Remove SSO token info from the status bar",
      "completed_date": "2026-05-06",
      "session_ref": "S-003",
      "notes": "Removed the 'SSO Expires' span from StatusBar.tsx. Per-session cards in SessionsPage now carry this information."
    },
    {
      "id": "T-006",
      "title": "Replace TopBar Login with per-session login/logout in SessionsPage",
      "completed_date": "2026-06-11",
      "session_ref": "S-004",
      "notes": "Added logout_sso_session Tauri command (deletes per-session cache file). Replaced separate Login/Logout buttons with a single toggle icon per session card. Removed global Login/Logout from TopBar and all loginSessionName wiring from App.tsx."
    },
    {
      "id": "T-007",
      "title": "Automate version bumping with semantic-release",
      "completed_date": "2026-06-11",
      "session_ref": "S-004",
      "notes": "Added .releaserc.json, scripts/bump-version.mjs, .github/workflows/semantic-release.yml. Semantic-release auto-bumps 5 version files and pushes tags that trigger cargo-dist."
    }
  ]
}
```
