'use strict';

const CLAIM_PATTERNS = [
  {
    type: 'tests_pass',
    patterns: [
      /\b(?:all\s+)?tests?(?:\s+suites?)?\s+(?:all\s+)?(?:pass(?:ed|es|ing)?|are\s+passing)\b/i,
      /(?:^|[^\p{L}\p{N}_])тесты\s+(?:прошли|зел[её]ные)(?=$|[^\p{L}\p{N}_])/iu,
    ],
  },
  {
    type: 'test_results',
    patterns: [
      /\b\d+\s*\/\s*\d+\s+(?:tests?\s+)?passed\b/i,
      /\b\d+\s+(?:tests?\s+)?(?:passed|passing|failed|failing)\b/i,
      /\ball\s+\d+\s+tests?\s+green\b/i,
    ],
  },
  { type: 'verified', patterns: [/\b(?:verified|verification\s+(?:passed|complete|succeeded))\b/i] },
  {
    type: 'works',
    patterns: [
      /\b(?:(?:it|this|everything)\s+is\s+working|works(?:\s+correctly|\s+as\s+expected)?)\b/i,
      /(?:^|[^\p{L}\p{N}_])работает(?=$|[^\p{L}\p{N}_])/iu,
    ],
  },
  {
    type: 'fixed',
    patterns: [
      /\b(?:fixed|fix\s+(?:is\s+)?complete|issue\s+(?:is\s+)?resolved)\b/i,
      /(?:^|[^\p{L}\p{N}_])(?:исправлено|починил)(?=$|[^\p{L}\p{N}_])/iu,
    ],
  },
  {
    type: 'done',
    patterns: [
      /\b(?:done|completed?|finished)\b/i,
      /(?:^|[^\p{L}\p{N}_])(?:готово|сделано)(?=$|[^\p{L}\p{N}_])/iu,
    ],
  },
  {
    type: 'success',
    patterns: [
      /(?:\b(?:successfully|successful|succeeded)\b|(?:^|\b(?:is|was|a)\s+)success[.!]?$)/i,
      /(?:^|[^\p{L}\p{N}_])успешно(?=$|[^\p{L}\p{N}_])/iu,
    ],
  },
  { type: 'all_green', patterns: [/\ball\s+green\b/i] },
  {
    type: 'implemented',
    patterns: [
      /\b(?:implemented|implementation\s+(?:is\s+)?complete)\b/i,
      /(?:^|[^\p{L}\p{N}_])реализован(?:о|а|ы)?(?=$|[^\p{L}\p{N}_])/iu,
    ],
  },
];

const TEST_COMMAND = /(?:^|[;&|]\s*|\s)(?:node\s+--test\b|npm\s+(?:run\s+)?test\b|pytest\b|cargo\s+test\b|go\s+test\b|(?:npx\s+)?jest\b|(?:npx\s+)?vitest\b)/i;
const SMOKE_COMMAND = /(?:^|[;&|]\s*|\s)(?:npm\s+run\s+(?:check|verify|smoke)\b|(?:node|python(?:3)?)\s+[^\s]+\.(?:[cm]?js|py)\b|\.\/[^\s]+|curl\b|Invoke-WebRequest\b)/i;

function analyzeSession(session) {
  const turns = Array.isArray(session?.turns) ? session.turns : [];
  const claims = extractClaims(turns);
  const filesTouched = analyzeFilesTouched(turns);
  const tokens = analyzeTokens(turns);
  const commandCount = turns.reduce((sum, turn) => sum + commandsFor(turn).length, 0);
  const failedCommands = turns.reduce((sum, turn) => (
    sum + commandsFor(turn).filter((command) => Number.isInteger(command.exitCode) && command.exitCode !== 0).length
  ), 0);

  return {
    claims,
    filesTouched,
    tokens,
    summary: {
      turns: turns.length,
      commands: commandCount,
      failedCommands,
      claims: {
        supported: claims.filter((claim) => claim.verdict === 'supported').length,
        partial: claims.filter((claim) => claim.verdict === 'partial').length,
        unsupported: claims.filter((claim) => claim.verdict === 'unsupported').length,
      },
      churnedFiles: Object.values(filesTouched).filter((file) => file.churn).length,
    },
  };
}

function extractClaims(turns) {
  const claims = [];
  for (let position = 0; position < turns.length; position += 1) {
    const turn = turns[position];
    for (const message of Array.isArray(turn.agentMessages) ? turn.agentMessages : []) {
      for (const sentence of splitSentences(message)) {
        for (const claimPattern of CLAIM_PATTERNS) {
          if (!claimPattern.patterns.some((pattern) => pattern.test(sentence))) continue;
          const evidence = matchEvidence(turns, position);
          claims.push({
            turnIndex: turnIndex(turn, position),
            sentence,
            claimType: claimPattern.type,
            verdict: evidence.verdict,
            evidenceCommands: evidence.commands,
          });
        }
      }
    }
  }
  return claims;
}

function splitSentences(message) {
  return String(message)
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((sentence) => sentence.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '').trim())
    .filter(Boolean);
}

function matchEvidence(turns, claimPosition) {
  const candidates = [];
  for (let position = Math.max(0, claimPosition - 2); position <= claimPosition; position += 1) {
    for (const command of commandsFor(turns[position])) {
      candidates.push(commandEvidence(command, turnIndex(turns[position], position)));
    }
  }

  const verification = candidates.filter((command) => command.verificationType);
  const supported = verification.filter(commandSupportsClaim);
  if (supported.length > 0) return { verdict: 'supported', commands: supported };
  if (verification.length > 0) return { verdict: 'partial', commands: verification };
  if (candidates.length > 0) return { verdict: 'partial', commands: candidates };
  return { verdict: 'unsupported', commands: [] };
}

