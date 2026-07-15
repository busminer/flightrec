'use strict';

const OUTPUT_LINE_LIMIT = 30;

function renderReport(session, analysis) {
  const safeSession = session || {};
  const meta = safeSession.meta || {};
  const turns = Array.isArray(safeSession.turns) ? safeSession.turns : [];
  const safeAnalysis = analysis || {};
  const claims = Array.isArray(safeAnalysis.claims) ? safeAnalysis.claims : [];
  const summary = safeAnalysis.summary || {};
  const claimCounts = summary.claims || {};
  const filesTouched = safeAnalysis.filesTouched || {};
  const tokens = safeAnalysis.tokens || { perTurn: [], totalTokens: 0, cumulativeTotalTokens: 0 };
  const sessionId = meta.id || 'unknown';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Flight Recorder · ${escapeHtml(shortId(sessionId))}</title>
  <style>
    :root{color-scheme:dark;--bg:#0d1117;--panel:#131a22;--panel2:#18212b;--line:#2b3542;--text:#e6edf3;--muted:#8b98a8;--amber:#f0b429;--green:#3fb950;--red:#f85149;--blue:#58a6ff;--mono:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 85% 0,#182331 0,transparent 34rem),var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
    .shell{max-width:1280px;margin:auto;padding:34px 24px 64px}.eyebrow,.label,th{font:700 11px/1.3 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--amber)}h1,h2,h3,p{margin-top:0}h1{font:700 clamp(25px,4vw,42px)/1.1 var(--mono);margin-bottom:10px}h2{font:700 21px/1.2 var(--mono);margin-bottom:18px}h3{font:700 15px/1.35 var(--mono);margin-bottom:12px}.muted{color:var(--muted)}.mono,code,pre{font-family:var(--mono)}
    .hero{border:1px solid var(--line);border-top:3px solid var(--amber);border-radius:12px;background:linear-gradient(140deg,rgba(24,33,43,.96),rgba(16,23,31,.96));padding:25px;box-shadow:0 16px 55px rgba(0,0,0,.24)}.identity{display:flex;gap:20px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.status-light{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--green);box-shadow:0 0 12px var(--green);margin-right:9px}.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-top:22px}.meta-cell{min-width:0;background:var(--panel);padding:13px 15px}.meta-value{display:block;margin-top:5px;font-family:var(--mono);overflow-wrap:anywhere}.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.chip,.badge{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:999px;background:#111820;padding:5px 10px;font:700 12px/1.2 var(--mono)}.chip b{color:var(--amber)}
    section{margin-top:42px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:16px}.panel{border:1px solid var(--line);border-radius:10px;background:rgba(19,26,34,.94);overflow:hidden}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse}th{text-align:left;background:#10161e;padding:12px 14px;white-space:nowrap}td{padding:13px 14px;border-top:1px solid var(--line);vertical-align:top}.claim-text{min-width:270px}.badge.supported{color:#7ee787;border-color:#2f6f3d;background:#102819}.badge.partial,.badge.churn{color:#f6c85f;border-color:#775c20;background:#2a210e}.badge.unsupported{color:#ff7b72;border-color:#873834;background:#301716}.empty{padding:25px;color:var(--muted);text-align:center}
    details{border:1px solid var(--line);border-radius:7px;background:#0f151c}summary{cursor:pointer;padding:9px 11px;color:#c4ced8;font:600 12px/1.3 var(--mono)}details[open] summary{border-bottom:1px solid var(--line)}.detail-body{padding:11px}.evidence + .evidence{border-top:1px solid var(--line);margin-top:12px;padding-top:12px}.command-line{display:flex;gap:10px;align-items:flex-start}.dot{flex:0 0 auto;width:9px;height:9px;border-radius:50%;margin-top:6px;background:var(--muted)}.dot.ok{background:var(--green);box-shadow:0 0 8px rgba(63,185,80,.5)}.dot.fail{background:var(--red);box-shadow:0 0 8px rgba(248,81,73,.5)}code{overflow-wrap:anywhere;color:#d6e5f3}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:9px 0 0;padding:11px;border-radius:6px;background:#090d12;color:#b9c5d1;font-size:12px;line-height:1.5}.truncate-note{color:var(--amber);margin:7px 0 0;font:11px/1.4 var(--mono)}
    .timeline{display:grid;gap:16px}.turn{border:1px solid var(--line);border-left:3px solid #394658;border-radius:9px;background:var(--panel);overflow:hidden}.turn-head{display:flex;justify-content:space-between;align-items:center;padding:11px 15px;background:#10161e;border-bottom:1px solid var(--line)}.turn-number{color:var(--amber);font:700 12px/1 var(--mono)}.turn-body{display:grid;gap:15px;padding:15px}.message{border-left:2px solid var(--blue);padding:1px 0 1px 13px;white-space:pre-wrap;overflow-wrap:anywhere}.message.agent{border-color:var(--green)}.message-role{display:block;margin-bottom:5px;color:var(--muted);font:700 10px/1.2 var(--mono);letter-spacing:.1em}.commands{display:grid;gap:9px}.command{padding:11px;border:1px solid var(--line);border-radius:7px;background:#0f151c}.command-output{margin-top:9px}.command-output details{border:0;background:transparent}.command-output summary{padding:3px 0}.command-output details[open] summary{border:0}
    .chart{padding:18px}.chart svg{display:block;width:100%;height:auto;min-height:230px}.axis{stroke:#34404d;stroke-width:1}.grid{stroke:#25303b;stroke-width:1;stroke-dasharray:3 5}.bar{fill:#d8941b}.bar:hover{fill:#f0b429}.line{fill:none;stroke:var(--green);stroke-width:3;stroke-linejoin:round}.point{fill:var(--green)}.svg-label{fill:#8b98a8;font:11px var(--mono)}.legend{display:flex;gap:18px;flex-wrap:wrap;margin:0 0 10px;color:var(--muted);font:12px var(--mono)}.key{display:inline-block;width:12px;height:3px;margin-right:7px;vertical-align:middle;background:var(--amber)}.key.line-key{background:var(--green)}
    footer{margin-top:42px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font:12px var(--mono)}
    @media(max-width:650px){.shell{padding:20px 13px 40px}.hero{padding:18px}td,th{padding:10px}.hide-mobile{display:none}}
  </style>
</head>
<body>
<main class="shell">
  ${renderHeader(meta, sessionId, summary, claimCounts, tokens)}
  ${renderClaims(claims)}
  ${renderTimeline(turns)}
  ${renderFiles(filesTouched)}
  ${renderTokenBurn(tokens)}
  <footer>FLIGHTREC · OFFLINE REPORT · GENERATED ${escapeHtml(new Date().toISOString())}</footer>
</main>
</body>
</html>`;
}

function renderHeader(meta, sessionId, summary, claimCounts, tokens) {
  const totalTokens = tokens.cumulativeTotalTokens || tokens.totalTokens || meta.approxTokens || 0;
  return `<header class="hero" data-section="header">
    <div class="identity"><div><div class="eyebrow"><span class="status-light"></span>Session telemetry</div><h1>${escapeHtml(shortId(sessionId))}</h1><div class="muted mono">${escapeHtml(sessionId)}</div></div><div class="badge supported">RECORDER DATA READY</div></div>
    <div class="meta-grid">
      ${metaCell('Date', formatDate(meta.timestamp || meta.startTime))}${metaCell('Duration', formatDuration(meta.durationMs))}${metaCell('Working directory', meta.cwd || '—')}${metaCell('Model', meta.model || '—')}${metaCell('Originator', meta.originator || '—')}${metaCell('Total tokens', formatNumber(totalTokens))}
    </div>
    <div class="chips">
      ${chip('Turns', summary.turns)}${chip('Commands', summary.commands)}${chip('Failed', summary.failedCommands)}${chip('Claims supported', claimCounts.supported)}${chip('Partial', claimCounts.partial)}${chip('Unsupported', claimCounts.unsupported)}${chip('Churn files', summary.churnedFiles)}
    </div>
  </header>`;
}

function renderClaims(claims) {
  const rows = claims.map((claim) => `<tr>
    <td class="mono">#${escapeHtml(claim.turnIndex)}</td><td class="claim-text">${escapeHtml(claim.sentence)}</td><td class="mono">${escapeHtml(formatClaimType(claim.claimType))}</td><td>${verdictBadge(claim.verdict)}</td>
    <td>${renderEvidence(claim.evidenceCommands)}</td>
  </tr>`).join('');
  return `<section data-section="claims-vs-evidence"><div class="section-head"><div><div class="eyebrow">Trust, but verify</div><h2>Claims vs Evidence</h2></div><span class="muted mono">${claims.length} claims</span></div><div class="panel table-wrap">${rows ? `<table><thead><tr><th>Turn</th><th>Claim</th><th>Type</th><th>Verdict</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">No claims detected in this session.</div>'}</div></section>`;
}

function renderEvidence(commands) {
  if (!Array.isArray(commands) || commands.length === 0) return '<span class="muted mono">No matching command</span>';
  return `<details><summary>${commands.length} matched command${commands.length === 1 ? '' : 's'}</summary><div class="detail-body">${commands.map((command) => `<div class="evidence">${renderCommandLine(command)}${renderOutput(command.output, false, 8)}</div>`).join('')}</div></details>`;
}

function renderTimeline(turns) {
  const cards = turns.map((turn, position) => {
    const index = Number.isInteger(turn?.index) ? turn.index : position + 1;
    const user = renderMessages(turn?.userMessages, 'USER', 'message', stripLeadingInjectedBlocks);
    const agent = renderMessages(turn?.agentMessages, 'AGENT', 'message agent');
    const reasoning = Array.isArray(turn?.reasoning) && turn.reasoning.length
      ? `<details><summary>Reasoning summary</summary><div class="detail-body">${turn.reasoning.map((item) => `<div class="message">${escapeHtml(item)}</div>`).join('')}</div></details>` : '';
    const commands = Array.isArray(turn?.commands) && turn.commands.length
      ? `<div><div class="label">Commands</div><div class="commands">${turn.commands.map((command) => `<div class="command">${renderCommandLine(command)}${renderOutput(command.output, true)}</div>`).join('')}</div></div>` : '';
    return `<article class="turn"><div class="turn-head"><span class="turn-number">TURN ${escapeHtml(index)}</span><span class="muted mono">${escapeHtml(formatDate(turn?.timestamp))}</span></div><div class="turn-body">${user || '<div class="muted">No user message captured.</div>'}${reasoning}${commands}${agent || '<div class="muted">No agent reply captured.</div>'}</div></article>`;
  }).join('');
  return `<section data-section="timeline"><div class="section-head"><div><div class="eyebrow">Black box playback</div><h2>Timeline</h2></div><span class="muted mono">${turns.length} turns</span></div><div class="timeline">${cards || '<div class="panel empty">No turns captured.</div>'}</div></section>`;
}

function renderFiles(filesTouched) {
  const entries = Object.entries(filesTouched).sort((left, right) => Number(right[1].churn) - Number(left[1].churn) || right[1].writes - left[1].writes || left[0].localeCompare(right[0]));
  const rows = entries.map(([filePath, file]) => `<tr><td><code>${escapeHtml(filePath)}</code></td><td class="mono">${escapeHtml(file.writes)}</td><td class="mono">${escapeHtml((file.turns || []).map((turn) => `#${turn}`).join(', '))}</td><td>${file.churn ? '<span class="badge churn">CHURN · REVIEW</span>' : '<span class="muted mono">stable</span>'}</td></tr>`).join('');
  return `<section data-section="files-touched"><div class="section-head"><div><div class="eyebrow">Change surface</div><h2>Files Touched</h2></div><span class="muted mono">${entries.length} files</span></div><div class="panel table-wrap">${rows ? `<table><thead><tr><th>Path</th><th>Writes</th><th>Turns</th><th>Signal</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">No files touched in this session.</div>'}</div></section>`;
}

function renderTokenBurn(tokens) {
  const points = Array.isArray(tokens.perTurn) ? tokens.perTurn : [];
  return `<section data-section="token-burn"><div class="section-head"><div><div class="eyebrow">Cost telemetry</div><h2>Token Burn</h2></div><span class="muted mono">${formatNumber(tokens.cumulativeTotalTokens || tokens.totalTokens || 0)} total</span></div><div class="panel chart"><div class="legend"><span><i class="key"></i>per turn</span><span><i class="key line-key"></i>cumulative</span></div>${renderTokenChart(points)}</div></section>`;
}

function renderTokenChart(points) {
  if (points.length === 0) return '<div class="empty">No token usage captured.</div>';
  const width = Math.max(720, points.length * 90 + 90);
  const height = 270;
  const left = 52;
  const top = 20;
  const bottom = 48;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - 24;
  const maxTurn = Math.max(1, ...points.map((point) => Number(point.totalTokens) || 0));
  const maxCumulative = Math.max(1, ...points.map((point) => Number(point.cumulativeTotalTokens) || 0));
  const slot = plotWidth / points.length;
  const barWidth = Math.min(42, slot * 0.55);
  const bars = points.map((point, index) => {
    const value = Number(point.totalTokens) || 0;
    const barHeight = value / maxTurn * plotHeight;
    const x = left + index * slot + (slot - barWidth) / 2;
    const y = top + plotHeight - barHeight;
    return `<rect class="bar" x="${round(x)}" y="${round(y)}" width="${round(barWidth)}" height="${round(barHeight)}" rx="3"><title>Turn ${escapeHtml(point.turnIndex)}: ${formatNumber(value)} tokens</title></rect><text class="svg-label" x="${round(x + barWidth / 2)}" y="${height - 24}" text-anchor="middle">T${escapeHtml(point.turnIndex)}</text><text class="svg-label" x="${round(x + barWidth / 2)}" y="${round(Math.max(13, y - 6))}" text-anchor="middle">${escapeHtml(compactNumber(value))}</text>`;
  }).join('');
  const linePoints = points.map((point, index) => {
    const x = left + index * slot + slot / 2;
    const y = top + plotHeight - ((Number(point.cumulativeTotalTokens) || 0) / maxCumulative * plotHeight);
    return { x: round(x), y: round(y), value: Number(point.cumulativeTotalTokens) || 0 };
  });
  const polyline = linePoints.map((point) => `${point.x},${point.y}`).join(' ');
  const dots = linePoints.map((point) => `<circle class="point" cx="${point.x}" cy="${point.y}" r="4"><title>Cumulative: ${formatNumber(point.value)}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Per-turn and cumulative token usage"><line class="axis" x1="${left}" y1="${top + plotHeight}" x2="${width - 24}" y2="${top + plotHeight}"/><line class="grid" x1="${left}" y1="${top}" x2="${width - 24}" y2="${top}"/><text class="svg-label" x="8" y="${top + 4}">${escapeHtml(compactNumber(maxTurn))}</text>${bars}<polyline class="line" points="${polyline}"/>${dots}</svg>`;
}

function renderMessages(messages, role, className, transform = String) {
  if (!Array.isArray(messages)) return '';
  return messages
    .map((message) => transform(message))
    .filter((message) => String(message).trim())
    .map((message) => `<div class="${className}"><span class="message-role">${role}</span>${escapeHtml(message)}</div>`)
    .join('');
}

function stripLeadingInjectedBlocks(value) {
  let text = String(value ?? '');
  const leadingWrapper = /^\s*<([A-Za-z][\w:-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/;
  let match = text.match(leadingWrapper);
  while (match) {
    text = text.slice(match[0].length);
    match = text.match(leadingWrapper);
  }
  return text.trimStart();
}

function renderCommandLine(command) {
  const code = Number.isInteger(command?.exitCode) ? command.exitCode : null;
  const state = code === 0 ? 'ok' : code === null ? '' : 'fail';
  const exit = code === null ? 'exit unknown' : `exit ${code}`;
  return `<div class="command-line"><span class="dot ${state}" aria-hidden="true"></span><div><code>${escapeHtml(commandText(command) || command?.name || 'unknown command')}</code><div class="muted mono">${escapeHtml(exit)}</div></div></div>`;
}

function renderOutput(output, collapsible = false, lineLimit = OUTPUT_LINE_LIMIT) {
  if (output === null || output === undefined || output === '') return '';
  const truncated = truncateLines(output, lineLimit);
  const content = `<pre>${escapeHtml(truncated.text)}</pre>${truncated.omitted ? `<p class="truncate-note">Output truncated · ${truncated.omitted} more line${truncated.omitted === 1 ? '' : 's'}</p>` : ''}`;
  return collapsible ? `<div class="command-output"><details><summary>Command output</summary>${content}</details></div>` : content;
}

function truncateLines(value, limit = OUTPUT_LINE_LIMIT) {
  const lines = String(value).split(/\r?\n/);
  return { text: lines.slice(0, limit).join('\n'), omitted: Math.max(0, lines.length - limit) };
}

function commandText(command) {
  const args = command?.arguments;
  if (typeof args === 'string') return args;
  if (Array.isArray(args)) return args.map(valueText).join('\n');
  if (!args || typeof args !== 'object') return '';
  return valueText(args.command ?? args.cmd ?? args.script ?? args.input ?? args.patch);
}

function valueText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(valueText).join('\n');
  if (!value || typeof value !== 'object') return '';
  return JSON.stringify(value);
}

function verdictBadge(verdict) {
  const normalized = ['supported', 'partial', 'unsupported'].includes(verdict) ? verdict : 'unsupported';
  return `<span class="badge ${normalized}">${normalized.toUpperCase()}</span>`;
}

function metaCell(label, value) {
  return `<div class="meta-cell"><span class="label">${escapeHtml(label)}</span><span class="meta-value">${escapeHtml(value)}</span></div>`;
}

function chip(label, value) {
  return `<span class="chip">${escapeHtml(label)} <b>${escapeHtml(value ?? 0)}</b></span>`;
}

function formatClaimType(value) {
  return String(value || 'unknown').replaceAll('_', ' ');
}

function shortId(value) {
  return String(value || 'unknown').slice(0, 8);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours && `${hours}h`, (hours || minutes) && `${minutes}m`, `${seconds}s`].filter(Boolean).join(' ');
}

function formatNumber(value) {
  return Math.max(0, Number(value) || 0).toLocaleString('en-US');
}

function compactNumber(value) {
  const number = Math.max(0, Number(value) || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(number);
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

module.exports = {
  escapeHtml,
  renderReport,
};
