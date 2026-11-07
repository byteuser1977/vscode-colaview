# Release Notes

## v0.3.1 (2026-11-07)

### 🔧 Engine Upgrade — ColaMD 2.7.11

`@bytechain.cn/colamd` bumped from 2.7.9 to 2.7.11, bringing upstream fixes: inline math inside table cells rendered as formulas, list indent handled purely by CSS, cursor alignment with multi-digit ordered lists, block-level widget layout (diagram height re-measured after async render), and Enter/Backspace restored to official CodeMirror commands.

### 🐛 Windows Word Code Blocks Fixed (ColaMD-extend #202)

Three Windows-only symptoms, one module:

1. **Garbled code** — the mono font was written into all four `w:rFonts` slots; a macOS-only font made Word substitute the whole run with symbol glyphs. Now uses a platform mono font (Menlo / Consolas / DejaVu Sans Mono) plus a dedicated CJK `eastAsia` font so Chinese comments render properly.
2. **Explicit left alignment** — code paragraphs inherited justified alignment, stretching every line to full width. Now explicitly left-aligned, single line spacing, with a light border and shading.
3. **No spell-check squiggles** — `noProof` added to inline code and code block runs.

### 🎨 Word Mermaid Diagrams Follow the Preview Theme

Exported diagrams were hardcoded to mermaid's `neutral` theme. Diagram colors are now derived from the current theme's tokens — surface/border mixes at 18% / 28% / 45%, the same ratios the editor uses — with dark themes falling back to the light palette (same rule as body text).

### 🐛 Inline Formulas No Longer Wrap in Word

