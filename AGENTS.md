# AGENTS.md — rules for coding agents in this repo

## Project
`flightrec` — a flight recorder for Codex sessions. Read `SPEC.md` first in every session; it is the source of truth for scope and architecture.

## Hard rules
- Node.js >= 20, plain CommonJS or ESM (pick one, stay consistent), **zero runtime dependencies**. Dev dependencies: none needed — use built-in `node:test`.
- Never read from or copy the real `~/.codex/sessions` directory into the repo or tests. Test fixtures are synthetic, hand-written per the schema in SPEC.md.
- Every change lands with tests. Run `node --test` and make it pass before finishing a task.
- Windows is the primary dev machine: paths must work on win32 (use `path.join`, `os.homedir()`), and the HTML report must open via `start` on Windows / `open` on macOS / `xdg-open` on Linux.
- Parser must never crash on unknown record types or malformed lines — skip and count them.
- Keep functions small and pure where possible; `render.js` takes data in, returns an HTML string (no I/O inside).

## Git
- Commit your own work at the end of each task with a clear message describing what was built.
- Do not amend or rewrite history.

## Style
- No frameworks, no build step. The HTML report is one self-contained string template with inline CSS/JS/SVG.
- Prefer clear names over comments; comment only non-obvious constraints (e.g. schema quirks).
