# Charon — Task Backlog

```json
{
  "project": "charon",
  "updated": "2026-05-04",

  "current_session": {
    "id": "S-002",
    "goal": "Fix ForbiddenException when starting CLI session for profiles from non-primary SSO portal",
    "task_ref": "T-002",
    "started": "2026-05-04",
    "status": "in-progress",
    "blocker": null
  },

  "backlog": [
    {
      "id": "T-001",
      "title": "Handle accounts from multiple AWS Identity Center portals in Sessions",
      "description": "Implement the logic to aggregate and disambiguate accounts when a user has multiple AWS Identity Center portal URLs configured under Sessions.",
      "size": "M",
      "priority": 1,
      "status": "done",
      "tags": ["backend", "sessions", "aws-sso"]
    },
    {
      "id": "T-002",
      "title": "Fix wrong SSO token used in ProfilesPage for cross-session profiles",
      "description": "ProfilesPage passes ssoStatus.access_token (the globally best token) to configure_cli_credentials and open_aws_console. When the profile's sso_session differs from the active global session, AWS returns ForbiddenException on GetRoleCredentials. Fix by resolving the correct per-session token on the backend.",
      "size": "S",
      "priority": 1,
      "status": "in-progress",
      "tags": ["bug", "profiles", "aws-sso"]
    }
  ],

  "decisions": [
    {
      "id": "D-001",
      "date": "2026-05-04",
      "decision": "Expose get_session_sso_token(session_name) as a Tauri command so the frontend can resolve the correct access token per profile without embedding token-lookup logic in each caller.",
      "rationale": "Consistent with how get_sso_status() already surfaces tokens to the frontend. Avoids duplicating the SHA1 cache-lookup logic across multiple backend commands.",
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
    }
  ]
}
```
