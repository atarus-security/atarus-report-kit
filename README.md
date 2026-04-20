# atarus-report-kit

Lightweight pentest reporting. One HTML file. No install.

A single-file, offline pentest report builder for practitioners who want to write the report, not fight the tool.

## Why this exists

Most pentest reporting tools are either enterprise SaaS with a five-figure price tag or self-hosted platforms that need Docker, a database, and a weekend to set up. For a two-person consultancy, a bug bounty hunter, or anyone who just needs to ship a clean report, that is too much tool for the job.

atarus-report-kit is one HTML file. Open it in a browser. Fill in findings. Export to PDF. Save the state as JSON so you can resume later. No install, no account, no telemetry, no cloud. Your findings stay on your machine.

Here to make all our lives easier, let us know of any issues or feature requests and we will fix it ASAP. 

## Features

| Feature | Detail |
|---|---|
| Zero install | Single HTML file, open in any modern browser |
| Offline | No network calls, no CDN, no tracking |
| Live preview | Edits render in the report pane as you type |
| Severity model | Critical / High / Medium / Low / Info with CVSS-aligned guidance |
| Save / Load | Export engagement state to JSON, reload anytime |
| Print to PDF | Browser-native PDF export, paginates cleanly |
| Custom branding | Drop in your logo, override colors |
| Opinionated defaults | Pre-filled methodology, disclaimer, risk rating descriptions based on real engagements |

## Quick start

1. Download `atarus-report-kit.html`
2. Open it in Firefox, Chrome, or any Chromium browser
3. Fill in Cover, Engagement, and Findings tabs
4. Click Print to PDF

That is the entire workflow.

## Use cases

- Solo consultants and small pentest shops
- Bug bounty hunters writing client deliverables
- Red teamers who need fast, clean reports between engagements
- Anyone who wants to own their reporting workflow without a SaaS subscription

## What it is not

- Not a collaboration platform. One report, one tester, one file.
- Not a vulnerability tracker. Use your existing workflow, paste findings in when ready.
- Not a replacement for Dradis or PlexTrac at scale. If you run 50 engagements a quarter with a team of 10, use those.

## Built by

[Atarus Offensive Security](https://atarussecurity.com). Part of the `atarus-*` open source pentest suite.

- [atarus-recon](https://github.com/atarus-security/atarus-recon) - external recon
- [atarus-cloud](https://github.com/atarus-security/atarus-cloud) - multi-cloud scanner
- atarus-report-kit - you are here

## License

MIT

## Contributing

Issues and PRs welcome. Keep it single-file. Keep it offline. Keep it simple.
