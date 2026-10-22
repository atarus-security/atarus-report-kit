"""Headless browser test for atarus-report-kit.html. Standard library only.

Loads the page in headless Chrome or Chromium, simulates loading report JSON
(the same code path as Load), and checks that:
  1. a crafted report cannot run script through the logo or severity fields
  2. a normal report (image logo, numeric CVSS) still renders

Usage: python3 tests/browser_test.py   (set CHROME=/path/to/chrome if needed)
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(HERE, "..", "atarus-report-kit.html")
PNG = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42"
       "mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")

HARNESS = """<script>
window.__marks = [];
window.confirm = function () { return false; };
window.addEventListener('load', function () {
  setTimeout(function () {
    try { state = Object.assign(state, %s); loadStateToUI(); renderReport(); }
    catch (e) { window.__marks.push('render-error:' + e.message); }
    setTimeout(function () { document.body.setAttribute('data-marks', window.__marks.join(',')); }, 300);
  }, 300);
});
</script>"""


def find_chrome():
    for c in [os.environ.get("CHROME"), "google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]:
        if c and (shutil.which(c) or os.path.exists(c)):
            return shutil.which(c) or c
    return None


def render(chrome, data):
    with open(PAGE, encoding="utf-8") as f:
        page = f.read()
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "t.html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(page.replace("</head>", HARNESS % json.dumps(data) + "</head>", 1))
        cmd = [chrome, "--headless=new", "--disable-gpu", "--no-first-run", "--no-sandbox",
               "--user-data-dir=" + os.path.join(d, "profile"), "--virtual-time-budget=3000",
               "--dump-dom", "file://" + path]
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        try:
            out, _ = p.communicate(timeout=45)
        except subprocess.TimeoutExpired:
            p.kill()
            out, _ = p.communicate()
        return out


def main():
    chrome = find_chrome()
    if not chrome:
        print("SKIP: no Chrome or Chromium found (set CHROME=...)")
        return 0
    failures = []

    evil = {
        "logo": 'x" onerror="window.__marks.push(\'logo-xss\')',
        "findings": [{"id": "f1\"');window.__marks.push('id-xss');//", "title": "t",
                      "severity": '<img src=x onerror="window.__marks.push(\'severity-xss\')">'}],
    }
    dom = render(chrome, evil)
    marks = re.search(r'data-marks="([^"]*)"', dom)
    if marks is None:
        failures.append("crafted report: page did not finish rendering")
    elif marks.group(1):
        failures.append("crafted report executed or crashed: " + marks.group(1))

    good = {"logo": PNG, "findings": [{"id": "f1", "title": "SQL injection", "cvss": 9.8, "severity": "high"}]}
    dom = render(chrome, good)
    marks = re.search(r'data-marks="([^"]*)"', dom)
    if marks is None or marks.group(1):
        failures.append("normal report did not render cleanly: " + (marks.group(1) if marks else "no marker"))
    for needle in ['<img src="data:image/png', 'sev-tag high">HIGH', "CVSS 9.8", "SQL injection"]:
        if needle not in dom:
            failures.append("normal report missing: " + needle)

    for f in failures:
        print("FAIL:", f)
    print("OK" if not failures else "%d failure(s)" % len(failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
