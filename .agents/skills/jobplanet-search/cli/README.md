# jobplanet-cli

CLI for searching job postings on **JobPlanet (잡플래닛)**, South Korea, including each hiring
company's public JobPlanet rating.

**Data source**: `GET https://www.jobplanet.co.kr/api/v3/job/postings` (search, JSON) and
`https://www.jobplanet.co.kr/job/search?posting_ids[]=<id>` (detail, server-rendered HTML).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch` + regex/JSON parsing). `bun install` only pulls dev type defs.

> **Personal use only.** Keep volume low, don't use it commercially or for bulk data collection,
> and run it on your own responsibility.

> **Known issue (2026-10-20):** JobPlanet's Cloudflare front answers Bun's `fetch` with a 403
> bot challenge, although curl with the same honest User-Agent gets 200. The CLI does not try to
> get around the challenge; live calls may exit 1 with `SEARCH_FAILED`/`DETAIL_FAILED`. See
> `../url-reference.md`.

## Installation

```bash
cd .agents/skills/jobplanet-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search postings (`--query`, `--location`, `--jobage`, `--page`, `--limit`, `--format`) |
| `detail` | Fetch one posting by id or JobPlanet URL |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search -q "백엔드" -l 서울 --format table
bun run src/cli.ts search -q "데이터" -l "서울,경기" --jobage 7
bun run src/cli.ts detail 1755787 --format plain
```

## Tests

```bash
bun run typecheck
bun run test                 # offline: fixtures + mocked fetch
JOBPLANET_LIVE=1 bun run test   # adds one live search smoke test
```
