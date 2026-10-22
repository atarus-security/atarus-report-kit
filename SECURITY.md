# Security policy

## Reporting a vulnerability

Please report security issues in atarus-report-kit privately by email to info@atarussecurity.com. Do not open a public GitHub issue for a vulnerability.

Include:

- the version or commit you tested
- steps to reproduce, and a proof of concept if you have one
- the impact you expect

We aim to acknowledge reports within 5 business days and to agree a fix and disclosure date with you. We are happy to credit reporters who want credit.

## Supported versions

Only the latest release on the default branch receives security fixes.

## Scope

In scope: the code in this repository and the reports it generates.

Out of scope: third-party tools this project calls or downloads (for example the browser you open it in), and findings that require an attacker who already controls the machine running the tool.

## Using this tool

Report JSON files are data from whoever wrote them. Only load report files from people you trust, and keep client reports out of shared or synced browser profiles because the tool autosaves to localStorage.
