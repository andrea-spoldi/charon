# Charon — Task Backlog

```json
{
  "project": "charon",
  "updated": "2026-05-05",

  "current_session": {
    "id": "S-003",
    "goal": "Show per-session SSO token status and expiration in SessionsPage",
    "task_ref": "T-004",
    "started": "2026-05-05",
    "status": "in-progress",
    "blocker": null
  },

  "backlog": [
    {
      "id": "T-004",
      "title": "Show per-session SSO token status in SessionsPage",
      "description": "Each session card in SessionsPage should display its own token status (active/expired/none) and expiration time, fetched via get_session_sso_token(session_name). Currently only a single global token is shown in the status bar (introduced in 7b11bd7).",
      "size": "M",
      "priority": 1,
      "status": "done",
      "tags": ["frontend", "sessions", "aws-sso"]
    },
    {
      "id": "T-005",
      "title": "Remove SSO token info from the status bar",
      "description": "Now that each session card shows its own token status (active/expired/none + expiration), the global SSO token indicator in the status bar is redundant. Remove it from the TopBar/status bar component.",
      "size": "S",
      "priority": 1,
      "status": "done",
      "tags": ["frontend", "ui", "aws-sso"]
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
    }
  ],

  "completed": [
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
    }
  ]
}
```
