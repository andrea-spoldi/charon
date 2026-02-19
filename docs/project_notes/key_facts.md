# Key Facts

## Project

- **Name**: Charon
- **Purpose**: Desktop app for managing connections to multiple AWS accounts via AWS Identity Center
- **Tech Stack**: Tauri 2 (Rust) + React 19 + TypeScript + Vite 6
- **Current Version**: 0.3.4

## AWS Config Files

- **Config**: `~/.aws/config` — SSO sessions (`[sso-session X]`), profiles (`[profile X]`), default (`[default]`)
- **Credentials**: `~/.aws/credentials` — temporary STS credentials written by CLI config action
- **SSO Cache**: `~/.aws/sso/cache/{SHA1(session_name)}.json` — OIDC tokens for AWS CLI v2 compatibility
- **Cache hash**: SHA1 of the **session name** (not start URL)

## SSO Start URL Format

- Must match: `https://d-[a-z0-9]+.awsapps.com/start/`
- Validated in frontend `SessionsPage.tsx`

## Important Patterns

- **Two regions**: SSO endpoint region (for API calls) vs working region (for console/CLI destination)
- **No window.confirm()**: Tauri 2 webview doesn't support it — use double-click confirm pattern
- **React.StrictMode**: Double-fires effects in dev — guard side-effectful useEffect with refs
- **Timestamp format**: Rust produces `UTC` suffix, JS needs `Z` — normalise before `new Date()`
- **[default] mirror**: Kept in sync by `is_current_default()` checks in `save_profile` and `delete_profile`
- **CLI config isolation**: AWS CLI commands with explicit params use `AWS_CONFIG_FILE=/dev/null` to avoid `[default]` profile interference
- **Toast errors**: All `catch` blocks must call `onError()` toast callback, not just `console.error`

## Local Development

- `make dev` — Run in development mode (hot reload)
- `make test` — Run all tests
- `make lint` — Run all linters
- `make build` — Build production installers
