# Changelog

All notable changes to this project will be documented in this file.

## [0.3.2] - 2026-11-07

### Fixed
- Fixed **PDF/HTML export failing with `md is not defined`** — the export CSS injected by `patchExportHTML` lives in a JS template literal, and a CSS comment inside it contained unescaped backticks (`` `.cm-md-mermaid` ``). The first backtick closed the template literal early, so the rest of the comment was parsed as JavaScript (`…template.cm - md - mermaid…`), throwing `ReferenceError: md is not defined` at export time — surfacing to the user as "PDF export failed: md is not defined". The backticks are now escaped, so the comment stays a comment. (Only the packaged/minified build hit it in a confusing way; `tsc` flags it as `Cannot find name 'md'`.)
- Fixed **Mermaid diagrams left-aligned in PDF/HTML exports** — the engine serializes mermaid blocks as class-stripped `<p><svg class="pele pele-…">…</svg></p>`, so the previous export rule (`div:has(> svg.pele)`) never matched and its `text-align: center` never applied: diagrams were centered in the preview but flush-left on paper. Centering now lives on `svg.pele` itself (`display: block; margin: 0 auto`), independent of the wrapper element.
- Fixed **Mermaid diagram background not matching ColaMD-extend** — diagram colors are derived from the theme's code-block background (`--code-block-bg`), and in ColaMD the diagram sits on that block background. ColaView preview and export rendered it on the plain page background instead. Both now paint the same block behind the diagram (code-block background, 6px radius, `0.8em 1em` padding), so Elegant/Bear (light themes with dark code blocks) match ColaMD's dark diagram block.
- Fixed **Mermaid diagram colors drifting from the preview in PDF/HTML exports for non-Elegant themes** — exports re-derived the `--pele-*` tokens on a wrapper selector that never matched the serialized `<p><svg class="pele">` markup, so diagrams fell back to pele's built-in light palette (dark nodes/edges on dark themes, light gray surfaces where the theme wanted the code-block tone). Exports now use the runtime `--pele-*` values that `buildExportHTML` collects from the preview's `.cm-md-mermaid` into `:root`; a token block using the engine's own derivation is injected only when those runtime values are absent (e.g. no rendered mermaid node at export time).
- Fixed **preview blocks vanishing after viewing their source** — the engine (ColaMD 2.7.11) rendered mermaid diagrams and multi-line block math as *inline* replace decorations spanning multiple lines; CodeMirror 6 only honors such decorations on the initial build, so after clicking into a diagram/formula (source revealed) and clicking away, the widget was never recreated and the whole block disappeared. Fixed with `block: true` for whole-line-covering replace decorations (mermaid always, block math when covering full lines). Patched via `patch-package` (`patches/`); the same fix is applied upstream in ColaMD-extend `live-preview.ts`.
- Fixed **Word export producing broken images** — puppeteer v25's `screenshot()` returns a `Uint8Array`; calling `.toString('base64')` on a TypedArray yields a comma-joined decimal byte string instead of base64, so every formula/diagram image embedded in the `.docx` was corrupt and exported as placeholder text. Screenshots are now converted with `Buffer.from()`.
- Fixed **Word-exported formulas rendering with wrong glyphs** — the formula screenshot page inlines `katex.min.css`, but its relative `url(fonts/*.woff2)` references can't resolve on a `page.setContent` (about:blank) page, so KaTeX fell back to system fonts. KaTeX fonts are now inlined as base64 data URIs at render time (and the font files are copied to `out/assets/katex-fonts/` by the build).

### Changed
- **Export HTML/PDF now carries the engine's theme-scoped body rules** — the per-theme accent rules (`body.theme-x .cm-content .cm-md-strong`, inline code colors, heading colors, table header styling...) that live in the engine's `colamd.css` are extracted and translated to semantic selectors (`body.theme-x .colamd-document strong` ...) and injected into exports, so exported documents match the preview and ColaMD-extend rendering for all 12 built-in themes.
- `src/preview/webview/index.html` gives `.cm-md-mermaid` the code-block background in the preview; `src/preview/preview-manager.ts` applies the same block, plus the centering rule, to the serialized mermaid wrapper in HTML/PDF exports, and no longer redeclares `--pele-*` on the exported SVG.

### Removed
- Ineffective settings removed from the extension manifest: `colaview.plugins.math` and `colaview.plugins.mermaid` (no-ops since v0.3.0 — math and Mermaid are built into the engine), `colaview.pdfMethod` and `colaview.customThemesPath` (never read by the extension). The dead `togglePlugin` message plumbing and the no-op `onDidChangeConfiguration` listeners they fed are gone too. Remaining settings: `colaview.theme`, `colaview.autoPreview`, `colaview.scrollSync`.

## [0.3.1] - 2026-11-07

