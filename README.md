# Charon

Desktop application for managing connections to multiple AWS accounts via [AWS Identity Center](https://aws.amazon.com/iam/identity-center/).

Built with [Tauri 2](https://v2.tauri.app/) (Rust backend + React 19 / TypeScript frontend).

## Prerequisites

| Dependency | Version | Notes |
|------------|---------|-------|
| [Rust](https://www.rust-lang.org/tools/install) | >= 1.77 | Backend toolchain |
| [Node.js](https://nodejs.org/) | >= 22 | Frontend toolchain |
| [pnpm](https://pnpm.io/) | >= 9 | Enable with `corepack enable` |
| [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) | v2 | Required for SSO login and credential management |
| [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) | — | Required for SSM port-forwarding tunnels |
| [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) | — | Platform-specific system libraries |
| [pre-commit](https://pre-commit.com/) | — | Optional, for git hooks |

## Getting Started

```bash
# Install dependencies and git hooks
make setup

# Run in development mode (hot reload)
make dev

# Run all tests (frontend + Rust)
make test

# Build production installers
make build

# Build + ad-hoc sign for internal distribution (macOS)
make dist
```

## Project Structure

```
charon/
├── src/                        # React/TypeScript frontend
│   ├── components/             # Reusable UI components
│   │   ├── Sidebar.tsx         # Navigation sidebar
│   │   ├── StatusBadge.tsx     # Connection status indicator
│   │   ├── StatusBar.tsx       # Bottom status bar (SSO token info)
│   │   ├── ToastContainer.tsx  # Toast notification system
│   │   └── TopBar.tsx          # Top application bar
│   │   ├── ActiveTunnelCard.tsx # Active tunnel status card
│   │   └── TunnelForm.tsx      # Tunnel creation/edit form
│   ├── hooks/                  # Custom React hooks
│   │   ├── useAccounts.ts      # AWS account data fetching
│   │   ├── useProfiles.ts      # SSO profile management
│   │   ├── useSsoStatus.ts     # SSO session status polling
│   │   ├── useToast.ts         # Toast notification state
│   │   └── useTunnels.ts       # SSM tunnel state management
│   ├── pages/                  # Application pages
│   │   ├── AccountsPage.tsx    # AWS account listing
│   │   ├── ProfileForm.tsx     # SSO profile editor
│   │   ├── ProfilesPage.tsx    # SSO profile management
│   │   ├── SessionsPage.tsx    # Active sessions view
│   │   ├── SettingsPage.tsx    # Application settings
│   │   └── TunnelsPage.tsx     # SSM port-forwarding tunnels
│   ├── styles/                 # CSS styles
│   ├── types.ts                # Shared TypeScript types
│   ├── App.tsx                 # Main application component
│   ├── App.test.tsx            # Frontend tests
│   └── main.tsx                # React entry point
├── src-tauri/                  # Rust/Tauri backend
│   ├── src/
│   │   ├── aws/                # AWS integration layer
│   │   │   ├── config.rs       # AWS config/credentials file handling
│   │   │   ├── oidc.rs         # SSO OIDC token management
│   │   │   └── sso_cache.rs    # SSO cache reading/parsing
│   │   ├── commands/           # Tauri IPC command handlers
│   │   │   ├── accounts.rs     # Account listing commands
│   │   │   ├── profiles.rs     # Profile CRUD commands
│   │   │   ├── settings.rs     # Settings commands
│   │   │   ├── sso.rs          # SSO login/status commands
│   │   │   └── tunnels.rs      # SSM port-forwarding commands
│   │   ├── lib.rs              # Tauri app builder, plugin setup
│   │   └── main.rs             # Application entry point
│   ├── icons/                  # Platform icons (png, icns, ico)
│   ├── Cargo.toml              # Rust dependencies
│   └── tauri.conf.json         # Tauri configuration
├── scripts/                    # Utility scripts
│   ├── bump-version.sh         # Semantic-release version bumper
│   └── fix-quarantine.sh       # macOS Gatekeeper workaround
├── docs/                       # Documentation
│   ├── architecture.md         # Architecture overview
│   └── project_notes/          # Project memory (bugs, decisions, facts)
├── .gitlab-ci.yml              # CI/CD pipeline
├── .releaserc                  # Semantic-release configuration
├── Makefile                    # Developer commands
├── package.json                # Frontend dependencies
├── vite.config.ts              # Vite bundler config
└── vitest.config.ts            # Test runner config
```

## Available Commands

| Command | Description |
|---------|-------------|
| `make setup` | Install all dependencies and git hooks |
| `make dev` | Run in development mode with hot reload |
| `make build` | Build production installers |
| `make dist` | Build + ad-hoc sign for macOS distribution |
| `make test` | Run all tests (frontend + Rust) |
| `make test-frontend` | Run frontend tests only |
| `make test-rust` | Run Rust tests only |
| `make lint` | Run all linters (ESLint, Prettier, Clippy, rustfmt) |
| `make fmt` | Run all formatters |
| `make clean` | Remove build artifacts |
| `make help` | Show available commands |

## Configuration

Copy `.env.example` to `.env` and adjust as needed.

| Variable | Description | Default |
|----------|-------------|---------|
| `RUST_LOG` | Rust log level (`trace`, `debug`, `info`, `warn`, `error`) | `info` |

## CI/CD

GitLab CI pipeline runs on every push:

| Stage | Jobs | Description |
|-------|------|-------------|
| **check** | `lint:frontend`, `lint:rust`, `audit:frontend`, `audit:rust` | Linting, formatting, dependency audits |
| **test** | `test:frontend`, `test:rust` | Vitest (frontend) and Cargo test (backend) |
| **build** | `build:tauri` | Tauri build on `main` branch and semver tags |
| **release** | `semantic-release` | Automatic versioning, changelog, and GitLab release |

Releases follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` commits trigger a **minor** version bump
- `fix:` / `perf:` / `refactor:` commits trigger a **patch** bump
- `BREAKING` scope triggers a **major** bump
- `docs:` / `chore:` / `test:` / `ci:` commits do **not** trigger a release

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
