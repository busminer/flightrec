'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { formatSessionList, main } = require('../bin/flightrec');

const fixtures = path.join(__dirname, 'fixtures');

test('formatSessionList renders all required columns and values', () => {
  const output = formatSessionList([{
    meta: {
      timestamp: '2026-07-15T12:00:00.000Z',
      id: '123e4567-e89b-12d3-a456-426614174000',
      originator: 'Codex Desktop',
      cwd: 'C:\\work\\healthy',
      durationMs: 300000,
      approxTokens: 2500,
    },
    turns: [{}, {}],
  }]);

  assert.match(output, /^DATE\s+ID\s+ORIGINATOR\s+CWD\s+TURNS\s+DURATION\s+TOKENS/m);
  assert.match(output, /2026-07-15 12:00\s+123e4567\s+Codex Desktop\s+C:\\work\\healthy\s+2\s+5m 0s\s+2\.5k/);
});

test('list hides subagents by default and --all includes them', async () => {
  const defaultLines = [];
  const defaultCode = await main(['list', '--dir', fixtures], {
    log: (value) => defaultLines.push(value),
    error: (value) => defaultLines.push(value),
  });
  assert.equal(defaultCode, 0);
  assert.match(defaultLines[0], /123e4567/);
  assert.match(defaultLines[0], /223e4567/);
  assert.doesNotMatch(defaultLines[0], /323e4567/);

  const allLines = [];
  const allCode = await main(['list', '--dir', fixtures, '--all'], {
    log: (value) => allLines.push(value),
    error: (value) => allLines.push(value),
  });
  assert.equal(allCode, 0);
  assert.match(allLines[0], /323e4567/);
});

test('report resolves latest and writes a self-contained report to the current directory', async (t) => {
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'flightrec-report-latest-'));
  t.after(() => fs.rm(outputDirectory, { recursive: true, force: true }));
  const lines = [];

  const code = await main(['report', 'latest', '--dir', fixtures], {
    log: (value) => lines.push(value),
    error: (value) => lines.push(value),
  }, { cwd: () => outputDirectory });

  const expected = path.join(outputDirectory, 'flightrec-report-123e4567.html');
  assert.equal(code, 0);
  assert.equal(lines[0], expected);
  const html = await fs.readFile(expected, 'utf8');
  assert.match(html, /123e4567-e89b-12d3-a456-426614174000/);
  assert.match(html, /<!doctype html>/);
});

test('report resolves an id prefix to the matching session', async (t) => {
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'flightrec-report-prefix-'));
  t.after(() => fs.rm(outputDirectory, { recursive: true, force: true }));
  const lines = [];

  const code = await main(['report', '223e4567', '--dir', fixtures], {
    log: (value) => lines.push(value),
    error: (value) => lines.push(value),
  }, { cwd: () => outputDirectory });

  const expected = path.join(outputDirectory, 'flightrec-report-223e4567.html');
  assert.equal(code, 0);
  assert.equal(lines[0], expected);
  const html = await fs.readFile(expected, 'utf8');
  assert.match(html, /223e4567-e89b-12d3-a456-426614174001/);
});
