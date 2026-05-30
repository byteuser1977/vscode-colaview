# Changelog

All notable changes to this project will be documented in this file.

## [1.5.3-beta.0] - 2025-05-29

### Added
- Added **experimental** scroll sync feature between editor and preview panel
- Added `colaview.scrollSync` configuration option (**experimental**) to enable/disable scroll synchronization
- Implemented bidirectional scroll tracking: editor cursor position syncs to preview and vice versa
- Added `topRatio` calculation for precise scroll positioning based on visible editor area

### Improved
- Enhanced scroll sync algorithm using relative position mapping instead of simple percentage
- Added debouncing to scroll events to prevent performance issues
- Added circular reference prevention to avoid infinite scroll loops
- Optimized scroll position calculation to handle content wrapping and screen width variations

### Fixed
- Fixed list indentation and symbol alignment issues in HTML/PDF exports
- Fixed h4 heading color inconsistency in exports
- Fixed code block border color mismatch after theme changes
- Fixed print margin width issue (reduced from 60px to 28px)

## [0.1.2] - 2025-05-28

### Fixed
- Fixed blockquote background color being overwritten by page background in dark/light/newsprint themes

## [0.1.1] - Previous Release

### Initial
- ColaMD Preview initial release with Markdown preview and PDF/HTML export support
