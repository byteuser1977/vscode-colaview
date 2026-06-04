# Release Notes

## v0.2.1 (2025-06-04)

### Bug Fix

**Fix custom theme background color not applied to preview page**

The custom theme background color was not taking effect due to a CSS variable naming mismatch between `index.html` inline styles and the custom theme / `colamd.css` conventions:

- `index.html` inline styles used the `--color-*` naming pattern (e.g., `--color-bg`, `--color-text`)
- Custom themes and `colamd.css` use the `--*-*` naming pattern (e.g., `--bg-color`, `--text-color`)

All inline style variable references in `index.html` have been updated to use `colamd.css`-compatible names with a fallback chain (`var(--bg-color, var(--color-bg, #fff))`), ensuring both built-in and custom themes render correctly.

### Files Changed

- `src/preview/webview/index.html` — CSS variable name unification with fallback chain
- `src/preview/webview/app.ts` — Reverted redundant `setBodyThemeClass` function (already handled by colamd renderer)

---

## v0.2.0 (2025-05-30)

### New Features

- **Right-click context menu** in preview WebView: export HTML/PDF, switch theme (with submenu), import custom theme
- **Academic Paper** custom theme — follows GB/T 7713 Chinese academic paper standards
- **Trae Blue** custom theme — Trae IDE documentation style
- **Read-only mode styling** for ProseMirror editor

### Improvements

- Restructured extension activation with error-isolated initialization
- Refactored PreviewManager with dedicated methods
- Runtime plugin toggle sync via `onDidChangeConfiguration`
- Improved scroll sync error resilience

### Bug Fixes

- Fixed h4 heading color inconsistency in exports
- Fixed code block border color mismatch after theme changes
- Fixed print margin width issue

---

## v0.1.3 (2025-05-29)

### New Features

- Experimental scroll sync between editor and preview panel
- `colaview.scrollSync` configuration option

### Bug Fixes

- Fixed list indentation and symbol alignment in HTML/PDF exports

---

## v0.1.2 (2025-05-28)

### Bug Fix

- Fixed blockquote background color overwritten by page background in dark/light/newsprint themes

---

## v0.1.1 (2025-05-27)

### Initial Release

- Markdown preview with 4 built-in themes
- PDF/HTML export
- KaTeX math and Mermaid diagram rendering
- Custom theme support via `.themes/` directory
- Switched to npm package `@bytechain.cn/colamd`