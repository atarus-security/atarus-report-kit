// Static checks on the page files: text reaches the page as text, the CSP is
// the one documented, no handler attributes, no inline script or style, no
// em dashes, one version everywhere. Run with: node --test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const html = read('atarus-report-kit.html');
const js = read('report-kit.js');
const validate = read('report-kit-validate.js');

const EXPECTED_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src data:; base-uri 'none'; form-action 'none'";

test('page declares the documented Content Security Policy', () => {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
  assert.ok(m, 'CSP meta tag missing');
  assert.equal(m[1], EXPECTED_CSP);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
});

test('page has no inline script, inline style or handler attributes', () => {
  const scripts = html.match(/<script\b[^>]*>/g) || [];
  assert.equal(scripts.length, 2);
  for (const tag of scripts) {
    assert.match(tag, /^<script src="report-kit(-validate)?\.js" defer>$/, 'script must load a local file: ' + tag);
    assert.doesNotMatch(tag, /https?:|\/\//, 'no remote script: ' + tag);
  }
  assert.doesNotMatch(html, /<script\b[^>]*>[^<]*\S[^<]*<\/script>/, 'no inline script body');
  assert.doesNotMatch(html, /<style\b/i, 'no style element');
  assert.doesNotMatch(html, /\sstyle="/i, 'no style attribute');
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'no handler attribute');
  assert.doesNotMatch(html, /javascript:/i);
  const links = html.match(/<link\b[^>]*>/g) || [];
  for (const tag of links) assert.doesNotMatch(tag, /https?:|\/\//, 'no remote stylesheet: ' + tag);
  assert.doesNotMatch(html, /\b(src|href)="(https?:)?\/\//i, 'no remote resource');
});

test('script writes no markup: no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, Function', () => {
  for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'srcdoc', 'setAttribute(\'on', 'setAttribute("on', 'createContextualFragment', 'DOMParser']) {
    assert.equal(js.includes(sink), false, 'report-kit.js uses ' + sink);
    assert.equal(validate.includes(sink), false, 'report-kit-validate.js uses ' + sink);
  }
  // The only place a src attribute is set is the logo, after checkLogo.
  const srcSets = js.match(/setAttribute\('src'/g) || [];
  assert.equal(srcSets.length, 1);
  assert.match(js, /function logoImage\(dataUrl\) \{\s*var check = V\.checkLogo\(dataUrl\);/);
  // No network APIs at all.
  for (const api of ['fetch(', 'XMLHttpRequest', 'navigator.sendBeacon', 'WebSocket', 'EventSource', 'importScripts', 'import(']) {
    assert.equal(js.includes(api), false, 'report-kit.js uses ' + api);
    assert.equal(validate.includes(api), false, 'report-kit-validate.js uses ' + api);
  }
});

test('browser storage is written only through autoSave, which checks the switch', () => {
  const writes = js.match(/\.setItem\(/g) || [];
  assert.equal(writes.length, 2, 'one write for the report, one for the preference');
  assert.match(js, /function autoSave\(\) \{\s*if \(!autosaveOn\) return;/);
  assert.match(js, /var autosaveOn = false;/);
  assert.match(html, /<input type="checkbox" id="autosave_toggle">/, 'switch exists and is unchecked by default');
  assert.match(html, /id="btn_clear_storage"/);
  assert.match(html, /shared with any other page loaded from the same origin/);
});

test('no em dashes in any tracked text file, including UI strings', () => {
  const dash = String.fromCharCode(0x2014);
  const files = ['atarus-report-kit.html', 'report-kit.js', 'report-kit-validate.js', 'report-kit.css', 'README.md', 'SECURITY.md', 'CHANGELOG.md', 'LICENSE', 'package.json',
    'tests/validate.test.js', 'tests/page.test.js', 'tests/browser.test.js', 'tests/fixtures/rejected.json', 'tests/fixtures/hostile-text.json', '.github/workflows/tests.yml'];
  for (const f of files) {
    const text = read(f);
    assert.equal(text.includes(dash), false, f + ' contains an em dash');
  }
});

test('one version string: validator, package.json, CHANGELOG, page fallback', () => {
  const V = require('../report-kit-validate.js');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, V.VERSION);
  assert.match(read('CHANGELOG.md'), new RegExp('^## ' + V.VERSION.replace(/\./g, '\\.') + ' ', 'm'));
  assert.match(html, new RegExp('id="version">v' + V.VERSION.replace(/\./g, '\\.') + '<'));
  assert.deepEqual(Object.keys(pkg.dependencies || {}), []);
  assert.deepEqual(Object.keys(pkg.devDependencies || {}), []);
});

test('every editor field declares the same length limit the validator enforces', () => {
  const V = require('../report-kit-validate.js');
  const inputs = html.match(/<input type="(?:text|email)" id="f_[a-z_]+"[^>]*>/g) || [];
  assert.ok(inputs.length >= 8);
  for (const tag of inputs) assert.match(tag, new RegExp('maxlength="' + V.LIMITS.MAX_SHORT + '"'), tag);
  const areas = html.match(/<textarea[^>]*id="f_[a-z_]+"[^>]*>/g) || [];
  assert.ok(areas.length >= 7);
  for (const tag of areas) assert.match(tag, new RegExp('maxlength="' + V.LIMITS.MAX_TEXT + '"'), tag);
  const options = [...html.matchAll(/<option>([^<]+)<\/option>/g)].map((m) => m[1]);
  assert.deepEqual(options, [...V.ENGAGEMENT_TYPES]);
});
