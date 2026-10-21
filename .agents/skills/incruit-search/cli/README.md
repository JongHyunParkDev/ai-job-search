# incruit-cli

CLI for searching jobs on **Incruit (인크루트)**, South Korea, across any sector.

**Data source**: `search.incruit.com/list/search.asp` (keyword search) and
`job.incruit.com/jobdb_info/jobpost.asp` (posting page + schema.org JSON-LD).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch` + regex). `bun install` is optional and only pulls dev type defs.
**Encoding**: the site is EUC-KR; responses are decoded with `TextDecoder("euc-kr")` and keywords are
EUC-KR percent-encoded via a table built from that decoder (Bun has no EUC-KR encoder).

> **Personal use only.** Keep volume low, don't use it commercially or for bulk data collection,
> and run it on your own responsibility. `www.incruit.com` disallows all generic crawlers and is never
> requested.

## Installation

```bash
cd .agents/skills/incruit-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job listings (`--query` required) |
| `detail` | Fetch one posting's details by ID or URL |

`search` accepts `--query/-q`, `--location/-l`, `--jobage`, `--page`, `--limit/-n`,
`--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search -q "백엔드 개발자" -l "서울" --format table
bun run src/cli.ts search -q "데이터 분석" --jobage 14 --format table
bun run src/cli.ts detail 2610110000086 --format plain
```

## Tests

```bash
bun run typecheck
bun run test                 # offline: parser tests on fixtures + argument validation
INCRUIT_LIVE=1 bun run test  # adds one live search and one live detail
```

See `../url-reference.md` for endpoints, parameters and parse anchors.
