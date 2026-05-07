## [0.14.0](https://github.com/andrea-spoldi/charon/compare/v0.13.0...v0.14.0) (2026-05-07)

### 🚀 Features

* replace TopBar login/logout with per-session actions in SessionsPage ([c158fdb](https://github.com/andrea-spoldi/charon/commit/c158fdbe8620aff4de781ae67ca701aa5d4547e9))

### 🐛 Bug Fixes

* Update Node.js version in semantic-release workflow ([11b1848](https://github.com/andrea-spoldi/charon/commit/11b1848061c97ebf27b2047289069b315e7d38f8))

### ♻️ Code Refactoring

* toggle login/logout icon on single button per session card ([6d93c99](https://github.com/andrea-spoldi/charon/commit/6d93c99e28cfca8944a03d1fe4e943c78cc72c6e))

## [0.11.0](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/compare/v0.10.0...v0.11.0) (2026-03-26)

### 🚀 Features

* credential model rework — Leapp-inspired session start/stop ([90e3c87](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/90e3c874576ab57e735dd7fcfb953378525c09df))
* credential model rework — Leapp-inspired session start/stop ([b109fa1](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/b109fa10b2f4a97b1c3a0026caff3b07943c4ba6))
* embedded SSM shell sessions with xterm.js + portable-pty ([61c9b37](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/61c9b37394b13f064abe3165495bd1d1cc08b3bb))

### 🐛 Bug Fixes

* add manual profile refresh to Tunnels and Shell pages ([a0d68ba](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/a0d68bab33a3365c0cca0538628598dad007e85f))
* add Tauri event permissions and align Shell page with Tunnels style ([16b33db](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/16b33db3c1fe80c981a99af870f81562ef8d11e1))
* mirror credentials to [default] section for bare aws CLI usage ([7a2198b](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/7a2198b53e044e689f0ae7b11b0184fac6045aca))
* only remove [default] credentials when stopping the default profile ([c6d000d](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/c6d000d25851dc239a9fcc1cf5be93b2e167c3e4))
* remove empty-state message from Shell page ([b51d229](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/b51d2295882fb99b8797b274d23b70258c9668a7))
* replace stale onRefresh references with local refresh in ProfilesPage ([a589416](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/a589416fcf5630158546c332e1c7c6ecf0ebee80))
* share single profiles state across all pages ([749a053](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/749a05326684cb5900512fb6621bb7f78f7f76a0))

## [0.10.0](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/compare/v0.9.0...v0.10.0) (2026-03-25)

### 🚀 Features

* embedded SSM shell sessions with xterm.js + portable-pty ([d80357d](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/d80357d2f8be9e3bdef7b87730a5b63dccf8fbeb))

### 🐛 Bug Fixes

* add manual profile refresh to Tunnels and Shell pages ([5467650](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/5467650cd72c5198e1230406feac55fc2c05b618))
* add Tauri event permissions and align Shell page with Tunnels style ([d713fc0](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/d713fc06966c5fcc26e1a3fe219a6be8e2f072e6))
* remove empty-state message from Shell page ([3bddd9b](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/3bddd9b98fac65cb765dccabb32cb355816885ee))
* share single profiles state across all pages ([0eff702](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/0eff702e02debc22d212d3830676ad637913634d))
* sync Cargo.toml version to 0.9.0 and fix bump script for macOS ([ff7c896](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/ff7c8968375f5c035e1645513ea1b928c63c82d1))

## [0.9.0](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/compare/v0.8.1...v0.9.0) (2026-03-25)

### 🚀 Features

* show default profile credential expiration in status bar ([0a5e195](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/0a5e19556f191ad1173e03e0f290a7e9baf1140e))

## [0.8.1](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/compare/v0.8.0...v0.8.1) (2026-03-25)

### 🐛 Bug Fixes

* show saved tunnels and new form even when SSO is expired ([4d8fafd](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/4d8fafdb474e845917a6f2ee9cbe10afad1414c8))

## [0.8.0](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/compare/v0.7.1...v0.8.0) (2026-03-13)

### 🚀 Features

* tunnel edit, profile selection, and profile copy icon ([54ab445](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/54ab4455f74bc047948840ce62947eb606fbd370))

## [0.7.1](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/compare/v0.7.0...v0.7.1) (2026-03-13)

### 🐛 Bug Fixes

* remote port not fully mirrored to local port field ([042f4ad](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/042f4adacf2479c1a5e509d57c2e546173dec409))

## [0.7.0](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/compare/v0.6.0...v0.7.0) (2026-03-13)

### 🚀 Features

* show instance name, ID, and IP in tunnel instance browser ([98a6dfa](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/98a6dfa322928c498508c331dd1612dd3df0c4c0))

## [0.6.0](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/compare/v0.5.0...v0.6.0) (2026-03-13)

### 🚀 Features

* move config to ~/.charon and add file-based logging ([07c97ed](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/07c97edde742535f96a497f4e7290b479cd18137))

### 🐛 Bug Fixes

* enrich PATH for spawned SSM tunnel process in .app bundle ([756495c](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/756495ca021aa0006ef065c3540ab7930523c3c4))

## [0.5.0](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/compare/v0.4.0...v0.5.0) (2026-03-12)

### 🚀 Features

* add SSM port-forwarding tunnels ([a4402b3](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/a4402b35e8ec3ae33331d72e772e7909d0523a06))

### 🐛 Bug Fixes

* kill entire process group on tunnel disconnect ([fddf8a7](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/fddf8a761d1897d8e028cd8e3a954d368e6beaf8))

### ♻️ Code Refactoring

* collapsible tunnel creation form with config-first layout ([70501e1](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/70501e1f6c54dc17ff47b3f83ee9efb800c23510))
* on-demand instance browsing instead of auto-fetch ([64eb833](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/64eb8337d70d0d6bbebe9cd691d901569c7b053d))
* use default profile for tunnels instead of account/role lists ([3b4ec99](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/3b4ec9999ffdf5119eeb8af6e8c2b39b027313c5))

## [0.4.0](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/compare/v0.3.7...v0.4.0) (2026-03-10)

### 🚀 Features

* seamless AWS Console account switching via OAuth logout redirect ([9bee373](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/9bee3737ad0c3d8acc9cd854cadd320d3c5358f1))

## [0.3.7](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/compare/v0.3.6...v0.3.7) (2026-03-04)

### 🐛 Bug Fixes

* **ci:** use v-prefixed tags and skip redundant release pipelines ([bbb6b68](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/bbb6b68aa4c5f61630a69f87ab29f19f90d2c56f))
* update script shebang and command for version bump ([8e536b2](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/8e536b23b1b72721f3a377a185daeb8e30ccf829))

## [0.3.7](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/compare/v0.3.6...0.3.7) (2026-03-03)

### 🐛 Bug Fixes

* update script shebang and command for version bump ([8e536b2](https://gitlab.com/docebo/application-platform-team/internal-utilities/charon/commit/8e536b23b1b72721f3a377a185daeb8e30ccf829))
