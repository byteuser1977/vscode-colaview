# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-11-05

### Added
- Added **Word (`.docx`) export** — ported from ColaMD-extend's `docx-export.ts`. Exports high-fidelity `.docx` with headings, paragraphs, inline styles (bold/italic/strikethrough/inline-code/links/highlight), code blocks, ordered/unordered/task lists, tables, blockquotes, horizontal rules, local & remote images, footnotes, KaTeX formulas (rasterized to images), and Mermaid diagrams (rasterized to images). New command `colaview.exportWord` ("Export to Word...") in the command palette, editor context menu, explorer context menu, and preview right-click menu.
- Added `src/export/docx-exporter.ts` — pure-Node `markdownToDocx()` using `docx` v9 + `unified`/`remark-parse`/`remark-gfm`, with a pure-JS image dimension sniffer (`sniffImage`) in place of Electron's `nativeImage`.
- Added `src/export/render-export-images.ts` — headless-Chrome (puppeteer-core) rasterizes KaTeX and Mermaid to PNG, rewriting the source Markdown to image placeholders.
- Added direct dependencies: `docx`, `katex`, `remark-parse`, `remark-gfm`, `unified`.
- Added **9 new built-in themes**: Sepia, Notion, Bear, Writer, Solarized Dark, Nord, Gruvbox, Dracula, Midnight — expanding from 4 to 12 total built-in themes
- Added local **TypeScript type declarations** (`src/types/colamd-renderer.d.ts`) for `@bytechain.cn/colamd@2.7.9`, since the npm package does not publish `.d.ts` files

### Changed
- **Engine upgrade: ColaMD 2.7.9** — Migrated from Milkdown/ProseMirror to **CodeMirror 6** rendering engine. Source buffer is now the single source of truth with zero serialization loss on export.
- **Async HTML export** — `buildExportHTML()` is now asynchronous. The WebView automatically waits for Mermaid diagrams and KaTeX fonts to finish rendering before producing the final standalone HTML.
- **12 built-in themes** total, up from 4. Default theme changed from `"light"` to `"elegant"`.
- **DOM structure changed** — Preview container uses `.cm-editor` / `.cm-scroller` / `.cm-content` (CM6) instead of `.ProseMirror`. Scroll sync target updated to `.cm-scroller`.
- **CSP relaxed** — `style-src 'unsafe-inline'` and `script-src 'unsafe-inline'` are now required (CodeMirror 6 dynamic styles + esbuild IIFE bundle). Nonce-based CSP removed.
- **Build system** — The WebView bundle now includes the full ColaMD 2.7.9 rendering engine (CM6 + Mermaid + KaTeX). WebView bundle size increased from ~50KB to ~3.4MB unminified (gzip ~400KB). Extension side remains small (~30KB).

### Removed
- **Removed Newsprint theme** — Not available in ColaMD 2.7.9. Users who had `colaview.theme: "newsprint"` will fall back to the default ("elegant").
- **Removed runtime plugin toggle** — `colaview.plugins.math` and `colaview.plugins.mermaid` settings are retained for backward compatibility but no longer have any effect, since math and Mermaid are integral parts of the ColaMD 2.7.9 engine.
- **Removed local `colamd-renderer.js` copy** — The WebView now imports ColaMD directly from the npm package via esbuild bundling.

### Fixed
- Fixed **PDF export rendering a blank page** — stripped the `@media print { ... #editor-region { display: none } }` rule (Electron desktop print rule) from the inlined `colamd.css` during WebView HTML construction, preventing the exported `<article>` from being hidden.
- Fixed scroll sync listening to wrong DOM node — CM6 uses `.cm-scroller` for scrolling instead of the container `#editor` element

