'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const ROLLOUT_PATTERN = /^rollout-(.+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

function defaultSessionsRoot() {
  return path.join(os.homedir(), '.codex', 'sessions');
}

function parseRolloutFilename(filename) {
  const match = ROLLOUT_PATTERN.exec(filename);
  if (!match) return null;

  const date = parseFilenameDate(match[1]);
  if (!date) return null;

  return { date, uuid: match[2] };
}

function parseFilenameDate(value) {
  const codexTimestamp = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?Z?$/.exec(value);
  const normalized = codexTimestamp
    ? `${codexTimestamp[1]}T${codexTimestamp[2]}:${codexTimestamp[3]}:${codexTimestamp[4]}.${codexTimestamp[5] || '000'}Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function discoverSessions(root = defaultSessionsRoot()) {
  const results = [];
  await walk(root, results);
  return results.sort((left, right) => {
    const dateDifference = right.date.getTime() - left.date.getTime();
    return dateDifference || right.path.localeCompare(left.path);
  });
}

async function walk(directory, results) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return;
    throw error;
  }

  await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, results);
      return;
    }
    if (!entry.isFile()) return;

    const parsed = parseRolloutFilename(entry.name);
    if (parsed) results.push({ path: entryPath, filename: entry.name, ...parsed });
  }));
}

module.exports = {
  defaultSessionsRoot,
  discoverSessions,
  parseRolloutFilename,
};