function commandEvidence(command, index) {
  const text = commandText(command);
  return {
    turnIndex: index,
    name: command?.name || null,
    command: text,
    exitCode: Number.isInteger(command?.exitCode) ? command.exitCode : null,
    output: typeof command?.output === 'string' ? command.output : '',
    verificationType: TEST_COMMAND.test(text) ? 'test' : SMOKE_COMMAND.test(text) ? 'smoke' : null,
  };
}

function commandSupportsClaim(command) {
  return command.exitCode === 0 && !outputIndicatesFailure(command.output);
}

function outputIndicatesFailure(output) {
  const text = String(output || '');
  return /\bnot ok\b/i.test(text)
    || /\b(?:fail(?:ed|ures?)?|errors?)\s*[:=]?\s*[1-9]\d*\b/i.test(text)
    || /\b[1-9]\d*\s+(?:tests?\s+)?failed\b/i.test(text)
    || /\b(?:FAILED|FATAL|TESTS FAILED)\b/.test(text);
}

function analyzeFilesTouched(turns) {
  const files = {};
  for (let position = 0; position < turns.length; position += 1) {
    const turn = turns[position];
    const index = turnIndex(turn, position);
    for (const command of commandsFor(turn)) {
      for (const filePath of extractWrittenPaths(command)) {
        if (!filePath) continue;
        files[filePath] ||= { writes: 0, turns: [], churn: false };
        files[filePath].writes += 1;
        if (!files[filePath].turns.includes(index)) files[filePath].turns.push(index);
      }
    }
  }
  for (const file of Object.values(files)) file.churn = file.writes >= 3;
  return files;
}

function extractWrittenPaths(command) {
  const text = commandText(command);
  const paths = [];

  for (const match of text.matchAll(/^\*\*\*\s+(?:Add|Update|Delete)\s+File:\s*(.+?)\s*$/gim)) {
    paths.push(cleanPath(match[1]));
  }

  for (const match of text.matchAll(/(?:^|\s)(?:>>|(?<![0-9&])>)\s*(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g)) {
    paths.push(cleanPath(match[1] || match[2] || match[3]));
  }
  for (const match of text.matchAll(/\bSet-Content\b[^\r\n;|]*?(?:-(?:Literal)?Path\s+)?(?:"([^"]+)"|'([^']+)'|([^\s;|]+))/gi)) {
    paths.push(cleanPath(match[1] || match[2] || match[3]));
  }
  for (const match of text.matchAll(/\bOut-File\b[^\r\n;|]*?(?:-FilePath\s+)?(?:"([^"]+)"|'([^']+)'|([^\s;|]+))/gi)) {
    paths.push(cleanPath(match[1] || match[2] || match[3]));
  }

  const tokens = shellTokens(text);
  const executable = (tokens[0] || '').toLowerCase().replace(/\.exe$/, '');
  if (['mv', 'move', 'move-item', 'cp', 'copy', 'copy-item'].includes(executable) && tokens.length >= 3) {
    paths.push(cleanPath(tokens.at(-1)));
  }
  if (['vi', 'vim', 'nvim', 'nano', 'code', 'notepad', 'notepad++'].includes(executable) && tokens.length >= 2) {
    paths.push(cleanPath(tokens.at(-1)));
  }
  if (executable === 'sed' && tokens.some((token) => /^-.*i/.test(token)) && tokens.length >= 2) {
    paths.push(cleanPath(tokens.at(-1)));
  }

  return paths.filter(looksLikePath);
}

function looksLikePath(value) {
  return /[.\\/]/.test(value) && !/[)};,]$/.test(value);
}

function commandText(command) {
  const args = command?.arguments;
  if (typeof args === 'string') return args;
  if (Array.isArray(args)) return args.map(argumentText).join('\n');
  if (!args || typeof args !== 'object') return '';
  const value = args.command ?? args.cmd ?? args.script ?? args.input ?? args.patch;
  return argumentText(value);
}

function argumentText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(argumentText).join('\n');
  if (!value || typeof value !== 'object') return '';
  return ['command', 'cmd', 'script', 'input', 'patch']
    .map((key) => argumentText(value[key]))
    .filter(Boolean)
    .join('\n');
}

function shellTokens(command) {
  return String(command).match(/"[^"]*"|'[^']*'|[^\s]+/g)?.map((token) => (
    token.replace(/^(["'])|(["'])$/g, '')
  )) || [];
}

function cleanPath(value) {
  return String(value || '').trim().replace(/^(["'])|(["'])$/g, '');
}

function analyzeTokens(turns) {
  let runningTotal = 0;
  const perTurn = turns.map((turn, position) => {
    const totalTokens = finiteNumber(turn?.tokenUsage?.totalTokens);
    runningTotal += totalTokens;
    const parsedCumulative = finiteNumber(turn?.tokenUsage?.cumulativeTotalTokens);
    const cumulativeTotalTokens = parsedCumulative || runningTotal;
    return { turnIndex: turnIndex(turn, position), totalTokens, cumulativeTotalTokens };
  });
  const totalTokens = perTurn.reduce((sum, turn) => sum + turn.totalTokens, 0);
  const cumulativeTotalTokens = perTurn.reduce((maximum, turn) => Math.max(maximum, turn.cumulativeTotalTokens), 0) || totalTokens;
  return { perTurn, totalTokens, cumulativeTotalTokens };
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function commandsFor(turn) {
  return Array.isArray(turn?.commands) ? turn.commands : [];
}

function turnIndex(turn, position) {
  return Number.isInteger(turn?.index) ? turn.index : position + 1;
}

module.exports = {
  analyzeSession,
};
