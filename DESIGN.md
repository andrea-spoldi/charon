---
name: Charon
description: A dense, dark, IDE-inspired console for ferrying credentials across AWS accounts
colors:
  void: "#1e1e1e"
  panel: "#252526"
  raised: "#2d2d2d"
  hover-surface: "#333333"
  active-surface: "#3c3c3c"
  seam: "#3c3c3c"
  seam-light: "#4a4a4a"
  text: "#cccccc"
  text-bright: "#e8e8e8"
  text-muted: "#808080"
  text-muted-onprose: "#949494"
  editor-blue: "#007acc"
  editor-blue-hover: "#1a8ad4"
  editor-blue-active: "#0065a9"
  editor-blue-onprose: "#3794ff"
  success: "#4ec9b0"
  warning: "#dcdcaa"
  danger: "#f14c4c"
  danger-onprose: "#f36262"
  on-accent: "#ffffff"
typography:
  display:
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace"
    fontSize: "2.154rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "3px"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif"
    fontSize: "1.385rem"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif"
    fontSize: "1.154rem"
    fontWeight: 600
    letterSpacing: "-0.3px"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif"
    fontSize: "0.846rem"
    fontWeight: 600
    letterSpacing: "0.5px"
  mono:
    fontFamily: "'SF Mono', 'Fira Code', monospace"
    fontSize: "0.923rem"
    fontWeight: 400
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif"
    fontSize: "0.769rem"
    fontWeight: 500
  density-compact:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif"
    fontSize: "10px"
    fontWeight: 600
  density-default:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  density-comfortable:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif"
    fontSize: "16px"
    fontWeight: 600
rounded:
  xs: "2px"
  sm: "4px"
  lg: "6px"
  pill: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.editor-blue}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  button-primary-hover:
    backgroundColor: "{colors.editor-blue-hover}"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text-bright}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  badge-status:
    backgroundColor: "transparent"
    textColor: "{colors.success}"
    rounded: "{rounded.pill}"
    padding: "2px 7px"
---

# Design System: Charon

## Overview

**Creative North Star: "The Operator's Console"**

Charon's own stylesheet names its lineage in a comment: an OpenLens-inspired dark theme. That inheritance runs deeper than the label — the exact hex values for background, accent, and status colors are VS Code Dark+'s own palette. This is not accidental resemblance; it's a deliberate signal to the people who'll use it that this is a tool built by and for engineers who live in an editor and a terminal all day, not a consumer app borrowing dark mode as decoration.

The console is dense by design: a fixed three-region shell (48px top bar, 200px sidebar, 24px status bar) frames a scrollable content area, and nothing in it is built to be spacious. Rows, cards, and badges pack tightly so a screen can hold many accounts, roles, profiles, or tunnels at once. Depth is never faked with shadows — it's built from a strict ladder of background tones, the same technique an editor uses to distinguish gutter from pane from panel. Color is almost entirely absent except where it does real work: one blue for the single primary action per view, and a fixed small set of status colors (teal/amber/red) that mean the same thing everywhere they appear.

**Key Characteristics:**
- Fixed dark theme, VS Code Dark+ derived — no light mode exists.
- Base type size is 13px, smaller than typical web defaults, in service of density.
- Depth via background-tone layering, not shadows.
- One accent color, used sparingly, for the one primary action or piece of live state per context.
- Monospace reserved strictly for literal AWS/system data (account IDs, role names, device codes) that users read exactly or copy.

## Colors

The palette is a fixed dark theme inherited directly from VS Code Dark+ (via OpenLens), not a generated Material-style scale — there is no light variant and no theming layer.

