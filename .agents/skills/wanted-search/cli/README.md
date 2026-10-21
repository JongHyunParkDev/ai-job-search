# wanted-cli

CLI for searching job postings on [Wanted (원티드)](https://www.wanted.co.kr), South
Korea, via the public JSON API its website uses.

**Data source**: `GET /api/v4/search` (keyword search), `GET /api/v4/jobs` (browse latest), `GET /api/v4/jobs/<id>` (detail). See `../url-reference.md`.
**Authentication**: None.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` only pulls dev type defs.

> Personal use only — Wanted's robots.txt could not be read (CloudFront 403 to every
> client), so automated-access permission is unconfirmed. Keep volume low.

## Installation

```bash
cd .agents/skills/wanted-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search [-q <keywords>] [-l <regions>] [--years <n>] [--page <n>] [--limit <n>] [--format json\|table\|plain]` | Search or browse postings, newest first, 20 per page |
| `detail <id\|url> [--format json\|plain]` | Full posting: sections, deadline, experience, skills |

`--jobage` is not supported (the API has no posting date) and exits 1 with `UNSUPPORTED_FLAG`.

## Examples

```bash
bun run src/cli.ts search -q "백엔드 개발자" -l 서울 --limit 5 --format table
bun run src/cli.ts search -q "프론트엔드" -l 경기,대전 --format plain
bun run src/cli.ts detail 393427 --format plain
```

## Tests

```bash
bun run typecheck
bun run test                 # offline: parser/flag tests on fixtures
WANTED_LIVE=1 bun run test   # adds one live search against wanted.co.kr
```
