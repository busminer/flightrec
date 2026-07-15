'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { parseSession } = require('../src/parser');

const fixture = (name) => path.join(__dirname, 'fixtures', name);

test('parseSession normalizes metadata, turns, messages, commands, and tokens', async () => {
  const session = await parseSession(fixture('rollout-2026-07-15T12-00-00-123e4567-e89b-12d3-a456-426614174000.jsonl'));

  assert.equal(session.meta.id, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(session.meta.cwd, 'C:\\work\\healthy');
  assert.equal(session.meta.originator, 'Codex Desktop');
  assert.equal(session.meta.model, 'gpt-5');
  assert.equal(session.meta.durationMs, 5 * 60 * 1000);
  assert.equal(session.meta.approxTokens, 2500);
  assert.equal(session.meta.isSubagent, false);
  assert.equal(session.turns.length, 2);
  assert.deepEqual(session.turns[0].userMessages, ['Run the tests.']);
  assert.deepEqual(session.turns[0].agentMessages, ['Tests pass.']);
  assert.deepEqual(session.turns[0].reasoning, ['I will run the synthetic test command.']);
  assert.deepEqual(session.turns[0].commands[0].arguments, { command: 'node --test' });
  assert.match(session.turns[0].commands[0].output, /pass 3/);
  assert.equal(session.turns[0].commands[0].exitCode, 0);
  assert.equal(session.turns[1].commands[0].type, 'custom_tool_call');
  assert.equal(session.turns[1].commands[0].output, 'Done!');
  assert.equal(session.turns[1].tokenUsage.cumulativeTotalTokens, 2500);
  assert.equal(session.stats.skippedLines, 0);
});

test('parseSession skips and counts malformed and unknown records', async () => {
  const session = await parseSession(fixture('rollout-2026-07-14T09-30-00-223e4567-e89b-12d3-a456-426614174001.jsonl'));

  assert.equal(session.stats.malformedLines, 1);
  assert.equal(session.stats.unknownRecords, 1);
  assert.equal(session.stats.unknownItems, 1);
  assert.equal(session.stats.unknownEvents, 1);
  assert.equal(session.stats.skippedLines, 4);
  assert.equal(session.turns.length, 1);
  assert.deepEqual(session.turns[0].userMessages, ['Keep parsing.']);
  assert.deepEqual(session.turns[0].agentMessages, ['Parser survived.']);
  assert.equal(session.meta.approxTokens, 400);
});

test('parseSession identifies guardian/subagent sessions', async () => {
  const session = await parseSession(fixture('rollout-2026-07-13T08-00-00-323e4567-e89b-12d3-a456-426614174002.jsonl'));
  assert.equal(session.meta.isSubagent, true);
});
