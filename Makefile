.PHONY: setup build dist test lint fmt run clean

## setup: Install all dependencies
setup:
	corepack enable
	pnpm install
	cd src-tauri && cargo fetch
	pre-commit install

## build: Build the Tauri application
build:
	pnpm tauri build

## dist: Build + ad-hoc sign for internal distribution (macOS)
dist: build
	@echo "🔏 Ad-hoc signing Charon.app..."
	codesign --force --deep -s - src-tauri/target/release/bundle/macos/Charon.app
	@echo "✅ Build complete. DMG at: src-tauri/target/release/bundle/dmg/"
	@echo ""
	@echo "⚠️  Recipients must run after install:"
	@echo "   xattr -cr /Applications/Charon.app"
	@echo ""
	@echo "   Or use: scripts/fix-quarantine.sh (included in repo)"

## dev: Run in development mode with hot reload
dev:
	pnpm tauri dev

## test: Run all tests (frontend + Rust)
test:
	pnpm test
	cd src-tauri && cargo test

## test-frontend: Run frontend tests only
test-frontend:
	pnpm test

## test-rust: Run Rust tests only
test-rust:
	cd src-tauri && cargo test

## lint: Run all linters
lint:
	pnpm lint
	pnpm format:check
	cd src-tauri && cargo fmt -- --check
	cd src-tauri && cargo clippy -- -D warnings

## fmt: Run all formatters
fmt:
	pnpm format
	pnpm lint:fix
	cd src-tauri && cargo fmt

## clean: Remove build artifacts
clean:
	rm -rf dist/
	rm -rf node_modules/
	cd src-tauri && cargo clean

## help: Show this help
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## //' | column -t -s ':'
