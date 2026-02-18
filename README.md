# Charon

Desktop application for managing connections to multiple AWS accounts via AWS Identity Center.

Built with [Tauri 2](https://v2.tauri.app/) (Rust backend + React/TypeScript frontend).

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) >= 1.77
- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) (enabled via `corepack enable`)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS
- [pre-commit](https://pre-commit.com/) (optional, for git hooks)

## Getting Started

```bash
# Install dependencies
make setup

# Run in development mode (hot reload)
make dev

# Run tests
make test

# Build for production
make build
```

## Project Structure

```
charon/
├── src/                    # React/TypeScript frontend
│   ├── App.tsx             # Main application component
│   ├── App.test.tsx        # Frontend tests
│   ├── main.tsx            # React entry point
│   └── styles.css          # Global styles
├── src-tauri/              # Rust/Tauri backend
│   ├── src/
│   │   ├── main.rs         # Application entry point
│   │   ├── lib.rs          # Tauri app builder and plugin setup
│   │   └── commands.rs     # Tauri IPC command handlers
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
├── docs/                   # Documentation
│   └── architecture.md     # Architecture overview
├── .gitlab-ci.yml          # CI/CD pipeline
├── Makefile                # Developer commands
├── package.json            # Frontend dependencies
├── vite.config.ts          # Vite bundler config
└── vitest.config.ts        # Test runner config
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `RUST_LOG` | Rust log level (`trace`, `debug`, `info`, `warn`, `error`) | `info` |

Copy `.env.example` to `.env` and adjust as needed.

## CI/CD

GitLab CI pipeline runs on every push:

- **check**: ESLint, Prettier, Clippy, rustfmt, dependency audit
- **test**: Vitest (frontend), Cargo test (Rust)
- **build**: Tauri cross-platform build (on main branch and tags)
- **release**: Publish installers on semver tags (`v*.*.*`)

## Available Commands

| Command | Description |
|---------|-------------|
| `make setup` | Install all dependencies and git hooks |
| `make dev` | Run in development mode with hot reload |
| `make build` | Build production installers |
| `make test` | Run all tests |
| `make lint` | Run all linters |
| `make fmt` | Run all formatters |
| `make clean` | Remove build artifacts |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
