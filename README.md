# atarus-report-kit

Lightweight pentest reporting. One folder, four files. No install.

An offline pentest report builder for practitioners who want to write the report, not fight the tool.

## Why this exists

Most pentest reporting tools are either enterprise SaaS with a five-figure price tag or self-hosted platforms that need Docker, a database, and a weekend to set up. For a two-person consultancy, a bug bounty hunter, or anyone who just needs to ship a clean report, that is too much tool for the job.

atarus-report-kit is a folder of four files. Open the HTML file in a browser. Fill in findings. Export to PDF. Save the state as JSON so you can resume later. No install, no account, no telemetry, no cloud. Your findings stay on your machine.

Here to make all our lives easier, let us know of any issues or feature requests and we will fix it ASAP.

## Features

| Feature | Detail |
|---|---|
| Zero install | Four static files, open in any modern browser |
| Offline | No network calls, no CDN, no tracking, enforced by a Content Security Policy |
| Live preview | Edits render in the report pane as you type |
| Severity model | Critical / High / Medium / Low / Info with CVSS-aligned guidance |
| Save / Load | Export engagement state to JSON, reload anytime; loaded files are validated first |
| Print to PDF | Browser-native PDF export, paginates cleanly |
| Custom branding | Drop in your logo, override colors |
| Opinionated defaults | Pre-filled methodology, disclaimer, risk rating descriptions based on real engagements |

## Quick start

1. Download the release archive (or clone this repository) and keep the four files together: `atarus-report-kit.html`, `report-kit.css`, `report-kit.js`, `report-kit-validate.js`
2. Open `atarus-report-kit.html` in Firefox, Chrome, or any Chromium browser
3. Fill in Cover, Engagement, and Findings tabs
4. Click Print to PDF

That is the entire workflow. The HTML file alone does not work since 1.1: the page's Content Security Policy forbids inline script, so the code lives in the two `.js` files next to it.

## What this tool sends over the network

Nothing. The page makes no requests of its own: no fonts, no analytics, no update check, no CDN. Its Content Security Policy (`default-src 'none'; script-src 'self'; style-src 'self'; img-src data:; base-uri 'none'; form-action 'none'`) lets the browser load only the kit's own script and stylesheet from the same folder and images embedded as `data:` URLs, so a bug in the page or a hostile report file still has nowhere to send anything. `tests/page.test.js` fails if a network API or a remote URL appears in the code.

## Report files

A report file (`Save`) is a JSON object with the report fields and a `findings` array. When you `Open` one, every field is checked before it is used:

- type: strings where strings are expected, an array of objects for findings
- length: 200 characters for single-line fields, 100,000 for multi-line fields, 500 findings, 2 MB per file
- allowed values: severity (`critical`, `high`, `medium`, `low`, `info`), engagement type (the list in the Engagement tab), colours (`#rrggbb`), CVSS (`0.0` to `10.0`), finding ids (letters, digits, `-`, `_`, up to 40, unique)
- logo: a base64 `data:image/...` URL only, PNG, JPEG, GIF, WebP or SVG, whose first bytes match the declared type, under 500 KB

A file that fails any check is refused as a whole and the reasons appear in the status line; the report you had open is left as it was. Unknown fields are dropped and listed. Values that pass are placed in the page as text, never as markup, so a field containing `<script>` shows those characters in the report. Control characters, zero-width characters and bidirectional overrides are removed from text.

Report files are still data from whoever wrote them. The checks above are there so that opening a file from a colleague or a client is safe; they do not make the file's contents true.

## Autosave

The bar under the toolbar has a switch, **Autosave in this browser**, off by default. When it is on, the current report is kept in the browser's storage for this page's origin so you can pick it up on the next visit. That storage is shared with any other page loaded from the same origin and with anyone who uses the browser profile, so for client work keep the switch off and save to a file. Turning the switch off removes the stored copy; **Clear saved data** removes everything the page has stored, including a copy written by version 1.0, which saved without asking.

## Use cases

- Solo consultants and small pentest shops
- Bug bounty hunters writing client deliverables
- Red teamers who need fast, clean reports between engagements
- Anyone who wants to own their reporting workflow without a SaaS subscription

## What it is not

- Not a collaboration platform. One report, one tester, one file.
- Not a vulnerability tracker. Use your existing workflow, paste findings in when ready.
- Not a replacement for Dradis or PlexTrac at scale. If you run 50 engagements a quarter with a team of 10, use those.

## Files

| File | What it is |
|---|---|
| `atarus-report-kit.html` | The page: markup, the Content Security Policy, no script or style of its own |
| `report-kit.css` | Styles for the editor, the preview and print |
| `report-kit-validate.js` | Validation of report files and stored data, text cleaning, logo checks. Also a Node module for the tests |
| `report-kit.js` | Editor, preview and file handling. Builds the page with text nodes only |

## Built by

[Atarus Offensive Security](https://atarussecurity.com). Part of the `atarus-*` open source pentest suite.

- [atarus-recon](https://github.com/atarus-security/atarus-recon) - external attack surface recon
- [atarus-cloud](https://github.com/atarus-security/atarus-cloud) - multi-cloud security scanner (AWS + Azure)
- [atarus-phishcheck](https://github.com/atarus-security/atarus-phishcheck) - email security analyzer
- [atarus-webscan](https://github.com/atarus-security/atarus-webscan) - web application security scanner
- atarus-report-kit - you are here

## Security

See [SECURITY.md](SECURITY.md) for what counts as a security bug in this tool and how to report one.

## Testing

```bash
node --test
```

No dependencies; Node 20 or later. `tests/validate.test.js` covers the validator and text handling against the fixtures in `tests/fixtures/` (markup in every field, handler attributes, `javascript:` URLs, wrong types, oversize fields). `tests/page.test.js` checks the page keeps its Content Security Policy, has no inline script, style or handler attributes, and that the code has no markup or network sinks. `tests/browser.test.js` loads the real page in headless Chrome or Chromium (set `CHROME=/path/to/browser` if it is not on the PATH), feeds the fixtures through the Open path and checks that nothing runs and the report renders; it is skipped when no browser is found. GitHub Actions runs all three on every push.

## License

MIT

## Contributing

Issues and PRs welcome. Keep it offline. Keep it dependency-free. Keep it simple. Every value from a report file goes through `report-kit-validate.js` and reaches the page as text.
