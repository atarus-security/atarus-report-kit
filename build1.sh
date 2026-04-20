#!/bin/bash
cd ~/atarus-report-kit

mkdir -p src examples

cat > README.md << 'EOF'
# atarus-report-kit

Free, open-source pentest report builder for junior pentesters, students, and anyone learning to write professional security reports.

**No installation. No account. No data collection.**

Just open `atarus-report-kit.html` in your browser. Write your report with inline guidance that teaches you what good reporting looks like. Save to a file. Export to PDF.

## What it does

- Single HTML file. Double-click, it opens in your browser
- Works completely offline
- Fill in each section with inline help that explains what to write
- Save your report as a JSON file (email it to yourself, keep it anywhere)
- Print to PDF with one click (browser's built-in print dialog)
- Customize the firm name, tester name, colors, and logo

## Who this is for

- Students learning penetration testing
- Junior pentesters writing their first professional reports
- Bug bounty hunters who want their findings to look professional
- Anyone who needs a pentest report template without subscribing to a SaaS

## How to use

1. Download `atarus-report-kit.html`
2. Open it in any modern browser (Chrome, Firefox, Edge, Safari)
3. Fill in each section using the forms on the left
4. Preview on the right updates in real-time
5. Click "Save" to download your report as a JSON file
6. Click "Print to PDF" to export a professional PDF

## What's in a good pentest report

This tool teaches you the standard structure:

- **Cover page** with client name, dates, and tester
- **Disclaimer** about confidentiality and scope limitations
- **Executive summary** in plain language for non-technical stakeholders
- **Summary of findings** table with severity counts and titles
- **Detailed findings** each with observation, risk, affected systems, recommendation, and evidence
- **Methodology** describing what you tested and how
- **Conclusion** tying it all together

Each section has built-in writing tips so you know what to put where.

## Part of the atarus- suite

- **[atarus-recon](https://github.com/atarus-security/atarus-recon)** - External attack surface reconnaissance
- **[atarus-cloud](https://github.com/atarus-security/atarus-cloud)** - Multi-cloud security scanner
- **atarus-report-kit** - Pentest report builder (you are here)

## License

MIT

## Built by

[Atarus Offensive Security](https://atarussecurity.com)
EOF

cat > LICENSE << 'EOF'
MIT License

Copyright (c) 2026 Atarus Offensive Security LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF

cat > .gitignore << 'EOF'
*.swp
*~
.vscode/
.idea/
*.bak
build_*.sh
test-*.json
EOF

echo "[+] Script 1 done: project scaffolding, README, LICENSE, gitignore"
