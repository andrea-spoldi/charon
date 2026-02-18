# Contributing to Charon

## Development Setup

1. Install prerequisites (see [README.md](README.md#prerequisites))
2. Run `make setup` to install dependencies and git hooks
3. Run `make dev` to start the development server

## Branch Naming

We use trunk-based development:

- `main` is the primary branch
- Feature branches: `feat/short-description`
- Bug fixes: `fix/short-description`
- Chores: `chore/short-description`

Keep branches short-lived (< 2 days ideally).

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add AWS account selector
fix: resolve SSO token refresh issue
chore: update Tauri to v2.1
docs: add architecture decision record
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes and ensure `make lint` and `make test` pass
3. Push and open a merge request
4. Ensure CI passes
5. Get at least one approval
6. Squash merge into `main`

## Code Review

- Review for correctness, readability, and security
- Rust code should pass `clippy` with no warnings
- Frontend code should pass ESLint and Prettier checks
- All new Tauri commands should have tests
