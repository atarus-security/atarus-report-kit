// Validator and text handling tests. Run with: node --test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const V = require('../report-kit-validate.js');
const FIXTURES = path.join(__dirname, 'fixtures');

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PWNED = /PWNED/;

test('rejected fixture: refused as a whole, nothing kept', () => {
  const r = V.validateReport(fixture('rejected.json'));
  assert.equal(r.ok, false);
  assert.equal(r.state, null);
  const joined = r.errors.join('\n');
  for (const needle of [
    'logo must be a base64 data URL',
    'primary must be a colour',
    'accent must be a colour',
    'type must be one of',
    'date must be a string',
    'scope must be a string',
    'finding 1 id must be',
    'finding 1 severity must be one of',
    'finding 1 cvss must be a score',
    'finding 3 repeats id ok-1',
    'finding 4 must be an object'
  ]) {
    assert.match(joined, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'expected error: ' + needle);
  }
  assert.deepEqual(r.ignored.sort(), ['__proto__', 'constructor', 'unknown_field']);
  assert.equal(({}).polluted, undefined, 'Object.prototype must not be polluted');
});

test('hostile-text fixture: valid shape, text kept verbatim, nothing interpreted', () => {
  const input = fixture('hostile-text.json');
  const r = V.validateReport(input);
  assert.equal(r.ok, true, r.errors.join('; '));
  const s = r.state;
  // Strings with markup are data. They survive unchanged (except control characters).
  assert.equal(s.client, input.client);
  assert.equal(s.footer, input.footer);
  assert.equal(s.scope, input.scope);
  assert.equal(s.findings[0].title, input.findings[0].title);
  assert.equal(s.findings[0].evidence, input.findings[0].evidence);
  assert.equal(s.findings[0].references, input.findings[0].references);
  // Control characters are stripped from text; a javascript: URL in a text field is just text.
  assert.equal(s.tester, 'Lead Tester Name');
  assert.equal(s.tester_email, 'javascript:alert(1)');
  // Typed fields are normalised.
  assert.equal(s.primary, '#1e40af');
  assert.equal(s.findings[0].cvss, '9.8');
  assert.equal(s.findings[1].cvss, '3.1');
  assert.equal(s.logo, PNG);
  assert.equal(s.type, 'Web Application Penetration Test');
  assert.deepEqual(r.ignored, ['notes']);
  // The result is a fresh object with exactly the known keys.
  assert.deepEqual(Object.keys(s).sort(), Object.keys(V.defaultState()).sort());
  assert.deepEqual(Object.keys(s.findings[0]).sort(), Object.keys(V.defaultFinding('x')).sort());
});

test('default state round-trips through the validator unchanged', () => {
  const d = V.defaultState();
  const r = V.validateReport(JSON.parse(JSON.stringify(d)));
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.deepEqual(r.state, d);
});

test('empty object yields the default state', () => {
  const r = V.validateReport({});
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, V.defaultState());
});

test('non-object inputs are refused', () => {
  for (const bad of [null, [], 'string', 42, true]) {
    const r = V.validateReport(bad);
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors, ['report must be a JSON object']);
  }
});

test('oversize fields: short, long, findings count, file size, logo', () => {
  const L = V.LIMITS;
  let r = V.validateReport({ client: 'x'.repeat(L.MAX_SHORT + 1) });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /client is longer than 200/);

  r = V.validateReport({ client: 'x'.repeat(L.MAX_SHORT) });
  assert.equal(r.ok, true);

  r = V.validateReport({ evidence: 'x', methodology: 'y'.repeat(L.MAX_TEXT + 1) });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /methodology is longer than 100000/);

  r = V.validateReport({ findings: [{ id: 'a', severity: 'low', evidence: 'z'.repeat(L.MAX_TEXT + 1) }] });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /finding 1 evidence is longer than/);

  const many = [];
  for (let i = 0; i <= L.MAX_FINDINGS; i++) many.push({ id: 'f' + i, severity: 'info' });
  r = V.validateReport({ findings: many });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /more than 500 findings/);

  r = V.parseReportText('{"client":"' + 'x'.repeat(L.MAX_FILE_BYTES) + '"}');
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /larger than 2000000 bytes/);

  const bigLogo = 'data:image/png;base64,' + 'A'.repeat(L.MAX_LOGO_CHARS);
  r = V.checkLogo(bigLogo);
  assert.equal(r.ok, false);
  assert.match(r.reason, /longer than/);

  // Within the URL length cap but over the decoded byte cap.
  const overBytes = 'data:image/png;base64,' + b64(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(L.MAX_LOGO_BYTES)]));
  r = V.checkLogo(overBytes);
  assert.equal(r.ok, false);
  assert.match(r.reason, /larger than 500000 bytes/);
});

test('parseReportText: size check, bad JSON, arrays', () => {
  assert.equal(V.parseReportText('not json').ok, false);
  assert.deepEqual(V.parseReportText('not json').errors, ['report is not valid JSON']);
  assert.equal(V.parseReportText('[]').ok, false);
  assert.equal(V.parseReportText(42).ok, false);
  assert.equal(V.parseReportText('{}').ok, true);
});