### Primary
- **Editor Blue** (`#007acc`): the one accent color in the system. Used for fills, borders, and icons — the single primary button per view, active nav indicator, focused input border, and any inline element representing "the current live thing."
- **Editor Blue Hover** (`#1a8ad4`): hover state for Editor Blue surfaces.
- **Editor Blue Active** (`#0065a9`): pressed/active state for Editor Blue surfaces.
- **Editor Blue (on prose)** (`#3794ff`): the text/link-safe variant — VS Code Dark+'s own `textLink.foreground`, so it stays in the same source palette rather than an invented tint. Editor Blue itself measures only ~3.4–3.7:1 as running text against Void/Panel, short of WCAG AA's 4.5:1 for normal text; this variant clears 4.5:1 on both. Use it for the top-bar session badge, the device-authorization link, and any anchor text — never for fills or borders, which keep the base Editor Blue.

### Neutral
- **Void** (`#1e1e1e`): base app background — the deepest, least prominent surface.
- **Panel** (`#252526`): first layer up — top bar, sidebar, status bar, and card backgrounds (account/profile/tunnel/config cards).
- **Raised** (`#2d2d2d`): second layer up — nested surfaces sitting on a Panel (inputs, role rows on hover, tooltips).
- **Hover Surface** (`#333333`): interactive hover state for rows, buttons, and list items.
- **Active Surface** (`#3c3c3c`): pressed/selected state, e.g. the active sidebar item's background.
- **Seam** (`#3c3c3c`): the default 1px border/divider color used almost everywhere a surface needs an edge.
- **Seam Light** (`#4a4a4a`): a slightly brighter border for surfaces that need to read as more interactive (buttons, focused-adjacent inputs, code containers).
- **Console Text** (`#cccccc`): default body text color.
- **Bright Text** (`#e8e8e8`): emphasized text — headings, names, primary labels (account name, profile name, card titles).
- **Muted Text** (`#808080`): icon glyphs and decorative fills only (default icon-button color, chevrons, dot fills) — never running text. At ~3.9–4.2:1 against Void/Panel it clears the 3:1 a graphical object needs, but falls short of the 4.5:1 normal text requires.
- **Muted Text (on prose)** (`#949494`): the text-safe variant of Muted Text — hints, timestamps, secondary metadata, section labels, placeholders, empty/loading states. Clears 4.5:1 against Void, Panel, and Raised alike.

### Status
- **Success Teal** (`#4ec9b0`): active/connected/default-profile state, active-tunnel dot, valid SSO token badge.
- **Warning Amber** (`#dcdcaa`): connecting/in-progress state, warning banners.
- **Danger Red** (`#f14c4c`): errors, destructive actions, expired-token badges, disconnected/error tunnel state — icons and fills only.
- **Danger Red (on prose)** (`#f36262`): the text-safe variant for error copy (form/tunnel/status-bar error text, expired-token badge label) — the base Danger Red measures ~4.3:1 on Panel, short of AA; this variant clears 4.5:1+ on both Void and Panel.
- **On Accent** (`#ffffff`): the only color ever placed on top of a filled Editor Blue or Danger Red surface — primary and danger button labels. Never used as a standalone text color on Void, Panel, or Raised.

### Named Rules
**The One Accent Rule.** Editor Blue appears on at most one control per view as a filled background — everything else that needs emphasis uses Bright Text or a status color instead. A screen with two blue-filled buttons is a mistake, not a stronger call to action.

**The Status Trio Rule.** Success/Warning/Danger are the only three semantic colors in the system, and their meaning never changes: teal is always "good/active", amber is always "in progress/caution", red is always "bad/error/destructive." Never introduce a fourth semantic hue.

**The Icon/Prose Split Rule.** Muted Text, Editor Blue, and Danger Red each carry a dedicated "on prose" variant, and the split is load-bearing, not cosmetic: WCAG AA needs only 3:1 for a graphical object (an icon glyph, a status dot) but 4.5:1 for running text, and the base tokens were tuned for the former. Any new text node reaches for the `-onprose` token; icons, dots, fills, and borders keep the base token. Never use an `-onprose` variant as a background, border, or icon color, and never render prose in a base token that has an `-onprose` sibling.

## Typography

