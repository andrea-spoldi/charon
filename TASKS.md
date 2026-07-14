# Charon — Task Backlog

```json
{
  "project": "charon",
  "updated": "2026-06-11",

  "current_session": {
    "id": "S-005",
    "goal": "Auto-refresh profile credentials before SSO-session-bounded expiration — T-008/T-009/T-010 all done",
    "task_ref": null,
    "started": "2026-07-14",
    "status": "done",
    "blocker": null
  },

  "backlog": [],

  "housekeeping": [
    {
      "date": "2026-07-14",
      "notes": "Removed stale git worktree .claude/worktrees/happy-beaver-fb2f80 (branch claude/happy-beaver-fb2f80, already merged into main, dated May 4). Committed Cargo.lock version sync (0.13.0->0.14.1 drift from the 0.14.1 release) and regenerated Tauri capability schemas (acl-manifests.json, desktop-schema.json, macOS-schema.json). See commit 22c42a9."
    }
  ],

  "decisions": [
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
      "notes": "Added per-profile expirations state in ProfilesPage.tsx keyed by profile name, populated from configure_cli_credentials' expiresAt. Seeding effect recovers expiry for already-active profiles (e.g. after app restart) via a read-only get_role_credentials call. Interval effect (paced by settings.refresh_interval_secs) reissues credentials via the shared applyCredentials() helper once within REFRESH_BUFFER_MS (5 min) of expiry, but only if resolveSessionToken() reports the profile's SSO session status is still 'active' — otherwise it's a silent no-op. Also removed the old single default-profile-only expiration tracking (App.tsx effect + StatusBar 'Profile Expires' text), which only ever reflected the default profile regardless of which profiles were actually active; StatusBar's stop-all button now gates on hasActiveSessions instead."
    },
    {
      "id": "T-010",
      "title": "UI feedback for auto-refreshed profile credentials + test coverage",
      "completed_date": "2026-07-14",
      "session_ref": "S-005",
      "notes": "Each profile row now shows its own credential-expiry badge (active/expired, reusing SessionsPage's sso-token-badge CSS classes from T-004) plus an expiry timestamp line, instead of one global status-bar reading. Added src/pages/ProfilesPage.test.tsx with fake-timer Vitest coverage: one test confirms auto-refresh fires while the SSO session is active, another confirms it's skipped once the session has expired.",
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