test('logo: only base64 data:image URLs whose bytes match the declared type', () => {
  const bad = [
    'https://example.invalid/logo.png',
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'data:image/svg+xml,<svg onload="alert(1)"></svg>',
    'data:image/png;base64,' + b64('not a png'),
    'data:image/png;base64,iVBORw0KGgo"onerror="alert(1)',
    'data:image/jpeg;base64,' + b64([0x89, 0x50, 0x4e, 0x47]),
    'data:image/svg+xml;base64,' + b64('<html><script>alert(1)</script>'),
    'data:image/png;base64,',
    'data:image/png;base64,!!!!'
  ];
  for (const value of bad) {
    const r = V.checkLogo(value);
    assert.equal(r.ok, false, 'should refuse: ' + value.slice(0, 60));
  }
  assert.equal(V.checkLogo(42).ok, false);
  assert.equal(V.checkLogo({}).ok, false);

  const good = [
    PNG,
    'data:image/jpeg;base64,' + b64([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
    'data:image/gif;base64,' + b64('GIF89a\x01\x00\x01\x00'),
    'data:image/webp;base64,' + b64('RIFF\x24\x00\x00\x00WEBPVP8 '),
    'data:image/svg+xml;base64,' + b64('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),
    'data:image/svg+xml;base64,' + b64('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')
  ];
  for (const value of good) {
    const r = V.checkLogo(value);
    assert.equal(r.ok, true, 'should accept: ' + value.slice(0, 40) + ' ' + (r.reason || ''));
    assert.equal(r.value, value);
  }
  assert.deepEqual(V.checkLogo(''), { ok: true, value: '' });
  assert.deepEqual(V.checkLogo(undefined), { ok: true, value: '' });
});

test('colours: six-digit hex only, lower-cased', () => {
  assert.equal(V.validateReport({ primary: '#ABCDEF' }).state.primary, '#abcdef');
  for (const bad of ['red', '#fff', '#12345g', 'url(https://example.invalid)', '#1e40af; color: red', 7]) {
    const r = V.validateReport({ primary: bad });
    assert.equal(r.ok, false, 'should refuse colour ' + bad);
  }
});

test('engagement type: allowed values only', () => {
  for (const t of V.ENGAGEMENT_TYPES) {
    assert.equal(V.validateReport({ type: t }).ok, true);
  }
  assert.equal(V.validateReport({ type: 'External penetration test' }).ok, false);
  assert.equal(V.validateReport({ type: '' }).ok, false);
  assert.equal(V.validateReport({ type: null }).ok, true, 'null means keep the default');
});

test('findings: id, severity, cvss and cwe rules', () => {
  const ok = (f) => V.validateReport({ findings: [f] });
  assert.equal(ok({ id: 'abc-123_X', severity: 'critical' }).ok, true);
  assert.equal(ok({ id: 'a'.repeat(41), severity: 'low' }).ok, false);
  assert.equal(ok({ id: 'has space', severity: 'low' }).ok, false);
  assert.equal(ok({ id: 'x', severity: 'High' }).ok, false, 'severity is case-sensitive');
  assert.equal(ok({ id: 'x', severity: 'low', cvss: 10 }).state.findings[0].cvss, '10.0');
  assert.equal(ok({ id: 'x', severity: 'low', cvss: '10' }).state.findings[0].cvss, '10');
  assert.equal(ok({ id: 'x', severity: 'low', cvss: 7.55 }).state.findings[0].cvss, '7.6');
  assert.equal(ok({ id: 'x', severity: 'low', cvss: 11 }).ok, false);
  assert.equal(ok({ id: 'x', severity: 'low', cvss: '9.8/AV:N' }).ok, false);
  assert.equal(ok({ id: 'x', severity: 'low', cvss: NaN }).ok, false);
  assert.equal(ok({ id: 'x', severity: 'low', cvss: '' }).state.findings[0].cvss, '');
  assert.equal(ok({ id: 'x', severity: 'low', cwe: 'C'.repeat(65) }).ok, false);
  assert.equal(ok({ id: 'x', severity: 'low', title: 7 }).ok, false);
  assert.equal(ok({ id: 'x', severity: 'low', observation: ['a'] }).ok, false);
  assert.equal(V.validateReport({ findings: {} }).ok, false);
  assert.equal(V.validateReport({ findings: 'none' }).ok, false);
});

test('cleanText: controls, bidi overrides and zero-width characters go, newlines stay', () => {
  const c = (cp) => String.fromCharCode(cp);
  const dirty = 'a' + c(0x07) + 'b' + c(0x200B) + 'c' + c(0x202E) + 'd' + c(0x2066) + 'e' + c(0xFEFF) + 'f\r\ng\th' + c(0x2028) + 'i' + c(0x9F) + 'j' + c(0x7F);
  assert.equal(V.cleanText(dirty, false), 'abcdef\ng\thij');
  assert.equal(V.cleanText(dirty, true), 'abcdef g hij');
  assert.equal(V.cleanText('x\ny', true), 'x y');
  assert.equal(V.cleanText('x\n\n\ty', true), 'x y');
  // Ordinary unicode text, accents and emoji are untouched.
  const fine = 'Caf\u00e9 Ltd éè 中文 😀 <b>&amp;</b>';
  assert.equal(V.cleanText(fine, false), fine);
  // Short fields drop embedded newlines on load.
  const r = V.validateReport({ client: 'Example\nCorp' });
  assert.equal(r.state.client, 'Example Corp');
});

test('null means default, missing means default, wrong type is an error', () => {
  const r = V.validateReport({ client: null, scope: undefined, tester: 5 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ['tester must be a string']);
  const r2 = V.validateReport({ client: null, findings: null, logo: null });
  assert.equal(r2.ok, true);
  assert.equal(r2.state.client, '');
  assert.deepEqual(r2.state.findings, []);
});