### Changed
- **Engine upgrade: ColaMD 2.7.11** — `@bytechain.cn/colamd` bumped from 2.7.9 to 2.7.11, bringing upstream fixes: inline math rendered as formulas inside table cells, list indent handled purely by CSS (source spaces hidden), cursor misalignment with multi-digit ordered lists, block-level widget layout (no margin placeholders, diagram height re-measured after async render), and Enter/Backspace restored to official CodeMirror commands.

### Fixed
- Fixed **Word-exported code blocks breaking on Windows** — ported ColaMD-extend #202 fixes: code font now written into all four `w:rFonts` slots with a platform-appropriate mono font (Menlo/Consolas/DejaVu Sans Mono) plus a dedicated CJK `eastAsia` font (so Chinese comments no longer garble); explicit left alignment prevents justify-stretched lines; code blocks get a light border and `noProof` (no spell-check squiggles on identifiers, inline code included).
- Fixed **Word-exported Mermaid diagrams not following the preview theme** — diagram colors are now derived from the current theme's tokens (surface/border mixes at 18%/28%/45%, same ratios as the editor), with dark themes falling back to the light palette. Previously hardcoded to mermaid's `neutral` theme.
- Fixed **inline formulas wrapping in Word export** — the measurement viewport was widened to 2000px so wider formulas are not line-wrapped by KaTeX before capture (mirrors ColaMD-extend `MEASURE_WIDTH`).
- Fixed **exported HTML/PDF diagrams losing theme colors and carrying zoom controls** — injected export CSS now matches serialized `<div><svg class="pele pele-…">` wrappers to restore the `--pele-*` variable mapping (mirrors ColaMD-extend a25b3f8), and hides the editor-only `.pele-zoom` controls that Chromium print cannot remove via scripts (mirrors `print-layout.ts`).

## [0.3.0] - 2026-11-06

### Added
- Added **Word (`.docx`) export** — ported from ColaMD-extend's `docx-export.ts`. Exports high-fidelity `.docx` with headings, paragraphs, inline styles (bold/italic/strikethrough/inline-code/links/highlight), code blocks, ordered/unordered/task lists, tables, blockquotes, horizontal rules, local & remote images, footnotes, KaTeX formulas (rasterized to images), and Mermaid diagrams (rasterized to images). New command `colaview.exportWord` ("Export to Word...") in the command palette, editor context menu, explorer context menu, and preview right-click menu.
- Added `src/export/docx-exporter.ts` — pure-Node `markdownToDocx()` using `docx` v9 + `unified`/`remark-parse`/`remark-gfm`, with a pure-JS image dimension sniffer (`sniffImage`) in place of Electron's `nativeImage`.
- Added `src/export/render-export-images.ts` — headless-Chrome (puppeteer-core) rasterizes KaTeX and Mermaid to PNG, rewriting the source Markdown to image placeholders.
- Added direct dependencies: `docx`, `katex`, `remark-parse`, `remark-gfm`, `unified`.
- Added **9 new built-in themes**: Sepia, Notion, Bear, Writer, Solarized Dark, Nord, Gruvbox, Dracula, Midnight — expanding from 4 to 12 total built-in themes
- Added local **TypeScript type declarations** (`src/types/colamd-renderer.d.ts`) for `@bytechain.cn/colamd@2.7.9`, since the npm package does not publish `.d.ts` files
- Added `src/export/theme-style.ts` — **theme-faithful export**. Converts editor-specific theme selectors (`#editor .cm-content .cm-md-*`) into semantic HTML selectors (`h1`/`strong`/`em`/`code`/`table`/`blockquote`...) and extracts `:root` tokens plus `.cm-content` font/line-height, then injects the converted styles into PDF, HTML and Word exports so exported documents inherit the current preview theme's fonts, accent colors, table styling, blockquote padding, etc.

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
- Fixed **exported documents losing preview theme styles** — theme CSS used editor-only DOM selectors (`#editor .cm-content .cm-md-*`) that could not match the semantic HTML produced by PDF/HTML/Word export, causing fonts, accent colors, table headers and blockquote padding to fall back to defaults. Fixed via the new `theme-style.ts` conversion layer.
- Fixed scroll sync listening to wrong DOM node — CM6 uses `.cm-scroller` for scrolling instead of the container `#editor` element

### Files Changed
- `package.json` — Bump `@bytechain.cn/colamd` from `^1.5.2` to `^2.7.9`, update theme enum, change default theme; add `docx`, `katex`, `remark-parse`, `remark-gfm`, `unified`
- `src/export/docx-exporter.ts` — New Word export converter
- `src/export/render-export-images.ts` — New KaTeX/Mermaid → PNG renderer for Word export
- `src/export/theme-style.ts` — New theme CSS → semantic HTML style converter for exports
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
