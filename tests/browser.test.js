// Headless browser test. Loads the real page from a temporary folder in
// headless Chrome or Chromium, feeds each fixture through the same path the
// Open button uses (ReportKit.loadReportText) and reads the DOM back.
// Skips when no Chrome is found. Set CHROME=/path/to/chrome to point at one.
// Run with: node --test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PAGE_FILES = ['atarus-report-kit.html', 'report-kit.css', 'report-kit.js', 'report-kit-validate.js'];

function findChrome() {
  const candidates = [
    process.env.CHROME,
    'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ].filter(Boolean);
  for (const c of candidates) {
    if (path.isAbsolute(c)) {
      if (fs.existsSync(c)) return c;
      continue;
    }
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split('\n')[0];
  }
  return null;
}

const CHROME = findChrome();

// The harness is a separate file so the page's CSP (script-src 'self', no
// inline script) stays exactly as shipped. It runs after the page's own
// deferred scripts, loads the fixture text, probes the CSP, and writes what
// it saw as data attributes on <html> for the DOM dump to carry out.
function harnessSource(fixtureText) {
  return [
    'window.confirm = function () { return false; };',
    'window.__pwned = false;',
    'var root = document.documentElement;',
    'var FIXTURE = ' + JSON.stringify(fixtureText) + ';',
    'window.addEventListener("securitypolicyviolation", function (e) { root.setAttribute("data-csp-violation", (root.getAttribute("data-csp-violation") || "") + e.violatedDirective + ";"); });',
    'function run() {',
    '  var r;',
    '  try { r = window.ReportKit.loadReportText(FIXTURE, "test"); } catch (e) { root.setAttribute("data-exception", String(e && e.message)); return; }',
    '  root.setAttribute("data-ok", String(r.ok));',
    '  root.setAttribute("data-errors", r.errors.join(" | "));',
    '  root.setAttribute("data-autosave", String(window.ReportKit.isAutosaveOn()));',
    '  root.setAttribute("data-storage", String(localStorage.length));',
    '  try { eval("window.__evalRan = true"); root.setAttribute("data-eval", "ran"); } catch (e) { root.setAttribute("data-eval", "blocked"); }',
    '  var s = document.createElement("script"); s.textContent = "window.__inlineRan = true;"; document.body.appendChild(s);',
    '  setTimeout(function () {',
    '    root.setAttribute("data-inline", window.__inlineRan ? "ran" : "blocked");',
    '    root.setAttribute("data-title", document.title);',
    '    root.setAttribute("data-done", "yes");',
    '  }, 400);',
    '}',
    'if (window.ReportKit) run(); else window.addEventListener("DOMContentLoaded", run);'
  ].join('\n');
}

function renderWithFixture(fixtureName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-kit-test-'));
  try {
    for (const f of PAGE_FILES) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    const fixtureText = fs.readFileSync(path.join(__dirname, 'fixtures', fixtureName), 'utf8');
    fs.writeFileSync(path.join(dir, 'harness.js'), harnessSource(fixtureText));
    const page = fs.readFileSync(path.join(dir, 'atarus-report-kit.html'), 'utf8')
      .replace('</head>', '<script src="harness.js" defer></script>\n</head>');
    const pagePath = path.join(dir, 'test.html');
    fs.writeFileSync(pagePath, page);
    const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox',
      '--user-data-dir=' + path.join(dir, 'profile'), '--virtual-time-budget=5000',
      '--dump-dom', 'file://' + pagePath];
    const p = spawnSync(CHROME, args, { encoding: 'utf8', timeout: 90000, maxBuffer: 64 * 1024 * 1024 });
    assert.equal(p.error, undefined, 'chrome failed to start: ' + (p.error && p.error.message));
    return p.stdout;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function attr(dom, name) {
  const m = dom.match(new RegExp('<html[^>]*\\sdata-' + name + '="([^"]*)"'));
  return m ? m[1] : null;
}

const skipReason = CHROME ? false : 'no Chrome or Chromium found (set CHROME=/path/to/chrome)';

test('headless: rejected fixture is refused, nothing runs, page still renders', { skip: skipReason }, () => {
  const dom = renderWithFixture('rejected.json');
  assert.equal(attr(dom, 'exception'), null, 'loadReportText threw');
  assert.equal(attr(dom, 'done'), 'yes', 'page did not finish');
  assert.equal(attr(dom, 'ok'), 'false');
  assert.match(attr(dom, 'errors'), /logo must be a base64 data URL/);
  assert.match(attr(dom, 'errors'), /finding 1 severity must be one of/);
  assert.equal(attr(dom, 'title'), 'atarus-report-kit', 'document.title changed: script ran');
  assert.doesNotMatch(dom, /PWNED/, 'a payload reached the DOM');
  assert.doesNotMatch(dom, /<[a-zA-Z][^>]*\son(error|load|click|mouseover)=/, 'a handler attribute reached the DOM');
  // The page kept its default report and shows the refusal in the status line.
  assert.match(dom, /<div class="cover-title">Penetration Test Report<\/div>/);
  assert.match(dom, /class="status error"[^>]*>Report not loaded from test: /);
  // CSP: eval and inline script are blocked.
  assert.equal(attr(dom, 'eval'), 'blocked');
  assert.equal(attr(dom, 'inline'), 'blocked');
  assert.match(attr(dom, 'csp-violation') || '', /script-src/);
  // Autosave stays off and nothing was written to storage.
  assert.equal(attr(dom, 'autosave'), 'false');
  assert.equal(attr(dom, 'storage'), '0');
});

test('headless: hostile-text fixture loads, every value is text, logo renders', { skip: skipReason }, () => {
  const dom = renderWithFixture('hostile-text.json');
  assert.equal(attr(dom, 'exception'), null, 'loadReportText threw');
  assert.equal(attr(dom, 'done'), 'yes', 'page did not finish');
  assert.equal(attr(dom, 'ok'), 'true', attr(dom, 'errors'));
  assert.equal(attr(dom, 'title'), 'atarus-report-kit', 'document.title changed: script ran');
  assert.doesNotMatch(dom, /<[a-zA-Z][^>]*\son(error|load|click|mouseover)=/, 'a handler attribute reached the DOM');
  assert.doesNotMatch(dom, /<iframe/i);
  assert.doesNotMatch(dom, /<svg/i);
  // Markup in the data is visible as text (serialised with &lt; by the dump).
  assert.match(dom, /Prepared for &lt;b&gt;Example Corp&lt;\/b&gt;&lt;img src=x onerror=/);
  assert.match(dom, /SQL injection in login form &lt;script&gt;/);
  assert.match(dom, /class="host-tag">&lt;img src=x onerror=/);
  assert.match(dom, /evidence-code">POST \/login HTTP\/1\.1\nusername=' OR 1=1 --&amp;password=x\n&lt;script&gt;/);
  assert.match(dom, /javascript:alert\(1\)\)/, 'tester email shown as plain text');
  // The one allowed attribute sink: the checked PNG logo.
  assert.match(dom, /<img class="cover-logo" alt="logo" src="data:image\/png;base64,iVBOR/);
  assert.equal((dom.match(/<img /g) || []).length, 1, 'exactly one img element, the logo');
  // Typed fields rendered.
  assert.match(dom, /CVSS 9\.8/);
  assert.match(dom, /class="sev-tag high">HIGH</);
  assert.match(dom, /Web Application Penetration Test/);
  assert.match(dom, /style="--primary: #1e40af; --accent: #dc2626;"/);
  assert.match(dom, /class="status"[^>]*>Loaded test\. Ignored unknown fields: notes\./);
  // Control character stripped from the tester name.
  assert.match(dom, /Lead Tester:<\/strong> Lead Tester Name/);
  assert.equal(attr(dom, 'eval'), 'blocked');
  assert.equal(attr(dom, 'inline'), 'blocked');
  assert.equal(attr(dom, 'autosave'), 'false');
  assert.equal(attr(dom, 'storage'), '0');
});
