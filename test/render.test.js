'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { renderReport } = require('../src/render');

test('renderReport contains all five report sections and escapes user data', () => {
  const injection = '<script>alert("owned")</script>';
  const session = {
    meta: {
      id: '123e4567-e89b-12d3-a456-426614174000',
      timestamp: '2026-07-15T12:00:00.000Z',
      startTime: '2026-07-15T12:00:00.000Z',
      durationMs: 65_000,
      cwd: `C:\\work\\${injection}`,
      model: 'gpt-5',
      originator: injection,
    },
    turns: [{
      index: 1,
      timestamp: '2026-07-15T12:00:01.000Z',
      userMessages: [`Please inspect ${injection}`],
      reasoning: [injection],
      commands: [{ arguments: { command: `echo ${injection}` }, exitCode: 0, output: injection }],
      agentMessages: [`Done. ${injection}`],
    }],
  };
  const analysis = {
    claims: [{ turnIndex: 1, sentence: `Done. ${injection}`, claimType: 'done', verdict: 'supported', evidenceCommands: [{ command: `node --test ${injection}`, exitCode: 0, output: injection }] }],
    filesTouched: { [`src/${injection}.js`]: { writes: 3, turns: [1], churn: true } },
    tokens: { perTurn: [{ turnIndex: 1, totalTokens: 120, cumulativeTotalTokens: 120 }], totalTokens: 120, cumulativeTotalTokens: 120 },
    summary: { turns: 1, commands: 1, failedCommands: 0, claims: { supported: 1, partial: 0, unsupported: 0 }, churnedFiles: 1 },
  };

  const html = renderReport(session, analysis);

  for (const section of ['header', 'claims-vs-evidence', 'timeline', 'files-touched', 'token-burn']) {
    assert.match(html, new RegExp(`data-section="${section}"`));
  }
  assert.ok(html.indexOf('data-section="claims-vs-evidence"') < html.indexOf('data-section="timeline"'));
  assert.doesNotMatch(html, /<script>alert\("owned"\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(&quot;owned&quot;\)&lt;\/script&gt;/);
  assert.match(html, /<svg[^>]+aria-label="Per-turn and cumulative token usage"/);
  assert.match(html, /CHURN · REVIEW/);
});

test('renderReport truncates command output after thirty lines', () => {
  const output = Array.from({ length: 35 }, (_, index) => `line ${index + 1}`).join('\n');
  const html = renderReport({ meta: {}, turns: [{ index: 1, userMessages: [], reasoning: [], commands: [{ arguments: 'run', exitCode: 1, output }], agentMessages: [] }] }, {
    claims: [], filesTouched: {}, tokens: { perTurn: [] }, summary: { claims: {} },
  });

  assert.match(html, /line 30/);
  assert.doesNotMatch(html, /line 31/);
  assert.match(html, /Output truncated · 5 more lines/);
});

test('renderReport strips leading harness wrappers from user messages without mutating the session', () => {
  const visibleMessage = '<recommended_plugins>internal plugin list</recommended_plugins>\n<environment_context>secret harness context</environment_context>\nPlease review src/render.js.';
  const hiddenMessage = '<user_instructions>injected only</user_instructions>\n<environment_context>also injected</environment_context>';
  const session = {
    meta: {},
    turns: [{ index: 1, userMessages: [visibleMessage, hiddenMessage], agentMessages: [] }],
  };

  const html = renderReport(session, { claims: [], filesTouched: {}, tokens: { perTurn: [] }, summary: { claims: {} } });

  assert.match(html, /Please review src\/render\.js\./);
  assert.doesNotMatch(html, /internal plugin list|secret harness context|injected only|also injected/);
  assert.equal((html.match(/<span class="message-role">USER<\/span>/g) || []).length, 1);
  assert.equal(session.turns[0].userMessages[0], visibleMessage);
  assert.equal(session.turns[0].userMessages[1], hiddenMessage);
});

test('renderReport shows friendly empty states for claims and files', () => {
  const html = renderReport({ meta: {}, turns: [] }, {
    claims: [],
    filesTouched: {},
    tokens: { perTurn: [] },
    summary: { claims: {} },
  });

  assert.match(html, /No claims detected in this session\./);
  assert.match(html, /No files touched in this session\./);
  assert.doesNotMatch(html, /<tbody><\/tbody>/);
});
