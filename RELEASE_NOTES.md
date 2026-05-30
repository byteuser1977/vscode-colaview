# Release Notes

## v0.2.0 (2025-05-30)

### 🏗️ Architecture Overhaul

**Error-Isolated Activation** — Extension `activate()` now uses independent try/catch blocks for ThemeManager, PreviewManager, and command registration. A failure in one component no longer blocks the others, improving extension reliability in edge cases.

**PreviewManager Refactoring** — Split monolithic `setupEventListeners()` into dedicated methods (`registerActiveEditorListener`, `registerScrollSyncListeners`, `registerConfigurationListener`) for better maintainability and separation of concerns.

**Runtime Plugin Toggle Sync** — `colaview.plugins.math` and `colaview.plugins.mermaid` setting changes are now automatically synced to the preview WebView via `onDidChangeConfiguration`. No manual reload required — toggle KaTeX or Mermaid rendering in real-time.

### ✨ New Features

**Right-Click Context Menu** — Native context menu inside the preview WebView panel:
- Export HTML / PDF directly from the preview
- Switch theme via a nested submenu (✓ marks active theme)
- Import custom `.css` theme file
- All commands are now accessible without leaving the preview panel

**New Custom Themes:**
| Theme | File | Style |
|-------|------|-------|
| **Academic Paper** | `.themes/academic-paper.css` | GB/T 7713 standard — serif body, sans-serif headings, three-line tables, pure black-on-white |
| **Trae Blue** | `.themes/trae-blue.css` | Trae IDE documentation style — white + Slate gray, system sans-serif, blue (#3b82f6) accents |

**Read-Only Mode** — Preview ProseMirror editor now explicitly styles as read-only: cursor hidden, selection highlights disabled.

### 🧹 Cleanup

| Removed | Reason |
|---------|--------|
| `debug-load.js` | Obsolete development helper |
| `src/config/configuration.ts` | Unused module |
| `src/utils/file-utils.ts` | Unused module |
| Scroll sync fields (`scrollTop`, `scrollHeight`, `clientHeight`, `scrollPercent`) | Removed unused fields from shared message types |

### 🐛 Fixes
- Fixed h4 heading color inconsistency in exports
- Fixed code block border color mismatch after theme changes  
- Fixed print margin width (reduced from 60px to 28px)

### Files Changed
42 files changed — 208,517 insertions, 208,696 deletions (includes colamd-renderer.js and colamd.css rebuild)

---

## v0.1.3 (2025-05-29)

### 🔄 Experimental Scroll Sync

Bidirectional scroll synchronization between VS Code editor and preview panel. When enabled, moving the cursor in the editor scrolls the preview to the matching position, and scrolling the preview highlights the corresponding editor line.

**Enable:** Set `colaview.scrollSync` to `true` in VS Code settings.

**Algorithm:** Uses relative position mapping (cursor-to-visible-range ratio) rather than simple percentage for more accurate positioning, with debouncing to prevent performance issues and circular reference prevention to avoid infinite scroll loops.

### 🛡️ Error Handling
- Enhanced error handling in extension activation
- Improved resilience in preview manager initialization

### 🐛 Fixes
- Fixed list indentation and symbol alignment in HTML/PDF exports

---

## v0.1.2 (2025-05-28)

### 🐛 Bug Fix

**Blockquote Background Color** — Fixed blockquote background color being overridden by page background (`--bg-color`) in Dark, Light, and Newsprint themes.

#### Root Cause
The base blockquote rule in `colamd.css` did not set a `background` property, causing blockquotes to inherit `body`'s background color. Only the Elegant theme had an explicit override rule, so it was unaffected.

#### Fix
Added explicit `background: var(--blockquote-bg)` rules to all 3 affected built-in theme CSS files:

| Theme | Blockquote Background |
|-------|----------------------|
| **Dark** | `#161b22` (slightly lighter than page `#0d1117`) |
| **Light** | `#ffffff` |
| **Newsprint** | `#eae6de` (slightly darker than page `#f5f2eb`) |

### Files Changed
- `src/themes/built-in/dark.css` — Added blockquote background rule
- `src/themes/built-in/light.css` — Added blockquote background rule
- `src/themes/built-in/newsprint.css` — Added blockquote background rule
- `package.json` / `package-lock.json` — Version bump to 0.1.2

---

## v0.1.1

- **🎨 Theme Consistency Fix** — Unified `--code-color` and `--code-block-text` CSS variables across all 4 built-in themes
- **📰 Newsprint Theme Alignment** — Aligned with ColaMD-extend base.css variables
- **🔧 Light Theme Completion** — Added missing `--table-border` variable
- **📦 Dependency Migration** — Switched to npm package `@bytechain.cn/colamd` (^1.5.2)

## v0.1.0

- Initial release with WYSIWYG preview, PDF/HTML export, 4 built-in themes, custom theme support
