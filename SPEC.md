# Flight Recorder for Codex — Product Spec

## One-liner
A flight recorder for AI coding agents: parses local Codex session logs and turns an opaque agent run into a review-ready report — timeline, claims-vs-evidence, risk heatmap, and token burn.

## The pain we solve
1. **Opacity.** When a Codex run fails or finishes, users can't easily see *what the agent actually did*.
2. **Trust.** The agent says "done, tests pass" — did it actually run them? What did they output?
3. **Review fatigue.** Reviewing agent diffs is exhausting; nobody tells you *where to look first*.
4. **Cost opacity.** Long agent runs burn tokens unpredictably; there's no per-turn breakdown.

## Data source
Codex CLI/Desktop writes rollout logs to `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl`.
Each line is JSON: `{"timestamp": "<ISO8601>", "type": "<record type>", "payload": {...}}`.

Observed record types (from real logs, cli_version 0.144.x):
- `session_meta` — payload has `id`, `timestamp`, `cwd`, `originator` (e.g. "Codex Desktop"), `cli_version`, `source` (may indicate subagent sessions, e.g. `{subagent:{other:"guardian"}}`), `base_instructions`.
- `turn_context` — per-turn context (model, cwd, approval policy).
- `response_item` — payload `.type` is one of:
  - `message` — role + content (user or assistant message).
  - `reasoning` — agent reasoning summaries.
  - `function_call` — tool invocation; `name` (e.g. `shell`), `arguments` (JSON string, e.g. `{"command":[...]}`), `call_id`.
  - `function_call_output` — `call_id` + `output` (command stdout/stderr, exit info).
  - `custom_tool_call` / `custom_tool_call_output` — same idea, other tool surface.
- `event_msg` — payload `.type` is one of: `task_started`, `task_complete`, `user_message`, `agent_message`, `token_count` (token usage snapshots), `web_search_end`, `thread_settings_applied`, etc.
- `world_state` — occasional environment snapshots.

Parser rule: **tolerate unknown types** — skip gracefully, never crash. Real logs vary between CLI versions.

## MVP (hackathon scope)
CLI named `flightrec`, Node.js >= 20, **zero runtime dependencies**, published layout ready for `npm i -g`.

Commands:
1. `flightrec list` — table of local sessions: date, session id (short), originator, cwd, turns, duration, approx tokens. Most recent first. Flag `--dir <path>` overrides the sessions root (default `~/.codex/sessions`). Skip subagent/guardian sessions by default; `--all` includes them.
2. `flightrec report [session-id|latest]` — generates a **self-contained HTML file** (no external assets, inline CSS/JS) and prints its path. Flag `--open` opens it in the default browser. `latest` (default) = most recent non-subagent session.

Report sections:
- **Header**: session id, date, duration, cwd, model, originator, total tokens.
- **Timeline**: every turn as a card — user ask → agent reasoning summary (collapsed) → commands run (with exit status) → agent reply. Failed commands highlighted red.
- **Claims vs Evidence**: extract assertions from agent messages (regex/heuristics for: "tests pass", "verified", "works", "fixed", "done", "successfully", and their variants). For each claim, look for supporting evidence in the same or previous turn: a test-like command (`test`, `pytest`, `node --test`, `npm test`, `cargo test`, etc.) with a zero exit and passing output. Verdict per claim: ✅ Evidence found / ⚠️ Partial / ❌ No evidence. This table is the hero feature.
- **Files touched**: parse shell commands and apply_patch payloads for file writes/edits; count times each file was rewritten. Files edited 3+ times get a "churn" badge (review-here signal).
- **Token burn**: per-turn token usage bar chart (pure inline SVG), cumulative total.

## Architecture
```
bin/flightrec.js      — CLI entry (arg parsing, command dispatch)
src/discover.js       — find session files under sessions root
src/parser.js         — JSONL -> normalized Session model {meta, turns[], events[]}
src/analyze.js        — claims extraction, evidence matching, files-touched, churn, token stats
src/render.js         — Session + Analysis -> self-contained HTML string
test/                 — node:test unit tests
test/fixtures/        — SYNTHETIC session logs (never real user logs; hand-crafted per schema above)
```

## Non-goals (MVP)
No cloud sessions API, no live tailing, no multi-session diffing, no server. Post-hackathon roadmap only.

## Quality bar
- `node --test` green at every commit.
- Fixture-driven tests for parser and analyzer (including a malformed-lines fixture).
- Report must render correctly offline (double-click the HTML file).
