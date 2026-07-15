'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { analyzeSession } = require('../src/analyze');
const { parseSession } = require('../src/parser');

const fixture = (name) => path.join(__dirname, 'fixtures', name);

test('analyzeSession matches claims to real verification evidence and token usage', async () => {
  const session = await parseSession(fixture('rollout-2026-07-15T12-00-00-123e4567-e89b-12d3-a456-426614174000.jsonl'));
  const analysis = analyzeSession(session);

  const testClaim = analysis.claims.find((claim) => claim.claimType === 'tests_pass');
  assert.equal(testClaim.turnIndex, 1);
  assert.equal(testClaim.sentence, 'Tests pass.');
  assert.equal(testClaim.verdict, 'supported');
  assert.equal(testClaim.evidenceCommands[0].command, 'node --test');

  const doneClaim = analysis.claims.find((claim) => claim.claimType === 'done');
  assert.equal(doneClaim.verdict, 'supported');
  assert.equal(analysis.tokens.totalTokens, 2500);
  assert.equal(analysis.tokens.cumulativeTotalTokens, 2500);
  assert.deepEqual(analysis.tokens.perTurn, [
    { turnIndex: 1, totalTokens: 1000, cumulativeTotalTokens: 1000 },
    { turnIndex: 2, totalTokens: 1500, cumulativeTotalTokens: 2500 },
  ]);
  assert.deepEqual(analysis.summary.claims, { supported: 3, partial: 0, unsupported: 0 });
});

test('analyzeSession reports unsupported claims and failed commands', () => {
  const analysis = analyzeSession({ turns: [turn(1, {
    agentMessages: ['The bug is fixed.'],
    commands: [{ name: 'shell', arguments: { command: 'node --test' }, exitCode: 1, output: 'fail 2' }],
  }), turn(2, {
    agentMessages: ['Everything works correctly.'],
  })] });

  assert.equal(analysis.claims.find((claim) => claim.claimType === 'fixed').verdict, 'partial');
  assert.equal(analysis.claims.find((claim) => claim.claimType === 'works').verdict, 'partial');
  assert.equal(analysis.summary.failedCommands, 1);

  const isolated = analyzeSession({ turns: [turn(1, { agentMessages: ['Implementation is complete.'] })] });
  assert.equal(isolated.claims[0].verdict, 'unsupported');
  assert.deepEqual(isolated.claims[0].evidenceCommands, []);
});

test('analyzeSession uses commands from up to two previous turns as evidence', () => {
  const analysis = analyzeSession({ turns: [
    turn(1, { commands: [{ name: 'shell', arguments: { command: 'pytest' }, exitCode: 0, output: '4 passed' }] }),
    turn(2),
    turn(3, { agentMessages: ['Verified successfully.'] }),
    turn(4),
    turn(5),
    turn(6, { agentMessages: ['Done.'] }),
  ] });

  assert.equal(analysis.claims.find((claim) => claim.turnIndex === 3).verdict, 'supported');
  assert.equal(analysis.claims.find((claim) => claim.turnIndex === 6).verdict, 'unsupported');
});

test('analyzeSession extracts apply_patch paths and marks files with three writes as churn', () => {
  const patch = [
    '*** Begin Patch',
    '*** Add File: src/new.js',
    '+module.exports = {};',
    '*** Update File: src/reworked.js',
    '*** Delete File: src/old.js',
    '*** End Patch',
  ].join('\n');
  const analysis = analyzeSession({ turns: [
    turn(1, { commands: [{ name: 'apply_patch', arguments: patch, exitCode: 0, output: 'Done!' }] }),
    turn(2, { commands: [{ name: 'shell', arguments: { command: 'Set-Content -Path "src/new.js" -Value one' }, exitCode: 0, output: '' }] }),
    turn(3, { commands: [{ name: 'shell', arguments: { command: 'echo two >> src/new.js' }, exitCode: 0, output: '' }] }),
    turn(4, { commands: [{ name: 'shell', arguments: { command: 'cp source.js destination.js' }, exitCode: 0, output: '' }] }),
  ] });

  assert.deepEqual(analysis.filesTouched['src/new.js'], { writes: 3, turns: [1, 2, 3], churn: true });
  assert.deepEqual(analysis.filesTouched['src/reworked.js'], { writes: 1, turns: [1], churn: false });
  assert.deepEqual(analysis.filesTouched['src/old.js'], { writes: 1, turns: [1], churn: false });
  assert.deepEqual(analysis.filesTouched['destination.js'], { writes: 1, turns: [4], churn: false });
  assert.equal(analysis.summary.churnedFiles, 1);
  assert.equal(analysis.summary.commands, 4);
});

test('claim matching uses phrases rather than random substrings', () => {
  const analysis = analyzeSession({ turns: [turn(1, {
    agentMessages: [
      'The unfinished worker successfully implemented it. All green!',
      'All tests passed. I will work on the success criteria next.',
    ],
  })] });
  assert.deepEqual(analysis.claims.map((claim) => claim.claimType), [
    'success',
    'implemented',
    'all_green',
    'tests_pass',
  ]);
});

function turn(index, overrides = {}) {
  return {
    index,
    agentMessages: [],
    commands: [],
    tokenUsage: null,
    ...overrides,
  };
}
