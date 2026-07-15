#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { discoverSessions, defaultSessionsRoot } = require('../src/discover');
const { parseSession } = require('../src/parser');
const { analyzeSession } = require('../src/analyze');
const { renderReport } = require('../src/render');
const { version } = require('../package.json');

async function main(argv = process.argv.slice(2), io = console, runtime = {}) {
  const command = argv[0];
  if (command === '--version' || command === '-v') {
    io.log(version);
    return 0;
  }
  if (!command || command === '--help' || command === '-h') {
    io.log(usage());
    return 0;
  }
  if (command !== 'list' && command !== 'report') {
    io.error(`Unknown command: ${command}\n\n${usage()}`);
    return 1;
  }

  let options;
  try {
    options = command === 'list' ? parseListArgs(argv.slice(1)) : parseReportArgs(argv.slice(1));
  } catch (error) {
    io.error(`${error.message}\n\n${usage()}`);
    return 1;
  }

  try {
    const sessions = await loadSessions(options.dir);
    if (command === 'list') {
      const visible = options.all ? sessions : sessions.filter((session) => !session.meta.isSubagent);
      io.log(formatSessionList(visible));
      return 0;
    }
    const session = resolveReportSession(sessions, options.selector);
    const outputDirectory = runtime.cwd ? runtime.cwd() : process.cwd();
    const outputPath = path.join(outputDirectory, `flightrec-report-${shortId(session.meta.id)}.html`);
    await fs.writeFile(outputPath, renderReport(session, analyzeSession(session)), 'utf8');
    io.log(outputPath);
    if (options.open) openReport(outputPath, runtime);
    return 0;
  } catch (error) {
    io.error(error.message);
    return 1;
  }
}

async function loadSessions(root) {
  const discovered = await discoverSessions(root);
  return Promise.all(discovered.map(async (entry) => {
    const session = await parseSession(entry.path);
    if (!session.meta.id) session.meta.id = entry.uuid;
    if (!session.meta.timestamp) session.meta.timestamp = entry.date.toISOString();
    return session;
  }));
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

function parseReportArgs(args) {
  const options = { dir: defaultSessionsRoot(), open: false, selector: 'latest' };
  let selectorSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--open') {
      options.open = true;
    } else if (argument === '--dir') {
      if (!args[index + 1]) throw new Error('--dir requires a path');
      options.dir = path.resolve(args[index + 1]);
      index += 1;
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (selectorSeen) {
      throw new Error(`Unexpected argument: ${argument}`);
    } else {
      options.selector = argument;
      selectorSeen = true;
    }
  }
  return options;
}

function resolveReportSession(sessions, selector = 'latest') {
  const visible = sessions.filter((session) => !session.meta.isSubagent);
  if (selector === 'latest') {
    if (!visible.length) throw new Error('No non-subagent sessions found');
    return visible[0];
  }
  const matches = sessions.filter((session) => String(session.meta.id || '').startsWith(selector));
  if (matches.length === 0) throw new Error(`No session matches id prefix: ${selector}`);
  if (matches.length > 1) throw new Error(`Session id prefix is ambiguous: ${selector}`);
  return matches[0];
}

function openReport(filePath, runtime = {}) {
  const platform = runtime.platform || process.platform;
  const launch = runtime.spawn || spawn;
  let executable;
  let args;
  if (platform === 'win32') {
    executable = process.env.ComSpec || 'cmd.exe';
    args = ['/d', '/s', '/c', 'start', '', filePath];
  } else if (platform === 'darwin') {
    executable = 'open';
    args = [filePath];
  } else {
    executable = 'xdg-open';
    args = [filePath];
  }
  const child = launch(executable, args, { detached: true, stdio: 'ignore', windowsHide: true });
  if (typeof child.unref === 'function') child.unref();
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
  return [
    'Usage:',
    '  flightrec --version',
    '  flightrec list [--dir <path>] [--all]',
    '  flightrec report [session-id|latest] [--dir <path>] [--open]',
  ].join('\n');
}

function shortId(value) {
  return String(value || 'unknown').slice(0, 8);
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
  openReport,
  parseListArgs,
  parseReportArgs,
  resolveReportSession,
};
