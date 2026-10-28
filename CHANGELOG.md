# Changelog

All notable changes to atarus-report-kit. Dates are commit dates.

## 1.1.0 (unreleased, refresh-2026-10)

### Security

- **Report files are validated before use, and every value reaches the page as text.**

  What was wrong: the Open button parsed the chosen JSON file and merged it straight into the page state (`Object.assign(state, data)`), and the preview was built from HTML strings. The logo field went into an `img src` attribute, finding severity and id went into class names and an `onclick` handler, and text fields were escaped by hand in some places and not others. A report file from someone else could therefore run script in the page of whoever opened it: a JSON like `{"logo": "x\" onerror=\"..."}` ran its payload as soon as the file loaded, and a field holding a number instead of a string stopped the preview from rendering at all. The site's description of the tool as offline was true, but "your findings stay on your machine" was only true if nobody sent you a report file.

  What changed, in plain terms: a report file is now checked field by field before any of it is used. Each field must have the right type, stay within a length limit, and for fields with a fixed set of values (severity, engagement type, colours, CVSS score, finding id) match that set. A file that fails any check is refused as a whole, with the reasons shown in the status line, and the report you were working on is left untouched. Unknown fields are dropped and listed. Values that pass are placed in the page as text, so a title that reads `<script>...</script>` shows those characters and nothing else. The logo is accepted only as a base64 `data:image/...` URL whose first bytes match the declared type (PNG, JPEG, GIF, WebP, or an SVG document) and whose size is within 500 KB. A Content Security Policy on the page blocks inline script, `eval`, remote scripts, stylesheets, images and connections, so even a bug missed here has no way to run code or send data.

  Technically: `report-kit-validate.js` exports `validateReport(object)` and `parseReportText(text)`, which build a fresh state object from the known keys only (`defaultState()` plus accepted values), so a `__proto__` or `constructor` key in the file is ignored rather than merged. Limits are in `LIMITS`: 2 MB per file, 200 characters for single-line fields, 100,000 for multi-line fields, 500 findings, 500 KB decoded logo. `cleanText()` normalises line endings and strips C0 and C1 control characters, zero-width characters, bidirectional overrides and isolates, and the BOM; single-line fields also lose embedded line breaks. `checkLogo()` decodes the first bytes of the base64 payload and compares them with the PNG, JPEG, GIF and WebP magic numbers, or for `image/svg+xml` requires the document to start with an XML declaration, comment, doctype or `<svg`. `report-kit.js` builds the preview and the finding editor with `document.createElement` and text nodes through a helper whose attribute names are an allow-list; `setAttribute('src', ...)` appears once, for the logo, after `checkLogo()`. There is no `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `Function` in the code, and a test fails the build if one appears. All scripts and styles moved out of the HTML into `report-kit.js`, `report-kit-validate.js` and `report-kit.css`; the `onclick`, `oninput` and `onchange` attributes became `addEventListener` calls; inline `style` attributes became classes. The page carries `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src data:; base-uri 'none'; form-action 'none'">` and `<meta name="referrer" content="no-referrer">`. Colours set through `style.setProperty` are checked against `#rrggbb` first.

- **Autosave is opt-in, off by default, with a clear button.**

  What was wrong: every keystroke was written to `localStorage` under the page's origin, and the next visit offered to load it. Browser storage for an origin is shared with every other page served from that origin and with everyone who uses that browser profile, so client findings sat in a place the user had not chosen and could not see. Nothing in the page said so and nothing could clear it except the browser's own settings.

  What changed: a switch in the bar under the toolbar, "Autosave in this browser", is off by default. Only when it is on is the report written to storage, and turning it off removes the stored copy. A "Clear saved data" button removes the stored report, the preference and the copy an earlier version wrote. The bar states that storage is shared on the origin and recommends saving to a file. A stored report is validated like a file before it is offered, and a copy written by 1.0 is offered once and then removed.

  Technically: keys are `atarus_report_kit_autosave_v2` (report) and `atarus_report_kit_autosave_on` (preference); `autoSave()` returns before touching storage unless the switch is on; the 1.0 key `atarus_report_autosave` is read through `parseReportText()`, offered, and removed. Storage failures surface in the status line instead of being swallowed.

### Fixed
- A report file whose `cvss` is a number (for example `9.8`) loads and renders; the value is normalised to one decimal place. Earlier on this branch the fix was to coerce in the escaping helper; the validator now handles it.
- Loading a file no longer keeps the file input's value, so the same file can be opened twice in a row.
- The "Delete Finding" and "Close" buttons and the finding list items no longer carry per-item inline handlers.
- Placeholders no longer use a person's name.

### Added
- `report-kit-validate.js`: the validator, loadable in the browser and with `require()` in Node.
- `tests/validate.test.js`: validator and text handling, with fixtures `tests/fixtures/rejected.json` (markup in every field, handler attributes, `javascript:` URLs, wrong types, duplicate ids, prototype keys) and `tests/fixtures/hostile-text.json` (a valid report whose text is hostile), plus oversize cases built in the test.
- `tests/page.test.js`: static checks that the page keeps its CSP, has no inline script, style or handler attributes, that the scripts use no markup or network sinks, that storage is written only through the switch, that no file contains an em dash, and that the version is the same everywhere.
- `tests/browser.test.js`: loads the real page in headless Chrome or Chromium, feeds each fixture through the Open path, and checks that nothing runs, the CSP blocks `eval` and inline script, hostile text is visible as text, the logo renders, and storage stays empty. Skipped when no Chrome is found. Replaces `tests/browser_test.py`.
- `package.json` (no dependencies) so `npm test` runs `node --test`.
- GitHub Actions: `node --test` on Node 20 and 22.
- SECURITY.md and this changelog; version string in `ReportKitValidate.VERSION`, `package.json` and the page.

### Changed
- The kit is now a folder of four files (`atarus-report-kit.html`, `report-kit.css`, `report-kit.js`, `report-kit-validate.js`) instead of one HTML file, because a Content Security Policy with no inline script needs scripts in files. Download the release archive or clone the repository; the HTML file alone no longer works.
- The file picker accepts GIF and WebP logos as well as PNG, JPEG and SVG, and a "Remove logo" button was added.
- Status messages (file loaded, file refused, logo refused, storage cleared) appear in the status line instead of `alert()` dialogs.

### Docs
- README: how the tool handles report files, what it sends over the network (nothing), the autosave switch, the folder layout, the test command. SECURITY.md: what counts as a security bug in this tool.

## 1.0.0 (2026-04-19)
- Initial release: single offline HTML file, live preview, severity model, save and load JSON, print to PDF, custom branding.