**Body/UI Font:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif` (the OS-native system stack — no webfont is loaded).
**Mono Font:** `"SF Mono", "Fira Code", "Cascadia Code", monospace` (reserved for literal system data).

**Character:** A plain, native system sans for everything a human reads as prose or a label, paired with a code-editor monospace for anything a human reads as *data* — account IDs, role names, and device codes render in mono specifically so they look copyable and exact.

### Hierarchy
- **Display** (700, 2.154rem/~28px, line-height 1, letter-spacing 3px, mono): reserved for the one true hero moment — the SSO device-authorization code. Nothing else in the system uses this size.
- **Headline** (600, 1.385rem/~18px): page titles (`.page-header h2`) and the setup/device-auth panel headers.
- **Title** (600, 1.154rem/~15px, letter-spacing -0.3px): the top-bar wordmark only.
- **Body** (400, 1rem = 13px base, line-height 1.5): the default for all running text, list rows, and form values.
- **Label** (600, 0.846rem/~11px, letter-spacing 0.5px, uppercase in practice): section headings (`.section-title`, tunnel section headers) and the SSO token status badge/expiry text — always uppercase with wide tracking when used as a category marker; used at its plain weight for the token badge.
- **Caption** (500, 0.769rem/~10px): the smallest role in the system — the "default profile" badge and the copy-confirmation tooltip. Reserved for micro-labels that annotate another element rather than standing on their own.
- Secondary/meta text sits between Body and Label at 0.846–0.923rem (hints, badges, IDs) without its own named role — treat it as Muted-Text-colored Body.

### Density presets (Font Size Toggle)
The top-bar's S/M/L text-size control is a deliberate exception to the rest of the type scale: its own three button labels are fixed literal pixel values — **Density Compact** (10px), **Density Default** (13px, numerically identical to Body but declared as its own literal step because it belongs to this fixed trio, not the scaling content hierarchy), and **Density Comfortable** (16px) — not `rem`, even though every other role in the system is `rem`-based and scales with the user's chosen density. The rest of the UI legitimately re-bases off whichever density is active; this one control cannot, or its own buttons would resize themselves whenever clicked and stop looking like three distinct, comparable options.

### Named Rules
**The Compact Rule.** The base size is 13px, not the web-typical 16px. Never introduce a component at 16px+ body copy — it will read as foreign against everything around it. The only exception is the Display role.
**The Data-Is-Mono Rule.** Anything a user would copy-paste verbatim (account ID, role name, device code, ARN-like strings) renders in the mono stack. Everything else — including buttons, labels, and status text — stays sans.
**The Fixed-Control Rule.** A control whose job is to set the type scale (the Font Size Toggle) must not itself be styled from that scale — its three preset sizes stay literal `px` so all three stay visually distinct and stable in every density mode. This is the one intentional exception to "everything scales in rem"; it does not extend to any other component.

## Layout

The shell is a fixed CSS grid, not a responsive page: `grid-template-columns: 200px 1fr` and `grid-template-rows: 48px 1fr 24px`, filling `100vh` with no scroll on the outer frame — only the content region (`main`) and the sidebar scroll independently. There are no media queries or breakpoints anywhere in the stylesheet; the app is designed for one fixed desktop window, not for adapting across viewport sizes. That assumption is enforced, not just assumed: the window opens at 1024×768 and is user-resizable, but `src-tauri/tauri.conf.json` pins a `minWidth`/`minHeight` of 900×600 so it can never shrink past the point this fixed layout can absorb.

Content padding inside a page is `20px 24px`. Vertical rhythm is tight and mostly built from a small spacing scale: `4px` (icon/label gaps), `8px` (list-item gaps, standard inline gaps), `12px` (form-field gaps, tunnel-card padding), `16px` (form stacks, section margins, profile-list gaps), `24px` (section spacing, page-header margin), up to `40px` for full-bleed centered panels (setup, device-auth). A faint background illustration (`background.jpg` — Charon's own embroidered ferryman mark, the app's namesake — 6% opacity, centered, 75% scale) sits behind the content region as the only decorative, non-functional visual element in the system.

## Elevation & Depth

Charon is a flat, bordered system — depth is conveyed almost entirely by tonal layering (Void → Panel → Raised → Hover Surface → Active Surface), the same way an editor distinguishes gutter, pane, and side panel, not by drop shadows. Every surface boundary is drawn with a 1px border (Seam or Seam Light) rather than implied by a shadow.

### Shadow Vocabulary
- **Toast overlay** (`box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)`): the single deliberate exception — toast notifications float above the whole app and need a real shadow to read as detached from the page.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest, distinguished only by background tone and a 1px border. A shadow appears only on the one true floating overlay (toasts); introducing shadows on cards, buttons, or hover states breaks the console's visual logic.

## Shapes

Three corner radii cover the whole system: `2px` for the smallest inline controls (the font-size toggle's own buttons, the toast dismiss button), `4px` for ordinary controls (buttons, inputs, icon buttons, the default-profile badge), and `6px` for containers (account/profile/tunnel/config cards, the device-auth panel, toasts, terminal container). Status and progress dots are always perfect circles (`border-radius: 50%`). Pill-shaped badges (SSO token status) use a `10px` radius specifically to read as a capsule, distinct from the rest of the system's boxier language. Borders are the system's primary shape-defining device — almost every surface carries a 1px border in Seam or Seam Light rather than relying on radius or shadow alone to read as a distinct region.

## Components

### Buttons
- **Shape:** 4px radius, 1px border in Seam Light (except filled variants, which border-match their own fill).
- **Primary:** Editor Blue fill, white text, `6px 14px` padding — the one-per-view action.
- **Secondary:** Raised background, Console Text — a lower-emphasis action alongside a primary.
- **Outline:** transparent fill, Seam Light border, Console Text — the default/neutral action.
- **Danger:** Danger Red fill, white text — for confirmed destructive actions only.
- **Small variant:** `3px 10px` padding, 0.846rem text, for inline/dense contexts.
- **Hover/Focus:** background steps up one tone (e.g. transparent → Hover Surface); no shadow or transform, only color transitions at 0.15s.

### Icon Buttons
- **Style:** 28×28px, transparent by default, circular hover feedback via Hover Surface background, Muted Text color at rest.
- **Destructive confirm pattern:** a two-step, no-dialog confirmation. First click turns the icon into `.icon-btn-confirm` — a pulsing Danger-Red-tinted background (`pulse-danger`, 0.6s alternate) — and a second click on that state performs the action. This exists because Tauri's webview does not support `window.confirm()`; it is the system's only destructive-confirmation mechanism.
- **State variants:** loading (0.5 opacity, wait cursor, paired with `.spin`), success/error/active (icon recolors to Success Teal or Danger Red, no background change).

### Cards / Containers
- **Corner Style:** 6px radius.
- **Background:** Panel tone, 1px Seam border.
- **Shadow Strategy:** none — see Elevation & Depth.
- **Status accent:** tunnel cards add a 3px left border in the relevant status color (Success/Warning/Danger) instead of recoloring the whole card — the card body stays neutral even when it represents an error state.
- **Internal Padding:** 10–14px for compact cards, up to 32px for the centered device-auth panel.

### Inputs / Fields
- **Style:** Raised background, Seam Light border, 4px radius, Bright Text value color.
- **Focus:** border color shifts to Editor Blue; no glow or shadow.
- **Disabled:** 0.5 opacity, no other treatment.
- **Error:** border forced to Danger Red (`!important`) with a Danger Red helper line below the field.

### Navigation (Sidebar)
- **Style:** Panel background, Muted Text items at rest, Console Text on hover with Hover Surface background.
- **Active state:** Active Surface background, Bright Text, and a 2px Editor Blue left border — the left border is the system's one recurring "you are here" signature, echoed by the tunnel-card status border.
- No mobile treatment exists; the sidebar is a fixed 200px column in a fixed-size desktop window.

### Status Badges & Dots
- **Style:** an 8×8px filled circle (or, for SSO tokens, a pill-shaped bordered badge) always paired with a text label — color alone never carries the status.
- **Palette:** Success Teal / Warning Amber / Danger Red / Muted Text ("none"/inactive"), applied identically whether the badge represents a tunnel, an SSO token, or a session in the status bar.

### Device Code Panel (signature component)
The SSO device-authorization screen is the system's one expressive moment: a centered panel (max-width 420px) presenting the device code at Display scale (28px, 700 weight, mono, 3px letter-spacing, user-selectable) inside a Raised, bordered container — everywhere else in the app stays at Body scale, making this the system's single deliberate visual accent.

### Terminal (self-contained sub-palette)
The Shell page's embedded terminal (xterm.js) is the one place in the app that does *not* draw from the Editor Blue / Success / Warning / Danger palette — and that's correct, not drift. A terminal has to faithfully render arbitrary ANSI color codes from whatever CLI runs inside it (`ls`, `git diff`, a colored logger), which needs a full 16-color table, not a 3-color status trio. It uses a complete, named **Tokyo Night** palette (`background #1a1b26`, `foreground #c0caf5`, full 8+8 ANSI/bright set) and its own monospace stack (`'JetBrains Mono', 'Fira Code', 'Cascadia Code'`, distinct from the system's `'SF Mono'`-first mono stack) at a fixed 13px, set directly in xterm's JS theme object since it can't consume CSS custom properties. Full palette recorded in the `.impeccable/design.json` sidecar under `extensions.terminalPalette`. Never pull the app's Editor Blue/status colors into the terminal theme, and never let the terminal's Tokyo Night colors leak into the app chrome.

