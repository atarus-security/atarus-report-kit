/* atarus-report-kit: report file validation and text cleaning.
 *
 * Everything a report JSON file (or the browser's own storage) can contain
 * passes through here before the page uses it. The result is a fresh object
 * with only the known fields, each checked for type, length and allowed
 * values. Unknown fields are dropped. Anything that fails is refused as a
 * whole, with a list of reasons, so a partly loaded report never appears.
 *
 * Works as a plain browser script (window.ReportKitValidate) and as a
 * CommonJS module for the node:test suite. No dependencies.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  } else {
    root.ReportKitValidate = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.1.0';

  var LIMITS = Object.freeze({
    MAX_FILE_BYTES: 2000000,     // a report file larger than this is not parsed
    MAX_SHORT: 200,              // single-line fields
    MAX_TEXT: 100000,            // multi-line fields (evidence, methodology, ...)
    MAX_FINDINGS: 500,
    MAX_LOGO_BYTES: 500000,      // decoded image size
    MAX_LOGO_CHARS: 700000       // the data URL itself (base64 of 500 KB plus the header)
  });

  var SEVERITIES = Object.freeze(['critical', 'high', 'medium', 'low', 'info']);

  var ENGAGEMENT_TYPES = Object.freeze([
    'External Penetration Test',
    'Internal Penetration Test',
    'Web Application Penetration Test',
    'API Security Assessment',
    'Mobile Application Assessment',
    'Cloud Security Assessment',
    'Network Vulnerability Assessment',
    'Social Engineering Assessment',
    'Wireless Network Assessment',
    'Red Team Engagement'
  ]);

  var LOGO_TYPES = Object.freeze(['png', 'jpeg', 'gif', 'webp', 'svg+xml']);

  // Single-line text fields and their maximum length.
  var SHORT_FIELDS = Object.freeze({
    firm_name: LIMITS.MAX_SHORT,
    footer: LIMITS.MAX_SHORT,
    title: LIMITS.MAX_SHORT,
    client: LIMITS.MAX_SHORT,
    date: LIMITS.MAX_SHORT,
    tester: LIMITS.MAX_SHORT,
    tester_email: LIMITS.MAX_SHORT,
    dates: LIMITS.MAX_SHORT
  });

  // Multi-line text fields.
  var TEXT_FIELDS = Object.freeze([
    'scope', 'oos', 'execsum', 'strategic', 'methodology', 'conclusion', 'disclaimer'
  ]);

  var FINDING_SHORT_FIELDS = Object.freeze({ title: LIMITS.MAX_SHORT, cwe: 64 });
  var FINDING_TEXT_FIELDS = Object.freeze([
    'affected', 'observation', 'risk', 'recommendation', 'evidence', 'references'
  ]);

  var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  var COLOR_RE = /^#[0-9a-fA-F]{6}$/;
  var CVSS_RE = /^(?:10(?:\.0)?|[0-9](?:\.[0-9])?)$/;
  var LOGO_RE = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/;

  // C0 and C1 controls except tab and newline, zero-width and bidi format
  // characters (which can hide or reorder text in a printed report), BOM.
  // Built from code points so the source stays plain ASCII.
  var CONTROL_RE = (function () {
    function ch(cp) { return String.fromCharCode(cp); }
    function range(a, b) { return ch(a) + '-' + ch(b); }
    var cls = range(0x0000, 0x0008) + ch(0x000B) + ch(0x000C) + range(0x000E, 0x001F) + range(0x007F, 0x009F) +
      range(0x200B, 0x200F) + ch(0x2028) + ch(0x2029) + range(0x202A, 0x202E) + range(0x2066, 0x2069) + ch(0xFEFF);
    return new RegExp('[' + cls + ']', 'g');
  })();

  function defaultState() {
    return {
      firm_name: '',
      logo: '',
      primary: '#1e40af',
      accent: '#dc2626',
      footer: 'Confidential - Do Not Distribute',
      title: 'Penetration Test Report',
      client: '',
      date: '',
      tester: '',
      tester_email: '',
      type: 'External Penetration Test',
      dates: '',
      scope: '',
      oos: '',
      execsum: '',
      strategic: '',
      methodology: 'Testing followed the Penetration Testing Execution Standard (PTES) methodology, covering the following phases:\n\n1. Pre-engagement and scoping\n2. Intelligence gathering\n3. Threat modeling\n4. Vulnerability analysis\n5. Exploitation\n6. Post-exploitation\n7. Reporting\n\nAll testing was conducted against systems explicitly authorized in the Rules of Engagement. Exploitation was limited to validation of vulnerabilities; no destructive actions were taken.',
      conclusion: '',
      disclaimer: 'This report contains confidential information intended solely for the named client. Unauthorized distribution or reproduction is prohibited. Findings reflect the state of tested systems during the engagement timeframe only and may not represent the current state.\n\nPenetration testing cannot guarantee the discovery of all vulnerabilities. Systems, configurations, and threats change rapidly. This report should be read in conjunction with other security assessments and is not a substitute for a comprehensive security program.\n\nRecommendations in this report are advisory. Clients should evaluate them in the context of their own risk tolerance, business requirements, and regulatory obligations.',
      findings: []
    };
  }

  function defaultFinding(id) {
    return {
      id: id,
      title: 'New Finding',
      severity: 'medium',
      cvss: '',
      cwe: '',
      affected: '',
      observation: '',
      risk: '',
      recommendation: '',
      evidence: '',
      references: ''
    };
  }

  // Normalises line endings and strips control and format characters.
  // Single-line fields also lose their line breaks and tabs.
  function cleanText(value, singleLine) {
    var s = String(value).replace(/\r\n?/g, '\n').replace(CONTROL_RE, '');
    if (singleLine) s = s.replace(/[\n\t]+/g, ' ');
    return s;
  }

  var B64 = (function () {
    var table = {};
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (var i = 0; i < chars.length; i++) table[chars[i]] = i;
    return table;
  })();

  // Decodes the first `count` bytes of a base64 string into an array of
  // byte values. Enough for a magic-number check; no full decode needed.
  function decodePrefix(b64, count) {
    var out = [];
    var buffer = 0;
    var bits = 0;
    for (var i = 0; i < b64.length && out.length < count; i++) {
      var c = b64[i];
      if (c === '=') break;
      var v = B64[c];
      if (v === undefined) return null;
      buffer = (buffer << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((buffer >> bits) & 0xff);
      }
    }
    return out;
  }

  function startsWithBytes(bytes, expected) {
    if (bytes.length < expected.length) return false;
    for (var i = 0; i < expected.length; i++) {
      if (expected[i] !== null && bytes[i] !== expected[i]) return false;
    }
    return true;
  }

  var MAGIC = {
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    jpeg: [0xff, 0xd8, 0xff],
    gif: [0x47, 0x49, 0x46, 0x38],                                 // GIF8
    webp: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50] // RIFF....WEBP
  };

  // A logo is accepted only as a base64 data URL whose declared image type
  // matches the bytes, within the size limits. Anything else (an http URL,
  // a javascript: URL, a quote that would end the attribute, a text file
  // renamed to .png) is refused.
  function checkLogo(value) {
    if (value === '' || value === undefined || value === null) return { ok: true, value: '' };
    if (typeof value !== 'string') return { ok: false, reason: 'logo must be a string' };
    if (value.length > LIMITS.MAX_LOGO_CHARS) return { ok: false, reason: 'logo data URL is longer than ' + LIMITS.MAX_LOGO_CHARS + ' characters' };
    var m = LOGO_RE.exec(value);
    if (!m) return { ok: false, reason: 'logo must be a base64 data URL of type image/png, image/jpeg, image/gif, image/webp or image/svg+xml' };
    var type = m[1];
    var b64 = m[2];
    var decodedBytes = Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
    if (decodedBytes > LIMITS.MAX_LOGO_BYTES) return { ok: false, reason: 'logo image is larger than ' + LIMITS.MAX_LOGO_BYTES + ' bytes' };
    var head = decodePrefix(b64, 64);
    if (!head || head.length === 0) return { ok: false, reason: 'logo base64 data could not be decoded' };
    if (type === 'svg+xml') {
      var text = '';
      for (var i = 0; i < head.length; i++) text += String.fromCharCode(head[i]);
      text = text.replace(/^\xEF\xBB\xBF/, '').replace(/^\s+/, '');
      if (!/^<(\?xml|svg|!--|!DOCTYPE)/i.test(text)) return { ok: false, reason: 'logo declared as SVG does not start with an XML or svg tag' };
    } else if (!startsWithBytes(head, MAGIC[type])) {
      return { ok: false, reason: 'logo bytes do not match the declared image type ' + type };
    }
    return { ok: true, value: value };
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  // Reads a string field with a length limit. Missing, null or undefined
  // means "keep the default". Any other type, or an over-long value, is an
  // error.
  function readString(src, key, max, singleLine, errors, label) {
    if (!hasOwn(src, key) || src[key] === null || src[key] === undefined) return undefined;
    var v = src[key];
    if (typeof v !== 'string') {
      errors.push(label + ' must be a string');
      return undefined;
    }
    if (v.length > max) {
      errors.push(label + ' is longer than ' + max + ' characters');
      return undefined;
    }
    return cleanText(v, singleLine);
  }

  function readColor(src, key, errors) {
    if (!hasOwn(src, key) || src[key] === null || src[key] === undefined) return undefined;
    var v = src[key];
    if (typeof v !== 'string' || !COLOR_RE.test(v)) {
      errors.push(key + ' must be a colour like #1e40af');
      return undefined;
    }
    return v.toLowerCase();
  }

  function readCvss(src, errors, label) {
    if (!hasOwn(src, 'cvss') || src.cvss === null || src.cvss === undefined || src.cvss === '') return '';
    var v = src.cvss;
    if (typeof v === 'number') {
      if (!isFinite(v) || v < 0 || v > 10) {
        errors.push(label + ' cvss must be between 0 and 10');
        return undefined;
      }
      v = (Math.round(v * 10) / 10).toFixed(1);
    }
    if (typeof v !== 'string' || v.length > 4 || !CVSS_RE.test(v)) {
      errors.push(label + ' cvss must be a score like 9.8');
      return undefined;
    }
    return v;
  }

  function validateFinding(src, index, errors) {
    var label = 'finding ' + (index + 1);
    if (!isPlainObject(src)) {
      errors.push(label + ' must be an object');
      return null;
    }
    var out = defaultFinding('');

    if (!hasOwn(src, 'id') || typeof src.id !== 'string' || !ID_RE.test(src.id)) {
      errors.push(label + ' id must be 1 to 40 letters, digits, - or _');
    } else {
      out.id = src.id;
    }

    if (!hasOwn(src, 'severity') || SEVERITIES.indexOf(src.severity) === -1) {
      errors.push(label + ' severity must be one of ' + SEVERITIES.join(', '));
    } else {
      out.severity = src.severity;
    }

    var cvss = readCvss(src, errors, label);
    if (cvss !== undefined) out.cvss = cvss;

    Object.keys(FINDING_SHORT_FIELDS).forEach(function (key) {
      var v = readString(src, key, FINDING_SHORT_FIELDS[key], true, errors, label + ' ' + key);
      if (v !== undefined) out[key] = v;
    });
    FINDING_TEXT_FIELDS.forEach(function (key) {
      var v = readString(src, key, LIMITS.MAX_TEXT, false, errors, label + ' ' + key);
      if (v !== undefined) out[key] = v;
    });
    return out;
  }

  // Validates a parsed report object. Returns { ok, state, errors, ignored }.
  // On failure state is null and nothing from the input is kept.
  function validateReport(input) {
    var errors = [];
    var ignored = [];
    if (!isPlainObject(input)) {
      return { ok: false, state: null, errors: ['report must be a JSON object'], ignored: ignored };
    }
    var state = defaultState();
    var known = Object.keys(state);

    Object.keys(input).forEach(function (key) {
      if (known.indexOf(key) === -1) ignored.push(key);
    });

    Object.keys(SHORT_FIELDS).forEach(function (key) {
      var v = readString(input, key, SHORT_FIELDS[key], true, errors, key);
      if (v !== undefined) state[key] = v;
    });
    TEXT_FIELDS.forEach(function (key) {
      var v = readString(input, key, LIMITS.MAX_TEXT, false, errors, key);
      if (v !== undefined) state[key] = v;
    });

    var primary = readColor(input, 'primary', errors);
    if (primary !== undefined) state.primary = primary;
    var accent = readColor(input, 'accent', errors);
    if (accent !== undefined) state.accent = accent;

    if (hasOwn(input, 'type') && input.type !== null && input.type !== undefined) {
      if (ENGAGEMENT_TYPES.indexOf(input.type) === -1) {
        errors.push('type must be one of the engagement types offered by the page');
      } else {
        state.type = input.type;
      }
    }

    if (hasOwn(input, 'logo') && input.logo !== null && input.logo !== undefined) {
      var logo = checkLogo(input.logo);
      if (logo.ok) state.logo = logo.value; else errors.push(logo.reason);
    }

    if (hasOwn(input, 'findings') && input.findings !== null && input.findings !== undefined) {
      if (!Array.isArray(input.findings)) {
        errors.push('findings must be an array');
      } else if (input.findings.length > LIMITS.MAX_FINDINGS) {
        errors.push('more than ' + LIMITS.MAX_FINDINGS + ' findings');
      } else {
        var seen = {};
        input.findings.forEach(function (f, i) {
          var out = validateFinding(f, i, errors);
          if (!out) return;
          if (out.id) {
            if (hasOwn(seen, out.id)) errors.push('finding ' + (i + 1) + ' repeats id ' + out.id);
            seen[out.id] = true;
          }
          state.findings.push(out);
        });
      }
    }

    if (errors.length) return { ok: false, state: null, errors: errors, ignored: ignored };
    return { ok: true, state: state, errors: errors, ignored: ignored };
  }

  // Parses report JSON text with a size check first. Same return shape.
  function parseReportText(text) {
    if (typeof text !== 'string') return { ok: false, state: null, errors: ['report text must be a string'], ignored: [] };
    if (text.length > LIMITS.MAX_FILE_BYTES) return { ok: false, state: null, errors: ['report file is larger than ' + LIMITS.MAX_FILE_BYTES + ' bytes'], ignored: [] };
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, state: null, errors: ['report is not valid JSON'], ignored: [] };
    }
    return validateReport(data);
  }

  return {
    VERSION: VERSION,
    LIMITS: LIMITS,
    SEVERITIES: SEVERITIES,
    ENGAGEMENT_TYPES: ENGAGEMENT_TYPES,
    LOGO_TYPES: LOGO_TYPES,
    defaultState: defaultState,
    defaultFinding: defaultFinding,
    cleanText: cleanText,
    checkLogo: checkLogo,
    validateFinding: validateFinding,
    validateReport: validateReport,
    parseReportText: parseReportText
  };
});
