# jobkorea-cli

CLI for searching jobs on **JobKorea (잡코리아)**, South Korea's large general job board.

**Data source**: JobKorea's public pages - `/Search/` (search), `/Recruit/GI_Read/<id>` and
`/Recruit/GI_Read_Comt_Ifrm?Gno=<id>` (detail). See `../url-reference.md`.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch` + regex). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** Keep volume low, don't use it commercially or for bulk data
> collection, and run it on your own responsibility. JobKorea's 이용약관 could not be
> reviewed when this CLI was written; read it before relying on the tool.

## Installation

```bash
cd .agents/skills/jobkorea-search/cli
bun install   # optional - only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job listings (`--query` required) |
| `detail` | Fetch full detail for a single posting |

`search` accepts `--query/-q`, `--jobage`, `--page`, `--limit/-n`, `--format json|table|plain`
(default `json`). There is no `--location`: put the city in the query. `detail` accepts
`--format json|plain`. Errors go to **stderr** as `{ "error": "...", "code": "..." }`, exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search -q "백엔드 개발자" --format table
bun run src/cli.ts search -q "마케팅 서울" --jobage 3 --format table
bun run src/cli.ts detail 50087398 --format plain
```

## Tests

```bash
bun run typecheck
bun run test   # offline parsing/validation tests + a 3-request live smoke test
```