The rasterization viewport was widened to 2000px before measuring, so slightly-wide formulas are no longer line-wrapped by KaTeX inside the capture (port of ColaMD-extend's `MEASURE_WIDTH` fix).

### 🐛 HTML/PDF Diagrams Follow Theme + No Zoom Controls

- Export CSS now matches the serialized `<div><svg class="pele pele-…">` wrappers to restore the `--pele-*` variable mapping, so diagrams keep the theme's colors (port of ColaMD-extend a25b3f8).
- The editor-only diagram zoom controls (`.pele-zoom`) are hidden in exports — Chromium print doesn't run scripts, so pele never gets the chance to remove them and they overlapped diagrams in PDFs (port of `print-layout.ts`).

---

## v0.3.0 (2026-11-06)

### 🎨 Theme-Faithful Export

Exports now inherit the current preview theme's visual styling. Previously, theme CSS targeted editor-only DOM selectors (`#editor .cm-content .cm-md-*`), which could not match the semantic HTML (`<h1>`, `<strong>`, `<code>`, `<table>`, `<blockquote>`...) produced by PDF/HTML/Word export — causing fonts, accent colors, table header styling and blockquote padding to fall back to defaults.

The new `src/export/theme-style.ts` conversion layer fixes this by:

- Mapping `.cm-md-*` decoration classes to semantic HTML tags (e.g. `.cm-md-strong` → `strong`, `.cm-md-inlinecode` → `code`, `.cm-md-atxheading1` → `h1`)
- Extracting `:root` CSS variables and `.cm-content` font family / line-height tokens from the theme
- Injecting the converted styles into PDF, HTML and Word exports so the output faithfully reflects the active preview theme

### 📝 Word Export — `.docx`

Reference implementation ported from [ColaMD-extend](https://github.com/byteuser1977/ColaMD-extend)'s `docx-export.ts`. Export any Markdown document to a high-fidelity Word document:

- **Full structure** — headings, paragraphs, blockquotes, horizontal rules
- **Inline styles** — bold, italic, strikethrough, inline code, links, `==highlight==`, footnotes
- **Code blocks** — monospace with shaded background
- **Lists** — ordered (with correct numbering), unordered, and task lists (`☑`/`☐`)
- **Tables** — GFM tables with header shading and column alignment
- **Images** — local, `data:` and remote (`http(s)`) images embedded natively
- **KaTeX formulas** — inline/display math rasterized to images via headless Chrome + KaTeX
- **Mermaid diagrams** — rasterized to images via headless Chrome + Mermaid

The Word export runs entirely in the extension host (`docx` v9 → OOXML), parsing Markdown with `unified`/`remark-parse`/`remark-gfm`. Electron's `nativeImage` has been replaced with a pure-JS image dimension sniffer (`sniffImage`), so no DOM is required.

**Usage** — Command Palette → "ColaView MD: Export to Word...", editor/explorer context menu, or preview right-click menu.

New direct dependencies: `docx`, `katex`, `remark-parse`, `remark-gfm`, `unified`.

### 🐛 PDF Blank Export Fixed

The exported PDF was blank because `colamd.css`'s Electron desktop print rule

```css
@media print {
  body > :not(#editor-region), #editor .code-copy-btn, ... { display: none !important }
}
```

hides the entire exported `<article>` (which lives inside `<body>` without an `#editor-region` wrapper). The rule is now stripped from the inlined CSS at source, so both PDF and HTML export render correctly.

### 🔧 Engine Upgrade — ColaMD 2.7.9 (CodeMirror 6)

This release upgrades the entire rendering engine from Milkdown/ProseMirror to **CodeMirror 6** via `@bytechain.cn/colamd@2.7.9`. This is a major version jump (from `^1.5.2` to `^2.7.9`) with fundamentally different architecture:

**Source Buffer as Single Source of Truth** — Unlike ProseMirror's document model which could silently serialize Markdown back, CodeMirror 6 treats the raw source buffer as the canonical state. Export operations use buffer content directly, guaranteeing zero serialization loss.

**Async Export Pipeline** — `buildExportHTML()` now returns a Promise. Internally it calls `ensureAllPluginsRendered()` first, waiting for Mermaid diagrams and KaTeX fonts to finish before producing the final HTML. The WebView → extension handshake remains identical (message passing), but the WebView side now properly awaits completion.

**New CM6 DOM Structure** — The preview container changed from `.ProseMirror` to `.cm-editor` / `.cm-scroller` / `.cm-content`. Scroll sync had to be retargeted from `#editor` to `.cm-scroller`.

### 🎨 12 Built-in Themes

| Theme | Style |
|-------|-------|
| **Light** | Clean white, blue accents |
| **Dark** | GitHub Dark palette |
| **Elegant** *(new default)* | Warm serif, beige tones |
| **Sepia** | Warm sepia, paper texture |
| **Notion** | Not.so MCP minimalism |
| **Bear** | Bear.app note style |
| **Writer** | Monospace-friendly |
| **Solarized Dark** | Ethan Schoonover palette |
| **Nord** | Arctic blue |
| **Gruvbox** | Retro 80s terminal |
| **Dracula** | Zeno Rocha vibrant dark |
| **Midnight** | Deep navy + gold |

*Newsprint was removed* — it is not part of ColaMD 2.7.9. Users with `colaview.theme: "newsprint"` will get the default ("elegant").

### 🗑️ Plugin Toggle Deprecated

`colaview.plugins.math` and `colaview.plugins.mermaid` are now **no-ops**. Math and Mermaid are integral parts of the CodeMirror 6 engine — they cannot be independently disabled. The settings remain in `package.json` for backward compatibility but have no effect at runtime.

### 📦 Build Size

| | v0.2.0 | v0.3.0 |
|--|-------|-------|
| Extension (`out/extension.js`) | ~28KB | ~30KB |
| WebView (`out/preview/webview/app.js`) | ~50KB | ~3.4MB |
| WebView (gzip) | ~15KB | ~400KB |

The WebView bundle grew significantly because it now includes the full CodeMirror 6 + Mermaid + KaTeX rendering engine inlined via esbuild IIFE. The extension side stays lean.

### ⚠️ Security Model Change

CSP was relaxed from nonce-based to `'unsafe-inline'` for both `style-src` and `script-src`. This is required by CodeMirror 6 (dynamic inline styles) and esbuild IIFE format. Sandbox isolation via `asWebviewUri()` remains intact.

### 📄 KaTeX Fonts

No more font resource path management headaches. KaTeX fonts are base64-encoded inside `colamd.css` — they work in WebView preview, HTML export, and PDF export without any additional configuration.

### Files Changed
10 files changed — 2,438 insertions, 912 deletions

---

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
