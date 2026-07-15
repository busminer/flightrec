'use strict';

const fs = require('node:fs/promises');

const KNOWN_EVENT_TYPES = new Set([
  'task_started',
  'task_complete',
  'user_message',
  'agent_message',
  'token_count',
  'web_search_end',
  'thread_settings_applied',
]);

async function parseSession(filePath) {
  const contents = await fs.readFile(filePath, 'utf8');
  return parseSessionText(contents, filePath);
}

function parseSessionText(contents, filePath = null) {
  const session = createSession(filePath);
  const pendingCommands = new Map();
  let currentTurn = null;

  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    session.stats.totalLines += 1;

    let record;
    try {
      record = JSON.parse(line);
    } catch {
      session.stats.malformedLines += 1;
      continue;
    }

    if (!record || typeof record !== 'object' || typeof record.type !== 'string') {
      session.stats.malformedLines += 1;
      continue;
    }

    observeTimestamp(session, record.timestamp);
    const payload = record.payload && typeof record.payload === 'object' ? record.payload : {};

    switch (record.type) {
      case 'session_meta':
        applySessionMeta(session, payload, record.timestamp);
        break;
      case 'turn_context':
        currentTurn = handleTurnContext(session, currentTurn, payload, record.timestamp);
        break;
      case 'response_item': {
        const result = handleResponseItem(session, currentTurn, payload, record.timestamp, pendingCommands);
        currentTurn = result.turn;
        if (!result.handled) session.stats.unknownItems += 1;
        break;
      }
      case 'event_msg': {
        const result = handleEvent(session, currentTurn, payload, record.timestamp);
        currentTurn = result.turn;
        if (!result.handled) session.stats.unknownEvents += 1;
        break;
      }
      case 'world_state':
        session.events.push({ type: 'world_state', timestamp: record.timestamp || null, payload });
        break;
      default:
        session.stats.unknownRecords += 1;
    }
  }

  session.stats.orphanOutputs = [...pendingCommands.values()].filter((command) => command.output === null).length;
  finalizeSession(session);
  return session;
}

function createSession(filePath) {
  return {
    meta: {
      id: null,
      timestamp: null,
      cwd: null,
      originator: null,
      cliVersion: null,
      source: null,
      baseInstructions: null,
      model: null,
      startTime: null,
      endTime: null,
      durationMs: 0,
      isSubagent: false,
      approxTokens: 0,
      filePath,
    },
    turns: [],
    events: [],
    stats: {
      totalLines: 0,
      malformedLines: 0,
      unknownRecords: 0,
      unknownItems: 0,
      unknownEvents: 0,
      orphanOutputs: 0,
      skippedLines: 0,
    },
  };
}

function applySessionMeta(session, payload, fallbackTimestamp) {
  session.meta.id = payload.id || session.meta.id;
  session.meta.timestamp = payload.timestamp || fallbackTimestamp || session.meta.timestamp;
  session.meta.cwd = payload.cwd || session.meta.cwd;
  session.meta.originator = payload.originator || session.meta.originator;
  session.meta.cliVersion = payload.cli_version || session.meta.cliVersion;
  session.meta.source = payload.source || session.meta.source;
  session.meta.baseInstructions = payload.base_instructions || session.meta.baseInstructions;
  session.meta.isSubagent = sourceIsSubagent(session.meta.source);
}

function handleTurnContext(session, currentTurn, payload, timestamp) {
  if (!currentTurn || currentTurn.context || hasAgentActivity(currentTurn)) {
    currentTurn = addTurn(session, timestamp);
  }
  currentTurn.context = payload;
  currentTurn.timestamp ||= timestamp || null;
  if (!session.meta.model && payload.model) session.meta.model = payload.model;
  if (!session.meta.cwd && payload.cwd) session.meta.cwd = payload.cwd;
  return currentTurn;
}

function handleResponseItem(session, currentTurn, payload, timestamp, pendingCommands) {
  const type = payload.type;
  if (type === 'message') {
    const role = payload.role;
    if (role !== 'user' && role !== 'assistant') return { turn: currentTurn, handled: false };
    currentTurn = turnForMessage(session, currentTurn, role, timestamp);
    addMessage(currentTurn, role, extractText(payload.content));
    return { turn: currentTurn, handled: true };
  }

  if (type === 'reasoning') {
    currentTurn = currentTurn || addTurn(session, timestamp);
    const text = extractText(payload.summary || payload.content || payload.text);
    if (text) currentTurn.reasoning.push(text);
    return { turn: currentTurn, handled: true };
  }

  if (type === 'function_call' || type === 'custom_tool_call') {
    currentTurn = currentTurn || addTurn(session, timestamp);
    const callId = payload.call_id || payload.id || null;
    const command = {
      callId,
      type,
      name: payload.name || null,
      arguments: parseArguments(payload.arguments ?? payload.input),
      timestamp: timestamp || null,
      output: null,
      exitCode: null,
    };
    currentTurn.commands.push(command);
    if (callId) pendingCommands.set(callId, command);
    return { turn: currentTurn, handled: true };
  }

  if (type === 'function_call_output' || type === 'custom_tool_call_output') {
    const callId = payload.call_id || payload.id || null;
    const command = callId ? pendingCommands.get(callId) : null;
    if (!command) return { turn: currentTurn, handled: false };
    command.output = normalizeOutput(payload.output);
    command.exitCode = extractExitCode(payload, command.output);
    pendingCommands.delete(callId);
    return { turn: currentTurn, handled: true };
  }

  return { turn: currentTurn, handled: false };
}

