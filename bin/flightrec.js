#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { discoverSessions, defaultSessionsRoot } = require('../src/discover');
const { parseSession } = require('../src/parser');

async function main(argv = process.argv.slice(2), io = console) {
  const command = argv[0];
  if (!command || command === '--help' || command === '-h') {
    io.log(usage());
    return 0;
  }
  if (command !== 'list') {
    io.error(`Unknown command: ${command}\n\n${usage()}`);
    return 1;
  }

  let options;
  try {
    options = parseListArgs(argv.slice(1));
  } catch (error) {
    io.error(`${error.message}\n\n${usage()}`);
    return 1;
  }

  const discovered = await discoverSessions(options.dir);
  const sessions = await Promise.all(discovered.map(async (entry) => {
    const session = await parseSession(entry.path);
    if (!session.meta.id) session.meta.id = entry.uuid;
    if (!session.meta.timestamp) session.meta.timestamp = entry.date.toISOString();
    return session;
  }));
  const visible = options.all ? sessions : sessions.filter((session) => !session.meta.isSubagent);
  io.log(formatSessionList(visible));
  return 0;
}

function parseListArgs(args) {
  const options = { dir: defaultSessionsRoot(), all: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--all') {
      options.all = true;
    } else if (argument === '--dir') {
      if (!args[index + 1]) throw new Error('--dir requires a path');
      options.dir = path.resolve(args[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function formatSessionList(sessions) {
  const headers = ['DATE', 'ID', 'ORIGINATOR', 'CWD', 'TURNS', 'DURATION', 'TOKENS'];
  const rows = sessions.map((session) => [
    formatDate(session.meta.timestamp || session.meta.startTime),
    (session.meta.id || 'unknown').slice(0, 8),
    session.meta.originator || '-',
    session.meta.cwd || '-',
    String(session.turns.length),
    formatDuration(session.meta.durationMs),
    formatTokens(session.meta.approxTokens),
  ]);
  const widths = headers.map((header, column) => Math.max(
    header.length,
    ...rows.map((row) => row[column].length),
  ));
  const formatRow = (row) => row.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd();
  return [formatRow(headers), ...rows.map(formatRow)].join('\n');
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

function formatDuration(milliseconds = 0) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTokens(tokens = 0) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(tokens);
}

function usage() {
  return 'Usage: flightrec list [--dir <path>] [--all]';
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  formatDate,
  formatDuration,
  formatSessionList,
  formatTokens,
  main,
  parseListArgs,
};
