/* atarus-report-kit: page logic.
 *
 * Rules this file follows:
 * - Every value from a report file, from browser storage or from the editor
 *   reaches the page through textContent, an input's value property or a
 *   checked attribute allow-list. No HTML string sinks, no handler attributes.
 * - Report files and stored data go through ReportKitValidate before use.
 * - Nothing is written to browser storage unless the autosave switch is on.
 * - Nothing is sent over the network. The page's Content Security Policy
 *   allows only this folder's own script and stylesheet and data: images.
 */
(function () {
  'use strict';

  var V = window.ReportKitValidate;
  var STORAGE_KEY = 'atarus_report_kit_autosave_v2';
  var STORAGE_PREF_KEY = 'atarus_report_kit_autosave_on';
  var LEGACY_STORAGE_KEY = 'atarus_report_autosave'; // written unconditionally by 1.0

  var state = V.defaultState();
  var editingFindingId = null;
  var autosaveOn = false;

  var SHORT_INPUT_IDS = ['firm_name', 'footer', 'title', 'client', 'date', 'tester', 'tester_email', 'dates'];
  var TEXT_INPUT_IDS = ['scope', 'oos', 'execsum', 'strategic', 'methodology', 'conclusion', 'disclaimer'];
  var ALL_INPUT_IDS = SHORT_INPUT_IDS.concat(TEXT_INPUT_IDS);

  // ---- DOM helpers -------------------------------------------------------

  var ATTR_ALLOW = { 'class': 1, id: 1, type: 1, placeholder: 1, alt: 1, value: 1, maxlength: 1, 'data-id': 1, 'data-field': 1, title: 1, role: 1, for: 1 };

  // h('div', {class: 'x'}, 'text', childNode, ...). Strings become text
  // nodes. Attributes are limited to a fixed list; src is set only by
  // logoImage() after the data URL passed checkLogo().
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (name) {
        if (!ATTR_ALLOW[name]) throw new Error('attribute not allowed: ' + name);
        var v = attrs[name];
        if (v === undefined || v === null || v === false) return;
        el.setAttribute(name, String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(parent, child) {
    if (child === undefined || child === null || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) { append(parent, c); });
    } else if (typeof child === 'string' || typeof child === 'number') {
      parent.appendChild(document.createTextNode(String(child)));
    } else {
      parent.appendChild(child);
    }
  }

  // Text with line breaks: text nodes separated by <br> elements.
  function multiline(text) {
    var parts = String(text).split('\n');
    var out = [];
    parts.forEach(function (p, i) {
      if (i > 0) out.push(document.createElement('br'));
      out.push(p);
    });
    return out;
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function logoImage(dataUrl) {
    var check = V.checkLogo(dataUrl);
    if (!check.ok || !check.value) return null;
    var img = document.createElement('img');
    img.setAttribute('class', 'cover-logo');
    img.setAttribute('alt', 'logo');
    img.setAttribute('src', check.value);
    return img;
  }

  function setStatus(message, isError) {
    var el = byId('status');
    el.textContent = message || '';
    el.className = 'status' + (isError ? ' error' : '');
  }

  // ---- Editor -------------------------------------------------------------

  function switchTab(tab) {
    document.querySelectorAll('.nav-tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.section-panel').forEach(function (p) { p.classList.remove('active'); });
    var btn = document.querySelector('.nav-tab[data-tab="' + tab + '"]');
    var panel = byId('panel-' + tab);
    if (btn) btn.classList.add('active');
    if (panel) panel.classList.add('active');
    if (tab === 'findings') renderFindingsList();
  }

  function readEditorIntoState() {
    SHORT_INPUT_IDS.forEach(function (id) {
      var el = byId('f_' + id);
      if (el) state[id] = V.cleanText(el.value, true).slice(0, V.LIMITS.MAX_SHORT);
    });
    TEXT_INPUT_IDS.forEach(function (id) {
      var el = byId('f_' + id);
      if (el) state[id] = V.cleanText(el.value, false).slice(0, V.LIMITS.MAX_TEXT);
    });
    var typeEl = byId('f_type');
    if (typeEl && V.ENGAGEMENT_TYPES.indexOf(typeEl.value) !== -1) state.type = typeEl.value;
  }

  function render() {
    readEditorIntoState();
    renderReport();
    autoSave();
  }

  function applyColors() {
    document.documentElement.style.setProperty('--primary', state.primary);
    document.documentElement.style.setProperty('--accent', state.accent);
  }

  function updateColors() {
    var p = byId('f_primary').value;
    var a = byId('f_accent').value;
    if (/^#[0-9a-fA-F]{6}$/.test(p)) state.primary = p.toLowerCase();
    if (/^#[0-9a-fA-F]{6}$/.test(a)) state.accent = a.toLowerCase();
    applyColors();
    renderReport();
    autoSave();
  }

  function loadStateToUI() {
    ALL_INPUT_IDS.forEach(function (id) {
      var el = byId('f_' + id);
      if (el) el.value = state[id];
    });
    byId('f_type').value = state.type;
    byId('f_primary').value = state.primary;
    byId('f_accent').value = state.accent;
    applyColors();
    renderFindingsList();
  }

  // ---- Report preview -----------------------------------------------------

  var SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

  function sortedFindings() {
    return state.findings.slice().sort(function (a, b) {
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    });
  }

  function section(title) {
    var el = h('div', { 'class': 'report-section' }, h('h2', null, title));
    for (var i = 1; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function metaItem(label, value) {
    return h('div', { 'class': 'meta-item' },
      h('div', { 'class': 'meta-label' }, label),
      h('div', { 'class': 'meta-value' }, value));
  }

  function sevTag(sev) {
    return h('span', { 'class': 'sev-tag ' + sev }, sev.toUpperCase());
  }

  function findingSection(label, text, bodyClass) {
    return h('div', { 'class': 'finding-report-section' },
      h('div', { 'class': 'finding-report-label' }, label),
      h('div', { 'class': bodyClass || 'finding-report-body' }, text));
  }

  function renderReport() {
    var r = byId('report');
    clear(r);

    var counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    state.findings.forEach(function (f) { counts[f.severity]++; });
    var ordered = sortedFindings();

    var cover = h('div', { 'class': 'cover report-page' });
    append(cover, logoImage(state.logo));
    append(cover, h('div', { 'class': 'cover-title' }, state.title || 'Penetration Test Report'));
    if (state.client) append(cover, h('div', { 'class': 'cover-subtitle' }, 'Prepared for ' + state.client));
    var meta = h('div', { 'class': 'cover-meta' });
    if (state.date) append(meta, h('div', null, h('strong', null, 'Report Date:'), ' ' + state.date));
    if (state.type) append(meta, h('div', null, h('strong', null, 'Engagement:'), ' ' + state.type));
    if (state.dates) append(meta, h('div', null, h('strong', null, 'Testing Dates:'), ' ' + state.dates));
    if (state.tester) {
      append(meta, h('div', null, h('strong', null, 'Lead Tester:'), ' ' + state.tester + (state.tester_email ? ' (' + state.tester_email + ')' : '')));
    }
    append(cover, meta);
    if (state.firm_name) append(cover, h('div', { 'class': 'cover-firm' }, state.firm_name));
    append(r, cover);

    if (state.disclaimer) {
      append(r, section('Disclaimer', h('div', { 'class': 'disclaimer-box' }, multiline(state.disclaimer))));
    }

    var overview = section('Engagement Overview');
    var grid = h('div', { 'class': 'meta-grid' });
    if (state.client) append(grid, metaItem('Client', state.client));
    if (state.type) append(grid, metaItem('Engagement Type', state.type));
    if (state.dates) append(grid, metaItem('Testing Dates', state.dates));
    if (state.tester) append(grid, metaItem('Lead Tester', state.tester));
    append(overview, grid);
    if (state.scope) append(overview, [h('h3', null, 'Scope'), h('p', null, multiline(state.scope))]);
    if (state.oos) append(overview, [h('h3', null, 'Out of Scope'), h('p', null, multiline(state.oos))]);
    append(r, overview);

    if (state.execsum) append(r, section('Executive Summary', h('p', null, multiline(state.execsum))));

    var summary = h('div', { 'class': 'summary-grid' });
    V.SEVERITIES.forEach(function (sev) {
      append(summary, h('div', { 'class': 'sev-card ' + sev },
        h('div', { 'class': 'count' }, counts[sev]),
        h('div', { 'class': 'label' }, sev.charAt(0).toUpperCase() + sev.slice(1))));
    });
    append(r, section('Summary of Results', summary));

    if (state.strategic) append(r, section('Strategic Recommendations', h('p', null, multiline(state.strategic))));

    var ratings = [
      ['critical', 'Critical', 'Direct, unauthenticated path to sensitive data or full system compromise. Immediate risk of breach. Fix within 24-72 hours.'],
      ['high', 'High', 'Significant security weakness that enables major compromise with moderate effort. Fix within 1-2 weeks.'],
      ['medium', 'Medium', 'Security issue with meaningful impact but requires specific conditions or chained vulnerabilities. Fix within 30 days.'],
      ['low', 'Low', 'Minor security weakness with limited direct impact. Fix as part of normal maintenance.'],
      ['info', 'Info', 'Informational finding with no direct security impact. Included for context or hardening recommendations.']
    ];
    var ratingBody = h('tbody');
    ratings.forEach(function (row) {
      append(ratingBody, h('tr', null,
        h('td', null, h('span', { 'class': 'sev-tag ' + row[0] }, row[1])),
        h('td', null, row[2])));
    });
    append(r, section('Risk Rating Methodology',
      h('table', { 'class': 'risk-rating-table' },
        h('thead', null, h('tr', null, h('th', null, 'Severity'), h('th', null, 'Description'))),
        ratingBody)));

    if (state.findings.length > 0) {
      var tbody = h('tbody');
      ordered.forEach(function (f) {
        var firstLine = (f.observation || '').split('\n')[0].substring(0, 150);
        var more = (f.observation || '').length > 150 ? '...' : '';
        append(tbody, h('tr', null,
          h('td', null, sevTag(f.severity)),
          h('td', null, h('strong', null, f.title)),
          h('td', null, firstLine + more)));
      });
      append(r, section('Summary of Findings',
        h('table', { 'class': 'findings-table' },
          h('thead', null, h('tr', null,
            h('th', { 'class': 'col-severity' }, 'Severity'),
            h('th', null, 'Finding'),
            h('th', { 'class': 'col-summary' }, 'Summary'))),
          tbody)));

      var detailed = section('Detailed Findings');
      ordered.forEach(function (f) {
        var card = h('div', { 'class': 'finding-report-card sev-' + f.severity });
        append(card, h('div', { 'class': 'finding-report-title' }, f.title));
        var fm = h('div', { 'class': 'finding-report-meta' }, sevTag(f.severity));
        if (f.cvss) append(fm, h('span', { 'class': 'meta-badge' }, 'CVSS ' + f.cvss));
        if (f.cwe) append(fm, h('span', { 'class': 'meta-badge' }, f.cwe));
        append(card, fm);
        if (f.affected) {
          var hosts = h('div', { 'class': 'host-tags' });
          f.affected.split('\n').forEach(function (line) {
            var host = line.trim();
            if (host) append(hosts, h('span', { 'class': 'host-tag' }, host));
          });
          append(card, hosts);
        }
        if (f.observation) append(card, findingSection('Observation', f.observation));
        if (f.risk) append(card, findingSection('Risk', f.risk));
        if (f.recommendation) append(card, findingSection('Recommendation', f.recommendation));
        if (f.evidence) append(card, findingSection('Evidence', f.evidence, 'evidence-code'));
        if (f.references) append(card, findingSection('References', multiline(f.references)));
        append(detailed, card);
      });
      append(r, detailed);
    }

    if (state.methodology) append(r, section('Methodology', h('p', null, multiline(state.methodology))));
    if (state.conclusion) append(r, section('Conclusion', h('p', null, multiline(state.conclusion))));
    append(r, h('div', { 'class': 'report-footer' }, state.footer));
  }

  // ---- Findings editor ----------------------------------------------------

  function newFindingId() {
    var id = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    while (state.findings.some(function (f) { return f.id === id; })) id += 'x';
    return id;
  }

  function addFinding() {
    var f = V.defaultFinding(newFindingId());
    state.findings.push(f);
    editFinding(f.id);
    renderReport();
    autoSave();
  }

  function findingById(id) {
    for (var i = 0; i < state.findings.length; i++) {
      if (state.findings[i].id === id) return state.findings[i];
    }
    return null;
  }

  function field(labelText, control, help) {
    var wrap = h('div', { 'class': 'field' }, h('label', null, labelText), control);
    if (help) append(wrap, h('div', { 'class': 'help' }, help));
    return wrap;
  }

  function textInput(id, fieldName, value, placeholder, maxlength) {
    var input = h('input', { type: 'text', id: id, placeholder: placeholder, maxlength: maxlength || V.LIMITS.MAX_SHORT });
    input.value = value;
    input.addEventListener('input', function () { updateFinding(fieldName, input.value, true); });
    return input;
  }

  function textArea(id, fieldName, value, placeholder, tall) {
    var ta = h('textarea', { id: id, placeholder: placeholder, maxlength: V.LIMITS.MAX_TEXT, 'class': tall ? 'tall' : null });
    ta.value = value;
    ta.addEventListener('input', function () { updateFinding(fieldName, ta.value, false); });
    return ta;
  }

  function editFinding(id) {
    editingFindingId = id;
    renderFindingsList();
    var f = findingById(id);
    var panel = byId('finding-edit-panel');
    clear(panel);
    if (!f) {
      panel.className = 'finding-edit-panel';
      return;
    }
    panel.className = 'finding-edit-panel active';

    var severity = h('select', { id: 'fe_severity' });
    V.SEVERITIES.forEach(function (sev) {
      var opt = h('option', { value: sev }, sev.charAt(0).toUpperCase() + sev.slice(1));
      if (f.severity === sev) opt.selected = true;
      append(severity, opt);
    });
    severity.addEventListener('change', function () {
      if (V.SEVERITIES.indexOf(severity.value) !== -1) updateFinding('severity', severity.value, true);
    });

    var cvss = textInput('fe_cvss', 'cvss', f.cvss, 'e.g. 9.8', 4);

    append(panel, field('Title', textInput('fe_title', 'title', f.title, ''),
      ['Make titles specific and actionable. Good: ', h('code', null, 'SQL Injection in Login Form'), '. Bad: ', h('code', null, 'Security Issue'), '.']));
    append(panel, h('div', { 'class': 'field-row' },
      field('Severity', severity),
      field('CVSS Score (Optional)', cvss)));
    append(panel, field('CWE ID (Optional)', textInput('fe_cwe', 'cwe', f.cwe, 'e.g. CWE-89', 64),
      ['Common Weakness Enumeration ID. Look up at ', h('code', null, 'cwe.mitre.org'), '. Helps clients categorize the weakness.']));
    append(panel, field('Affected Systems', textArea('fe_affected', 'affected', f.affected, 'app.acme.com\napi.acme.com'),
      'One host or URL per line. These render as tags in the report.'));
    append(panel, field('Observation', textArea('fe_obs', 'observation', f.observation, 'Describe WHAT you found. Be specific and factual.', true),
      [h('strong', null, 'What goes here:'), ' The technical details of what exists. ', h('code', null, '"The login form at /auth/login accepts SQL metacharacters in the username parameter, enabling injection into the database query."'), document.createElement('br'), document.createElement('br'), h('strong', null, 'What does NOT go here:'), ' Why it matters. Save that for Risk.']));
    append(panel, field('Risk', textArea('fe_risk', 'risk', f.risk, "What's the worst that could happen?", true),
      [h('strong', null, 'Answer the question:'), ' "If nobody fixes this, what\'s the worst that could happen?"', document.createElement('br'), document.createElement('br'), h('strong', null, 'Good Risk statement:'), ' ', h('code', null, '"An attacker can bypass authentication, extract the full user database including password hashes, and potentially pivot to internal systems using stolen credentials."')]));
    append(panel, field('Recommendation', textArea('fe_rec', 'recommendation', f.recommendation, 'How to fix it', true),
      [h('strong', null, 'Be specific and actionable.'), " Don't say ", h('code', null, '"use secure coding practices"'), '. Say ', h('code', null, '"Replace the string concatenation in LoginService.java:45 with parameterized queries using PreparedStatement."')]));
    append(panel, field('Evidence (Optional)', textArea('fe_ev', 'evidence', f.evidence, 'Request/response, command output, screenshot description'),
      'Raw proof. HTTP requests, responses, terminal output, or a description of the screenshot you took. Renders as a code block in the report.'));
    append(panel, field('References (Optional)', textArea('fe_ref', 'references', f.references, 'https://owasp.org/www-community/attacks/SQL_Injection\nhttps://cwe.mitre.org/data/definitions/89.html'),
      'One URL per line, shown as text. Links to OWASP, CWE, CVE, or vendor advisories help the client understand the issue.'));

    var del = h('button', { 'class': 'btn danger', type: 'button' }, 'Delete Finding');
    del.addEventListener('click', function () { deleteFinding(id); });
    var close = h('button', { 'class': 'btn', type: 'button' }, 'Close');
    close.addEventListener('click', closeFindingEdit);
    append(panel, h('div', { 'class': 'panel-actions' }, del, close));
  }

  function updateFinding(fieldName, value, singleLine) {
    var f = findingById(editingFindingId);
    if (!f) return;
    if (fieldName === 'severity') {
      f.severity = value;
    } else {
      var max = singleLine ? V.LIMITS.MAX_SHORT : V.LIMITS.MAX_TEXT;
      f[fieldName] = V.cleanText(value, singleLine).slice(0, max);
    }
    renderFindingsList();
    renderReport();
    autoSave();
  }

  function deleteFinding(id) {
    if (!window.confirm('Delete this finding?')) return;
    state.findings = state.findings.filter(function (f) { return f.id !== id; });
    editingFindingId = null;
    var panel = byId('finding-edit-panel');
    clear(panel);
    panel.className = 'finding-edit-panel';
    renderFindingsList();
    renderReport();
    autoSave();
  }

  function closeFindingEdit() {
    editingFindingId = null;
    var panel = byId('finding-edit-panel');
    clear(panel);
    panel.className = 'finding-edit-panel';
    renderFindingsList();
  }

  function renderFindingsList() {
    var list = byId('findings-list');
    clear(list);
    if (state.findings.length === 0) {
      append(list, h('div', { 'class': 'empty-state compact' }, 'No findings yet. Click the button below to add your first.'));
      return;
    }
    sortedFindings().forEach(function (f) {
      var item = h('div', { 'class': 'finding-item sev-' + f.severity + (editingFindingId === f.id ? ' editing' : ''), 'data-id': f.id },
        h('div', { 'class': 'finding-item-title' }, f.title),
        h('div', { 'class': 'finding-item-meta' },
          h('span', { 'class': 'sev-pill ' + f.severity }, f.severity),
          f.cvss ? h('span', null, 'CVSS ' + f.cvss) : null));
      item.addEventListener('click', function () { editFinding(f.id); });
      append(list, item);
    });
  }

  // ---- Logo ---------------------------------------------------------------

  function handleLogo(event) {
    var file = event.target.files[0];
    if (!file) return;
    if (file.size > V.LIMITS.MAX_LOGO_BYTES) {
      setStatus('Logo not loaded: the file is larger than 500 KB.', true);
      event.target.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      var check = V.checkLogo(e.target.result);
      if (!check.ok) {
        setStatus('Logo not loaded: ' + check.reason + '.', true);
        event.target.value = '';
        return;
      }
      state.logo = check.value;
      setStatus('Logo loaded.');
      renderReport();
      autoSave();
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    state.logo = '';
    byId('f_logo').value = '';
    setStatus('Logo removed.');
    renderReport();
    autoSave();
  }

  // ---- Save and load ------------------------------------------------------

  function saveFile() {
    readEditorIntoState();
    var data = JSON.stringify(state, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var filename = (state.client || 'report').toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + new Date().toISOString().split('T')[0] + '.json';
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setStatus('Saved ' + filename + '.');
  }

  // The one path by which outside data becomes the current report.
  // Returns the validation result so callers (and the browser test) can
  // see why a file was refused.
  function loadReportText(text, sourceLabel) {
    var result = V.parseReportText(text);
    if (!result.ok) {
      var shown = result.errors.slice(0, 3).join('; ');
      var more = result.errors.length > 3 ? ' (and ' + (result.errors.length - 3) + ' more)' : '';
      setStatus('Report not loaded from ' + sourceLabel + ': ' + shown + more + '.', true);
      return result;
    }
    state = result.state;
    editingFindingId = null;
    closeFindingEdit();
    loadStateToUI();
    renderReport();
    autoSave();
    var note = result.ignored.length ? ' Ignored unknown fields: ' + result.ignored.slice(0, 5).join(', ') + '.' : '';
    setStatus('Loaded ' + sourceLabel + '.' + note);
    return result;
  }

  function handleFile(event) {
    var file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    if (file.size > V.LIMITS.MAX_FILE_BYTES) {
      setStatus('Report not loaded: the file is larger than 2 MB.', true);
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) { loadReportText(e.target.result, 'file'); };
    reader.readAsText(file);
  }

  // ---- Browser storage (opt-in) --------------------------------------------

  function storage() {
    try {
      return window.localStorage;
    } catch (e) {
      return null;
    }
  }

  function autoSave() {
    if (!autosaveOn) return;
    var s = storage();
    if (!s) return;
    try {
      s.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      setStatus('Autosave failed: browser storage is full or unavailable.', true);
    }
  }

  function setAutosave(on, fromUser) {
    autosaveOn = !!on;
    byId('autosave_toggle').checked = autosaveOn;
    var s = storage();
    if (!s) {
      if (fromUser) setStatus('Browser storage is not available here.', true);
      autosaveOn = false;
      byId('autosave_toggle').checked = false;
      return;
    }
    try {
      if (autosaveOn) {
        s.setItem(STORAGE_PREF_KEY, '1');
        autoSave();
        if (fromUser) setStatus('Autosave on. The report is kept in this browser until you turn it off or clear it.');
      } else {
        s.removeItem(STORAGE_PREF_KEY);
        s.removeItem(STORAGE_KEY);
        if (fromUser) setStatus('Autosave off. The saved copy was removed from this browser.');
      }
    } catch (e) {
      setStatus('Browser storage could not be changed.', true);
    }
  }

  function clearStorage() {
    var s = storage();
    if (s) {
      try {
        s.removeItem(STORAGE_KEY);
        s.removeItem(STORAGE_PREF_KEY);
        s.removeItem(LEGACY_STORAGE_KEY);
      } catch (e) { /* nothing to clear */ }
    }
    autosaveOn = false;
    byId('autosave_toggle').checked = false;
    setStatus('Browser storage for this page cleared. Autosave is off.');
  }

  // Offers a stored report (new key, or the one 1.0 wrote without asking),
  // after validating it. The legacy key is removed either way.
  function tryAutoLoad() {
    var s = storage();
    if (!s) return;
    var pref = null;
    var saved = null;
    var legacy = null;
    try {
      pref = s.getItem(STORAGE_PREF_KEY);
      saved = s.getItem(STORAGE_KEY);
      legacy = s.getItem(LEGACY_STORAGE_KEY);
    } catch (e) {
      return;
    }
    autosaveOn = pref === '1';
    byId('autosave_toggle').checked = autosaveOn;

    var text = null;
    var label = '';
    if (autosaveOn && saved) {
      text = saved;
      label = 'the autosaved copy in this browser';
    } else if (legacy) {
      text = legacy;
      label = 'the copy saved by version 1.0 in this browser';
    }
    if (text === null) return;

    var result = V.parseReportText(text);
    if (!result.ok) {
      setStatus('A stored report was found but could not be read and was ignored: ' + result.errors[0] + '.', true);
    } else if (window.confirm('Load ' + label + '?')) {
      state = result.state;
      setStatus('Loaded ' + label + '.');
    }
    if (legacy) {
      try { s.removeItem(LEGACY_STORAGE_KEY); } catch (e) { /* ignore */ }
    }
  }

  // ---- Wiring -------------------------------------------------------------

  function on(id, eventName, handler) {
    var el = byId(id);
    if (el) el.addEventListener(eventName, handler);
  }

  function init() {
    byId('version').textContent = 'v' + V.VERSION;

    document.querySelectorAll('.nav-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.getAttribute('data-tab')); });
    });
    ALL_INPUT_IDS.forEach(function (id) { on('f_' + id, 'input', render); });
    on('f_type', 'change', render);
    on('f_primary', 'input', updateColors);
    on('f_accent', 'input', updateColors);
    on('f_logo', 'change', handleLogo);
    on('btn_remove_logo', 'click', removeLogo);
    on('btn_add_finding', 'click', addFinding);
    on('btn_open', 'click', function () { byId('fileInput').click(); });
    on('fileInput', 'change', handleFile);
    on('btn_save', 'click', saveFile);
    on('btn_print', 'click', function () { window.print(); });
    on('autosave_toggle', 'change', function (e) { setAutosave(e.target.checked, true); });
    on('btn_clear_storage', 'click', clearStorage);

    tryAutoLoad();
    if (!state.date) {
      state.date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    loadStateToUI();
    renderReport();
    autoSave();
  }

  // Small public surface, used by the headless browser test.
  window.ReportKit = {
    version: V.VERSION,
    loadReportText: loadReportText,
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    isAutosaveOn: function () { return autosaveOn; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
