# saramin-cli

CLI for searching job postings on **Saramin (사람인, saramin.co.kr)**, South Korea.

**Data source**: Saramin's public HTML pages (`/zf_user/search/recruit`, `/zf_user/jobs/relay/view`, `/zf_user/jobs/relay/view-detail`). See `../url-reference.md`.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch` + regex). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** Saramin's terms forbid copying/redistributing site information
> without consent and profit-making use of it. Keep volume low, use it for your own job
> search, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/saramin-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job postings (`--query` required; `--location`, `--jobage`, `--page`, `--limit`, `--format`) |
| `detail` | Fetch full detail for one posting by `rec_idx` or saramin.co.kr URL |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search -q "백엔드 개발자" -l 서울 --format table
bun run src/cli.ts search -q "프론트엔드" -l 판교 --jobage 7 --format table
bun run src/cli.ts search -q "data engineer" -l Busan --limit 10
bun run src/cli.ts detail 55210151 --format plain
```

## Tests

```bash
bun run typecheck
bun run test                 # offline: parser/validation tests + mocked fetch
SARAMIN_LIVE=1 bun run test  # adds one live search request
```
