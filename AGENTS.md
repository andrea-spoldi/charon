# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Charon

Desktop application for managing connections to multiple AWS accounts via AWS Identity Center (SSO). Tauri 2 (Rust backend) + React 19/TypeScript frontend, bundled with Vite 6.

## Commands

- `make setup` — Install all dependencies and git hooks
- `make dev` — Run in development mode (hot reload)
- `make build` — Build production installers (`make dist` adds macOS ad-hoc signing)
- `make test` — Run all tests; `make test-frontend` (Vitest) or `make test-rust` (cargo test) for one side
- `make lint` — ESLint, Prettier check, `cargo fmt --check`, `cargo clippy -- -D warnings`
- `make fmt` — Auto-format all code

Single test: `pnpm vitest run src/App.test.tsx` (or `-t "name"`); `cd src-tauri && cargo test test_name`.

## Architecture

Frontend calls Rust via `invoke("command_name", { args })` from `@tauri-apps/api/core`. Data flow: React pages (`src/pages/`) use custom hooks (`src/hooks/` — `useAccounts`, `useProfiles`, `useSsoStatus`, `useTunnels`, `useToast`) which wrap `invoke` calls; shared types live in `src/types.ts` and must mirror the Rust structs (serde-serialized).

Backend layers in `src-tauri/src/`:

- `commands/` — one module per feature (`sso`, `accounts`, `profiles`, `sessions`, `settings`, `tunnels`). Every command returns `Result<T, String>` and must be registered in `tauri::generate_handler![...]` in `lib.rs` or the frontend gets a silent "command not found".
- `aws/` — AWS integration layer: `config.rs` (reads/writes `~/.aws/config` and `~/.aws/credentials`), `oidc.rs` (SSO OIDC device-auth flow), `sso_cache.rs` (reads `~/.aws/sso/cache/{SHA1(session_name)}.json` — hash is of the session *name*, not the start URL).
- `lib.rs` — app builder; runs startup migrations (legacy config location, profiles from `~/.aws/config`) and registers managed state: `TunnelState` (active SSM tunnels) and `ShellState` (embedded xterm shell sessions).
- Long-running external processes (SSM tunnels via Session Manager plugin, shell sessions, AWS CLI) are child processes tracked in that managed state; the AWS CLI binary is resolved by `commands::resolve_aws_cli()` (settings override, then common install paths — bundled apps have a minimal PATH).

Credential model (Leapp-inspired start/stop, ADR-007): profiles live in Charon's own store `~/.charon/profiles.json`, **not** `~/.aws/config` (which keeps only `[sso-session]` blocks). Starting a session writes temporary STS credentials to `~/.aws/credentials`; stopping removes them. All app state lives under `~/.charon/` (`settings.json`, `tunnels.json`, `profiles.json`, `charon.log`) via `commands::charon_home_dir()`.

## Project Memory

- `docs/project_notes/` — key_facts.md, decisions.md (ADRs), bugs.md, issues.md. **Read key_facts.md before non-trivial work; record new decisions/gotchas there.**
- `TASKS.md` — session/task backlog and decision log (JSON block).
- `docs/architecture.md` — high-level overview.

## Gotchas

- Tauri 2 webview has no `window.confirm()` — use the double-click-to-confirm pattern instead.
- React.StrictMode double-fires effects in dev — guard side-effectful `useEffect` with refs.
- Rust timestamps end in ` UTC`; JS `new Date()` needs `Z` — normalise before parsing.
- Two distinct regions: the SSO endpoint region (API calls) vs the working region (console/CLI destination) — don't conflate them.
- AWS CLI invocations with explicit params set `AWS_CONFIG_FILE=/dev/null` to avoid `[default]` profile interference.
- Frontend `catch` blocks must surface errors via the `onError()` toast callback, not just `console.error`.

## Conventions

- Trunk-based development; Conventional Commits (`feat:`/`fix:` drive semantic-release versioning; tags `v{major}.{minor}.{patch}`); CI is GitLab.
- Rust logging via `log` crate macros; level controlled by `CHARON_LOG_LEVEL` (falls back to `RUST_LOG`); never log secrets or PII.
- All new Tauri commands need unit tests (Rust) and frontend tests use Vitest + Testing Library.
- `AGENTS.md` is a copy of this file — keep them in sync when editing either.
