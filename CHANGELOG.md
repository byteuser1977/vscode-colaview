# Changelog

All notable changes to this project will be documented in this file.

## [0.2.1] - 2025-06-04

### Fixed
- Fixed custom theme background color not applied to preview page — CSS variable naming mismatch between `index.html` inline styles (`--color-*`) and custom theme / `colamd.css` conventions (`--*-*`); unified all inline style variable references to use `colamd.css`-compatible names with fallback chain

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
