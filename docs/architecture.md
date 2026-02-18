# Architecture Overview

## System Context

Charon is a desktop application that manages connections to multiple AWS accounts via AWS Identity Center (formerly AWS SSO). It provides a user-friendly interface for developers and operators to switch between AWS accounts without manual CLI configuration.

```
┌──────────────┐      ┌──────────────────────┐
│    User       │──────│  Charon (Desktop)    │
└──────────────┘      │  ┌────────────────┐  │
                      │  │  React Frontend │  │
                      │  └───────┬────────┘  │
                      │          │ IPC        │
                      │  ┌───────┴────────┐  │
                      │  │  Rust Backend   │  │
                      │  └───────┬────────┘  │
                      └──────────┼───────────┘
                                 │
                      ┌──────────┴───────────┐
                      │  AWS Identity Center  │
                      │  (SSO / IAM)          │
                      └──────────────────────┘
```

## Technology Stack

- **Frontend**: React 19 + TypeScript, bundled with Vite
- **Backend**: Rust with Tauri 2 framework
- **IPC**: Tauri's command system (type-safe bridge between frontend and Rust)
- **Logging**: `log` + `env_logger` (Rust side)

## Key Design Decisions

### Tauri over Electron

Tauri was chosen for its smaller bundle size, lower memory footprint, and native Rust backend which provides better security and performance for system-level operations like credential management.

### React for Frontend

React + TypeScript provides a familiar, productive development experience with strong typing and a large ecosystem of UI components.

### Trunk-Based Development

Simple branching model that keeps the main branch always deployable. Feature branches are short-lived and merged frequently.

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `src/` | React/TypeScript frontend code |
| `src-tauri/src/` | Rust backend (Tauri commands, business logic) |
| `src-tauri/src/commands.rs` | IPC command handlers exposed to the frontend |
| `docs/` | Project documentation |

## Observability

- **Logging**: Structured logging via Rust's `log` facade with `env_logger`. Log level controlled by `RUST_LOG` environment variable.
- Logs use standard levels: `debug`, `info`, `warn`, `error`.
