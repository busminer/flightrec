'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const landingPath = path.join(__dirname, '..', 'docs', 'index.html');

test('landing page is self-contained and includes the install command', () => {
  assert.equal(fs.existsSync(landingPath), true);
  const html = fs.readFileSync(landingPath, 'utf8');

  assert.match(html, /npm install -g flightrec/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=\s*["'](?!data:)/i);
  assert.doesNotMatch(html, /<link\b[^>]*\bhref\s*=\s*["'](?!data:)/i);
  assert.doesNotMatch(html, /<img\b[^>]*\bsrc\s*=\s*["'](?!data:)/i);
});