function handleEvent(session, currentTurn, payload, timestamp) {
  if (!KNOWN_EVENT_TYPES.has(payload.type)) return { turn: currentTurn, handled: false };

  const event = { type: payload.type, timestamp: timestamp || null, payload };
  session.events.push(event);

  if (payload.type === 'user_message' || payload.type === 'agent_message') {
    const role = payload.type === 'user_message' ? 'user' : 'assistant';
    currentTurn = turnForMessage(session, currentTurn, role, timestamp);
    addMessage(currentTurn, role, extractText(payload.message ?? payload.content ?? payload.text));
  } else if (payload.type === 'token_count') {
    currentTurn = currentTurn || addTurn(session, timestamp);
    const usage = normalizeTokenUsage(payload);
    if (usage) currentTurn.tokenUsage = usage;
  }

  return { turn: currentTurn, handled: true };
}

function addTurn(session, timestamp) {
  const turn = {
    index: session.turns.length + 1,
    timestamp: timestamp || null,
    context: null,
    userMessages: [],
    agentMessages: [],
    reasoning: [],
    commands: [],
    tokenUsage: null,
  };
  session.turns.push(turn);
  return turn;
}

function turnForMessage(session, currentTurn, role, timestamp) {
  if (!currentTurn || (role === 'user' && hasAgentActivity(currentTurn))) {
    return addTurn(session, timestamp);
  }
  return currentTurn;
}

function hasAgentActivity(turn) {
  return turn.agentMessages.length > 0 || turn.reasoning.length > 0 || turn.commands.length > 0;
}

function addMessage(turn, role, text) {
  if (!text) return;
  const messages = role === 'user' ? turn.userMessages : turn.agentMessages;
  if (!messages.includes(text)) messages.push(text);
}

function extractText(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => typeof part === 'string' ? part : part?.text || part?.content || '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function parseArguments(value) {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeOutput(value) {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

function extractExitCode(payload, output) {
  if (Number.isInteger(payload.exit_code)) return payload.exit_code;
  const match = /(?:Process exited with code|Exit code:)\s*(-?\d+)/i.exec(output);
  return match ? Number(match[1]) : null;
}

function normalizeTokenUsage(payload) {
  const info = payload.info || payload;
  const total = info.total_token_usage || info.total_usage || null;
  const last = info.last_token_usage || info.last_usage || info.usage || null;
  if (!total && !last) return null;
  return {
    inputTokens: numberFrom(last, 'input_tokens'),
    cachedInputTokens: numberFrom(last, 'cached_input_tokens'),
    outputTokens: numberFrom(last, 'output_tokens'),
    reasoningOutputTokens: numberFrom(last, 'reasoning_output_tokens'),
    totalTokens: tokenTotal(last),
    cumulativeTotalTokens: tokenTotal(total),
  };
}

function numberFrom(value, key) {
  return Number.isFinite(value?.[key]) ? value[key] : 0;
}

function tokenTotal(value) {
  if (!value) return 0;
  if (Number.isFinite(value.total_tokens)) return value.total_tokens;
  return numberFrom(value, 'input_tokens') + numberFrom(value, 'output_tokens');
}

function observeTimestamp(session, value) {
  if (!value) return;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return;
  const start = session.meta.startTime ? new Date(session.meta.startTime).getTime() : Infinity;
  const end = session.meta.endTime ? new Date(session.meta.endTime).getTime() : -Infinity;
  if (timestamp < start) session.meta.startTime = new Date(timestamp).toISOString();
  if (timestamp > end) session.meta.endTime = new Date(timestamp).toISOString();
}

function sourceIsSubagent(source) {
  if (!source || typeof source !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(source, 'subagent')) return true;
  return /guardian|subagent/i.test(JSON.stringify(source));
}

function finalizeSession(session) {
  const start = session.meta.startTime ? new Date(session.meta.startTime).getTime() : 0;
  const end = session.meta.endTime ? new Date(session.meta.endTime).getTime() : start;
  session.meta.durationMs = Math.max(0, end - start);
  session.meta.approxTokens = session.turns.reduce((maximum, turn) => (
    Math.max(maximum, turn.tokenUsage?.cumulativeTotalTokens || 0)
  ), 0);
  if (!session.meta.approxTokens) {
    session.meta.approxTokens = session.turns.reduce((sum, turn) => sum + (turn.tokenUsage?.totalTokens || 0), 0);
  }
  session.stats.skippedLines = session.stats.malformedLines
    + session.stats.unknownRecords
    + session.stats.unknownItems
    + session.stats.unknownEvents;
}

module.exports = {
  parseSession,
  parseSessionText,
};