## Do's and Don'ts

### Do:
- **Do** convey depth with the Void → Panel → Raised → Hover Surface → Active Surface tone ladder, never with a drop shadow (the toast is the sole exception).
- **Do** pair every status dot or colored border with a text label; color alone is never the only signal.
- **Do** render literal AWS/system data (account IDs, role names, device codes) in the mono stack; keep everything else in the system sans stack.
- **Do** use the two-click pulsing `.icon-btn-confirm` pattern for any destructive action that needs confirmation.
- **Do** keep exactly one Editor-Blue-filled control per view for the primary action.
- **Do** use the `-onprose` variant (Muted Text on prose / Editor Blue on prose / Danger Red on prose) for any actual text node; reserve the base token for icons, dots, fills, and borders.
- **Do** size ordinary content in `rem` so it scales with the Font Size Toggle; the toggle's own three preset buttons are the sole, deliberate exception.

### Don't:
- **Don't** call `window.confirm()`, `alert()`, or `prompt()` — Tauri 2's webview does not support them.
- **Don't** pull the app's Editor Blue / status palette into the terminal's xterm theme, or the terminal's Tokyo Night colors into the app chrome — they're deliberately separate systems for a deliberate technical reason (a terminal must render arbitrary ANSI codes faithfully).
- **Don't** render running text in base Muted Text, base Editor Blue, or base Danger Red — none of the three clears 4.5:1 for normal text against Void or Panel; use their `-onprose` variant instead.
- **Don't** add box-shadows to cards, buttons, or hover states — this is a flat, bordered system.
- **Don't** introduce a body text size above 13px (1rem) outside the Display role, or drop below the system's small-label sizes — the scale is deliberately narrow and dense.
- **Don't** add responsive breakpoints or fluid layouts — the shell assumes one fixed desktop window (200px sidebar / 48px top bar / 24px status bar) and has never needed to adapt. The 900×600 `minWidth`/`minHeight` in `tauri.conf.json` is the floor this layout was built for; don't lower it without re-checking every page at that size first.
- **Don't** introduce a fourth semantic status color beyond Success Teal / Warning Amber / Danger Red.
