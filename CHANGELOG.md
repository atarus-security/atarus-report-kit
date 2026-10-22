# Changelog

All notable changes to atarus-report-kit.

## Unreleased (refresh-2026-10)

### Security
- Loading a report JSON could run script in the page: the logo was inserted into an `img src` attribute, and finding severity and id into markup and an `onclick` handler, without escaping. The logo is now rendered only when it is an image data URL, and those fields are escaped.

### Fixed
- Loading a report whose fields are numbers (for example `"cvss": 9.8`) no longer stops the preview from rendering.

### Added
- Headless browser test (`tests/browser_test.py`), GitHub Actions workflow, SECURITY.md and this changelog.

### Docs
- README: security notes on loading report files and localStorage autosave, test instructions, atarus-webscan added to the suite list.

## 1.0.0 (2026-04-19)
- Initial release: single offline HTML file, live preview, severity model, save and load JSON, print to PDF, custom branding.
