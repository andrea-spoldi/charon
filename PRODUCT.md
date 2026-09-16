# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers and operators at any organization using AWS Identity Center (AWS SSO) who need to work across multiple AWS accounts. General-purpose, openly distributed desktop tool — not scoped to one internal team.

## Product Purpose

Charon is a desktop app that manages connections to multiple AWS accounts through AWS Identity Center. It brokers short-lived STS credentials per SSO profile and manages SSM port-forwarding tunnels, so a user can switch accounts and open tunnels without hand-editing `~/.aws/config` or running raw AWS CLI commands.

## Positioning

Most alternatives in this space (aws-vault, leapp, granted, saml2aws) only broker credentials. Charon unifies two things in one app: AWS account/profile credential management *and* SSM port-forwarding tunnel management, with a GUI-visible session lifecycle instead of terminal-only state.

## Operating Context

- SSO login runs via the AWS CLI (`aws sso login`) against a configured SSO session/start URL.
- Profiles are Charon-managed (CRUD in-app) and decoupled from `~/.aws/config` (ADR-007); starting a profile is an explicit Play action that writes temporary STS credentials to `~/.aws/credentials`, stopping removes them (Leapp-inspired lifecycle).
- Users track active sessions, SSO token status, and running SSM tunnels from dedicated pages (Accounts, Profiles, Sessions, Tunnels, Settings).
- Requires locally installed AWS CLI v2 (SSO login/credentials) and the Session Manager plugin (SSM tunnels) as external prerequisites.

## Capabilities and Constraints

- Config lives under `~/.charon/` (`settings.json`, `profiles.json`, `tunnels.json`), separate from AWS's own config files.
- Credentials are always short-lived STS tokens; nothing long-lived is persisted by design.
- Cross-platform Tauri 2 desktop shell (React 19/TS webview); current packaged/signed distribution is macOS-focused, but no platform-specific UI is planned — see Platform decision below.
- Two distinct regions matter operationally: the SSO endpoint region and the working/console region — these are not interchangeable in the UI.

## Brand Commitments

Name "Charon" (mythological ferryman) — reflects the product's core mechanism of ferrying the user across account/session boundaries. No other visual or verbal identity confirmed yet.

## Evidence on Hand

None. No testimonials, case studies, adoption numbers, or user quotes exist yet — future work must not invent any.

## Product Principles

1. **Visibility over hidden state** — credential, session, and tunnel status must always be visible in the UI, never silently expired or ambiguous.
2. **Explicit lifecycle control** — starting and stopping access (Play/Stop) is a deliberate user action, never implicit or automatic.
3. **No long-lived secrets** — credentials are ephemeral STS tokens, never persisted past the session.
4. **One tool, not two** — unifying account/credential management with SSM tunnel management removes the need for a second CLI tool.
5. **Zero manual CLI config** — the GUI should remove the need to hand-edit AWS config/profile files.

## Platform Decision

Design language is treated as **web** — one consistent look across macOS/Windows/Linux, built with standard web UI patterns matching the current React/CSS implementation, rather than per-OS native chrome.
