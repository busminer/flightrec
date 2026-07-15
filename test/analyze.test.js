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
  assert.equal(testClaim.sentence, 'All tests passed.');
  assert.equal(testClaim.verdict, 'supported');
  assert.equal(testClaim.evidenceCommands[0].command, 'node --test test/parser.test.js');

  const doneClaim = analysis.claims.find((claim) => claim.turnIndex === 7 && claim.claimType === 'done');
  assert.equal(doneClaim.verdict, 'unsupported');
  assert.equal(analysis.tokens.totalTokens, 8200);
  assert.equal(analysis.tokens.cumulativeTotalTokens, 8200);
  assert.deepEqual(analysis.tokens.perTurn, [
    { turnIndex: 1, totalTokens: 1200, cumulativeTotalTokens: 1200 },
    { turnIndex: 2, totalTokens: 2000, cumulativeTotalTokens: 3200 },
    { turnIndex: 3, totalTokens: 1450, cumulativeTotalTokens: 4650 },
    { turnIndex: 4, totalTokens: 1050, cumulativeTotalTokens: 5700 },
    { turnIndex: 5, totalTokens: 820, cumulativeTotalTokens: 6520 },
    { turnIndex: 6, totalTokens: 980, cumulativeTotalTokens: 7500 },
    { turnIndex: 7, totalTokens: 700, cumulativeTotalTokens: 8200 },
  ]);
  assert.deepEqual(analysis.summary.claims, { supported: 3, partial: 3, unsupported: 1 });
  assert.equal(analysis.summary.failedCommands, 1);
  assert.equal(analysis.summary.claimsTotalBeforeDedupe, 7);
  assert.deepEqual(analysis.filesTouched['src/parser.js'], { writes: 3, turns: [1, 2, 3], churn: true });
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

test('redirect detection ignores numeric comparisons embedded in scripts', () => {
  const analysis = analyzeSession({ turns: [turn(1, {
    commands: [{
      name: 'shell',
      arguments: { command: 'node -e "if (count > 0) run(); if (other >1) run();" > output.txt' },
      exitCode: 0,
      output: '',
    }],
  })] });

  assert.deepEqual(Object.keys(analysis.filesTouched), ['output.txt']);
  assert.equal(analysis.filesTouched['0'], undefined);
  assert.equal(analysis.filesTouched['1'], undefined);
});

test('written path candidates require path punctuation and reject script fragments', () => {
  const analysis = analyzeSession({ turns: [turn(1, {
    commands: [{
      name: 'shell',
      arguments: {
        command: 'node -e "if (ready > end) { path > end.js); value > result}; next > item; more > thing, }" > report.html',
      },
      exitCode: 0,
      output: '',
    }],
  })] });

  assert.deepEqual(Object.keys(analysis.filesTouched), ['report.html']);
  assert.equal(analysis.filesTouched['end)'], undefined);
  assert.equal(analysis.filesTouched['end.js)'], undefined);
  assert.equal(analysis.filesTouched.result, undefined);
  assert.equal(analysis.filesTouched.item, undefined);
  assert.equal(analysis.filesTouched['thing,'], undefined);
});

test('claim matching extracts numeric test results', () => {
  const analysis = analyzeSession({ turns: [turn(1, {
    agentMessages: [
      '9/9 passed.',
      '14 passed, 0 failed.',
      '2 failing.',
      'All 14 tests green.',
    ],
  })] });

  assert.deepEqual(analysis.claims.map((claim) => claim.claimType), ['test_results']);
  assert.equal(analysis.claims[0].count, 4);
  assert.equal(analysis.summary.claimsTotalBeforeDedupe, 4);
});

test('claim matching extracts Russian agent phrasing', () => {
  const analysis = analyzeSession({ turns: [turn(1, {
    agentMessages: [
      'Готово. Сделано.',
      'Исправлено. Починил.',
      'Работает.',
      'Реализован. Реализовано.',
      'Тесты прошли. Тесты зелёные.',
      'Успешно.',
    ],
  })] });

  assert.deepEqual(analysis.claims.map((claim) => claim.claimType), [
    'done',
    'fixed',
    'works',
    'implemented',
    'tests_pass',
    'success',
  ]);
  assert.deepEqual(analysis.claims.map((claim) => claim.count), [2, 2, 1, 2, 2, 1]);
  assert.equal(analysis.summary.claimsTotalBeforeDedupe, 10);
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

test('desktop custom tool outputs infer supported, partial, and unsupported verdicts', async () => {
  const session = await parseSession(fixture('desktop-custom-tool-session.jsonl'));
  const analysis = analyzeSession(session);

  assert.equal(session.turns[0].commands[0].type, 'custom_tool_call');
  assert.equal(session.turns[0].commands[0].exitCode, null);
  assert.equal(analysis.summary.claimsTotalBeforeDedupe, 8);
  assert.equal(analysis.claims.length, 5);

  const done = analysis.claims.find((claim) => claim.turnIndex === 1 && claim.claimType === 'done');
  assert.equal(done.sentence, 'Done.');
  assert.equal(done.count, 3);
  assert.equal(done.verdict, 'supported');
  assert.equal(done.evidenceCommands[0].outcome, 'success');
  assert.equal(done.evidenceCommands[0].outcomeSource, 'output');

  const verified = analysis.claims.find((claim) => claim.claimType === 'verified');
  assert.equal(verified.verdict, 'partial');
  assert.equal(verified.evidenceCommands.some((command) => command.command === 'Get-ChildItem test'), true);

  const fixed = analysis.claims.find((claim) => claim.claimType === 'fixed');
  assert.equal(fixed.verdict, 'unsupported');
  assert.equal(fixed.evidenceCommands[0].outcome, 'failure');
  assert.equal(fixed.evidenceCommands[0].outcomeSource, 'output');
});

test('exit-code text can support a test command when the parsed exit code is missing', () => {
  const analysis = analyzeSession({ turns: [turn(1, {
    commands: [{
      name: 'custom_tool_call',
      arguments: { command: 'cargo test' },
      exitCode: null,
      output: 'Finished test profile\nexit_code=0',
    }],
    agentMessages: ['Verified.'],
  })] });

  assert.equal(analysis.claims[0].verdict, 'supported');
  assert.equal(analysis.claims[0].evidenceCommands[0].outcomeSource, 'output');
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
