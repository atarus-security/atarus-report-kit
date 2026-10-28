# Security policy

## Reporting a vulnerability

Please report security issues in atarus-report-kit privately by email to info@atarussecurity.com. Do not open a public GitHub issue for a vulnerability.

Include:

- the version or commit you tested
- steps to reproduce, and a proof of concept if you have one (a report JSON file is usually enough)
- the impact you expect

We aim to acknowledge reports within 5 business days and to agree a fix and disclosure date with you. We are happy to credit reporters who want credit.

## Supported versions

Only the latest release on the default branch receives security fixes.

## Scope

In scope: the four files that make up the kit (`atarus-report-kit.html`, `report-kit.css`, `report-kit.js`, `report-kit-validate.js`) and the reports they render and save.

Out of scope: the browser you open the page in, the PDF the browser prints, and findings that require an attacker who already controls the machine or the browser profile running the tool.

## Using this tool

atarus-report-kit runs entirely in your browser from files on your disk. It sends nothing over the network: there are no requests of its own, and the page's Content Security Policy forbids scripts, styles, images and connections from anywhere but the kit's own folder and `data:` images.

Report JSON files are data from whoever wrote them. Every field of a loaded file is checked for type, length and allowed values before it is used, a file that fails is refused as a whole, and accepted values are placed in the page as text. The logo is accepted only as a `data:image/...` URL whose bytes match the declared type, within 500 KB.

Autosave to browser storage is off by default. When you turn it on, the report is kept in this browser's storage for the page's origin, which is shared with any other page loaded from the same origin and with anyone who uses the browser profile. Turn it off or use "Clear saved data" to remove it. For client work, keep the switch off and save to a file.

Treat as a security bug and report it: any report file, stored data or editor input that runs script, loads a remote resource, changes anything outside the report preview, or appears in the page as markup rather than text; any logo accepted that is not a `data:image/...` URL of a checked type and size; any write to browser storage while the autosave switch is off, or stored data that survives "Clear saved data"; any network request made by the page; and any way to weaken or bypass the page's Content Security Policy from a report file.