### Files Changed
- `package.json` — Bump `@bytechain.cn/colamd` from `^1.5.2` to `^2.7.9`, update theme enum, change default theme; add `docx`, `katex`, `remark-parse`, `remark-gfm`, `unified`
- `src/export/docx-exporter.ts` — New Word export converter
- `src/export/render-export-images.ts` — New KaTeX/Mermaid → PNG renderer for Word export
- `src/preview/preview-manager.ts` — Strip Electron print rule from inlined CSS, add Word export message handler
- `src/types/colamd-renderer.d.ts` — New local type declarations
- `src/themes/theme-manager.ts` — Expand `BUILTIN_THEMES` to 12, update `THEME_CLASS_MAP`
- `src/themes/built-in/*.css` — 9 new theme CSS files
- `src/preview/webview/app.ts` — Complete rewrite for CM6 API
- `src/preview/webview/index.html` — CM6 DOM styles, hide cursor/selection, default white-space:pre-wrap
- `src/preview/preview-manager.ts` — Fix scrollSync message type
- `src/preview/webview/colamd-renderer.js` — Deleted (old Milkdown renderer copy)

---

## [0.2.0] - 2025-05-30

### Added
- Added **right-click context menu** in the preview WebView: export HTML/PDF, switch theme (with submenu), import custom theme — all accessible directly within the preview panel
- Added **Academic Paper** custom theme (`.themes/academic-paper.css`) — follows GB/T 7713 Chinese academic paper typesetting standards: serif body, sans-serif headings, three-line table, pure black-on-white print layout
- Added **Trae Blue** custom theme (`.themes/trae-blue.css`) — Trae IDE documentation style: white background with Slate grayscale text, system sans-serif fonts, blue accent (#3b82f6)
- Added **read-only mode styling** for ProseMirror editor: hides cursor and disables selection highlights in preview mode

### Changed
- **Restructured extension activation**: error-isolated initialization with independent try/catch blocks for ThemeManager, PreviewManager, and command registration — a failure in one component no longer blocks the others
- **Refactored PreviewManager**: split monolithic `setupEventListeners()` into dedicated methods: `registerActiveEditorListener()`, `registerScrollSyncListeners()`, `registerConfigurationListener()`
- **Runtime plugin toggle sync**: `colaview.plugins.math` and `colaview.plugins.mermaid` setting changes are now automatically synced to the preview WebView via `onDidChangeConfiguration`, no reload required
- Improved scroll sync error resilience: errors in scroll sync handlers are now silently ignored to prevent cascading failures

### Removed
- Removed obsolete `debug-load.js` development helper
- Removed unused `src/config/configuration.ts` module
- Removed unused `src/utils/file-utils.ts` module
- Cleaned up unused scroll sync message fields (`scrollTop`, `scrollHeight`, `clientHeight`, `scrollPercent`) from shared types

### Fixed
- Fixed h4 heading color inconsistency in exports
- Fixed code block border color mismatch after theme changes
- Fixed print margin width issue (reduced from 60px to 28px)

## [0.1.3] - 2025-05-29

### Added
- Added **experimental** scroll sync feature between editor and preview panel
- Added `colaview.scrollSync` configuration option (**experimental**) to enable/disable scroll synchronization
- Implemented bidirectional scroll tracking: editor cursor position syncs to preview and vice versa
- Added `topRatio` calculation for precise scroll positioning based on visible editor area

### Improved
- Enhanced error handling in extension activation and preview manager initialization
- Enhanced scroll sync algorithm using relative position mapping instead of simple percentage
- Added debouncing to scroll events to prevent performance issues
- Added circular reference prevention to avoid infinite scroll loops
- Optimized scroll position calculation to handle content wrapping and screen width variations

### Fixed
- Fixed list indentation and symbol alignment issues in HTML/PDF exports

## [0.1.2] - 2025-05-28

### Fixed
- Fixed blockquote background color being overwritten by page background in dark/light/newsprint themes

## [0.1.1] - 2025-05-27

### Added
- Initial release with Markdown preview and PDF/HTML export support
- 4 built-in themes: Light, Dark, Elegant, Newsprint
- Custom theme support via `.themes/` directory
- KaTeX math formula rendering
- Mermaid diagram rendering (17+ chart types)
- Plugin toggle for math/mermaid via settings

### Changed
- Switched from local ColaMD project reference to npm package `@bytechain.cn/colamd` (^1.5.2)
- Unified `--code-color` and `--code-block-text` CSS variables across all 4 built-in themes
- Aligned Newsprint theme with ColaMD-extend base.css (PT Serif font stack, code color inheritance)
- Added missing `--table-border` variable to Light theme
