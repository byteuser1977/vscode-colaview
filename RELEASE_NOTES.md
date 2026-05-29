# Release Notes

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
