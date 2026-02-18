# Charon

Desktop application for managing connections to multiple AWS accounts via AWS Identity Center.

## Tech Stack

- **Backend**: Rust (Tauri 2 framework)
- **Frontend**: React 19 + TypeScript
- **Bundler**: Vite 6
- **Test Runner**: Vitest (frontend), Cargo test (Rust)
- **Package Managers**: Cargo (Rust), pnpm (frontend)
- **CI/CD**: GitLab CI

## Repository Structure

```
src/                    → React/TypeScript frontend
src-tauri/              → Rust/Tauri backend
  src/main.rs           → Entry point
  src/lib.rs            → App builder, plugin setup
  src/commands.rs       → IPC command handlers
docs/                   → Documentation
```

## Commands

- `make setup` — Install all dependencies and git hooks
- `make dev` — Run in development mode (hot reload)
- `make build` — Build production installers
- `make test` — Run all tests (frontend + Rust)
- `make lint` — Run all linters (ESLint, Prettier, Clippy, rustfmt)
- `make fmt` — Auto-format all code

## Conventions

- **Branching**: Trunk-based development (short-lived feature branches off `main`)
- **Commits**: Conventional Commits format (`feat:`, `fix:`, `chore:`, etc.)
- **Versioning**: Semantic Versioning, git tags as `v{major}.{minor}.{patch}`
- **Logging**: Use `log` crate macros (`info!`, `warn!`, `error!`) in Rust; never log secrets or PII
- **API style**: Tauri IPC commands in `src-tauri/src/commands.rs`, exposed via `tauri::generate_handler!`
- **Error format**: Standard JSON error responses following org conventions
- **Testing**: All new Tauri commands should have corresponding unit tests
- **Frontend tests**: Use Vitest + Testing Library

## Key Patterns

- Tauri commands are defined in `commands.rs` and registered in `lib.rs`
- Frontend calls Rust via `invoke("command_name", { args })` from `@tauri-apps/api/core`
- Environment config via `.env` files (see `.env.example`); never commit `.env`
