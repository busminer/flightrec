'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { discoverSessions, parseRolloutFilename } = require('../src/discover');

const fixtures = path.join(__dirname, 'fixtures');

test('parseRolloutFilename extracts a UTC date and UUID', () => {
  const parsed = parseRolloutFilename('rollout-2026-07-15T12-00-00-123e4567-e89b-12d3-a456-426614174000.jsonl');
  assert.equal(parsed.uuid, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(parsed.date.toISOString(), '2026-07-15T12:00:00.000Z');
  assert.equal(parseRolloutFilename('notes.jsonl'), null);
});

test('discoverSessions recursively finds rollout files newest first', async () => {
  const sessions = await discoverSessions(fixtures);
  assert.equal(sessions.length, 3);
  assert.deepEqual(sessions.map((session) => session.uuid.slice(0, 8)), [
    '123e4567',
    '223e4567',
    '323e4567',
  ]);
  assert.ok(sessions.every((session) => path.isAbsolute(session.path)));
});

test('discoverSessions walks nested date directories', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flightrec-discover-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const nested = path.join(root, '2026', '07', '15');
  await fs.mkdir(nested, { recursive: true });
  await fs.writeFile(
    path.join(nested, 'rollout-2026-07-15T13-00-00-423e4567-e89b-12d3-a456-426614174003.jsonl'),
    '',
  );

  const sessions = await discoverSessions(root);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].uuid, '423e4567-e89b-12d3-a456-426614174003');
});

test('discoverSessions returns an empty list for a missing root', async () => {
  assert.deepEqual(await discoverSessions(path.join(fixtures, 'does-not-exist')), []);
});
