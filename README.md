# Flight Recorder (`flightrec`)

**A flight recorder for AI coding agents.** Your agent said *"tests pass."* Get the receipts.

Codex already writes a black box: every session leaves a complete rollout log on your disk. `flightrec` opens that black box and turns an opaque agent run into a review-ready report — so you can see what your agent *actually* did, and whether its claims survive the evidence.

Built for [OpenAI Build Week 2026](https://openai.devpost.com/) (Developer Tools track) — and built *by* the very thing it audits: every line of core functionality was written by Codex on GPT-5.6, then verified with this tool.

## The pain

- Your agent finishes and says **"done, all tests pass"** — did it actually run them? What did they output?
- A long run fails or hangs and you have **no idea what happened** inside.
- Reviewing agent diffs is exhausting, and nobody tells you **where to look first**.
- Tokens burn unpredictably, with **no per-run breakdown**.

## What you get

```
flightrec list                # every local Codex session: date, cwd, turns, duration, tokens
flightrec report latest       # cockpit-style HTML report for the newest session
flightrec report 019f6493     # ...or any session by id prefix
flightrec report latest --open
```

One self-contained HTML file per report. No server, no dependencies, no network — double-click and read:

- **Claims vs Evidence** *(the hero)* — every assertion the agent made ("tests pass", "9/9 passed", "fixed", in English and beyond) matched against the commands it actually ran and their exit codes. Verdicts: `SUPPORTED` / `PARTIAL` / `UNSUPPORTED`.
- **Black Box Playback** — the full timeline: user asks, agent reasoning (collapsed), every command with exit status and output, agent replies.
- **Files touched** — write counts per file, with **churn badges** on files the agent rewrote 3+ times: that's where your review should start.
- **Token burn** — per-turn usage chart and totals.

## Install

Requires Node.js ≥ 20. Zero runtime dependencies.

```
npm install -g flightrec
```

Or from source: `git clone`, then `node bin/flightrec.js list`.

## How it works

Codex CLI and Codex Desktop write session rollouts to `~/.codex/sessions/**/rollout-*.jsonl`. `flightrec` parses those JSONL records (messages, tool calls with outputs joined by `call_id`, token snapshots), runs an evidence-matching analysis over them, and renders a single HTML string. The parser is deliberately paranoid: malformed lines and unknown record types are counted and skipped, never fatal — logs vary across CLI versions. Reports are generated locally; your sessions never leave your machine.

## Built with Codex — the receipts

This repo practices what it preaches. The division of labor:

- **Codex (GPT-5.6)** wrote all product code, in sandboxed `codex exec` sessions, task by task against [SPEC.md](SPEC.md) under the rules in [AGENTS.md](AGENTS.md).
- **Claude** (Anthropic's agent) acted as architect and reviewing orchestrator: wrote the spec, dispatched tasks, reviewed every diff, ran the tests independently, and committed accepted work — since Codex's sandbox rightly refuses to touch `.git`. An AI supervising an AI, with a human captain above both.
- **Alex Kosa** — the human: direction, taste, and the final word.

Build sessions (local rollout ids, also visible in the commit messages):

| Session | Task |
|---|---|
| `019f6493-4c84-7631-a909-260d75ada475` | Task 1 — package scaffold, discovery, JSONL parser, `list` |
| `019f649c-a309-78f0-9642-e32dd31447ce` | Task 2 — analyzer: claims vs evidence, files touched, tokens |
| `019f64a2-8dee-75b1-acf8-d5849a551df8` | Task 2.5 — real-world fixes (see war story) |
| `019f64b4-6b40-75a0-9297-91248141b7c5` | Task 3 — cockpit HTML report + `report` command |
| `019f64c1-0fcd-7921-80d6-69a9a0b8acca` | Task 4 — release polish |

### War story: dogfooding from birth

The first logs `flightrec` ever analyzed were **the sessions in which Codex was building it**. That dogfooding caught what synthetic tests never would: the analyzer initially extracted *zero* claims from a real session (Codex reported results in Russian and in numeric forms like "9/9 passed") and hallucinated file paths out of code fragments. Both fixes shipped as Task 2.5.

Then, mid-build, we lived the exact pain this tool exists for: one build session **silently hung for 15 minutes**. The black box shows nothing — the hang predated the session log itself; the only recording begins 53 seconds before we killed the process, mid-command. That gap is now the top of the roadmap.

## Roadmap

- **Live mode** — tail a session as it runs, including the pre-log gap where hangs hide.
- **Session diffing** — compare two runs of the same task.
- **Distiller** — mine past sessions into project memory (AGENTS.md suggestions).
- **CI integration** — attach a flight report to every agent-authored PR.
- More agent log formats.

## License

[MIT](LICENSE) © 2026 Alex Kosa
