---
name: jobplanet-search
version: 1.0.0
description: >
  Use this skill when the user wants to search job postings in South Korea on
  JobPlanet (잡플래닛, jobplanet.co.kr), filter Korean jobs by role category and
  region (서울, 경기, 부산, 대전 ...), see a hiring company's JobPlanet rating
  (기업 평점), or read the full detail of a JobPlanet posting. Trigger phrases:
  JobPlanet, jobs in Korea, Korean job search, Seoul jobs, developer jobs in Seoul,
  잡플래닛, 채용공고, 구인, 취업, 일자리, 채용 정보, 서울 채용, 백엔드 채용,
  개발자 채용, 신입 채용, 경력 채용, 잡플래닛 공고 찾아줘.
context: fork
enabled: false  # live fetches from Bun are currently blocked by a Cloudflare challenge (see Notes); set to true once verified working
allowed-tools: Bash(bun run .agents/skills/jobplanet-search/cli/src/cli.ts *)
---

# JobPlanet Search Skill

Search live job postings from **JobPlanet (잡플래닛)**, a major South Korean job and
company-review platform. Each result carries the hiring company's public **JobPlanet
rating** (기업 평점, 0–5) next to the posting, which is the site's differentiator.
No authentication, no API key, and **zero runtime dependencies** — it runs with just `bun`.

## ⚠️ Personal use only

This reads JobPlanet's public job-postings pages and the JSON endpoint behind them.
JobPlanet's terms page is itself excluded by robots.txt, so it was not reviewed; treat
automated access as restricted. **Keep volume low, do not use it commercially or for bulk
data collection,** and run it on your own responsibility. The CLI never requests paths
robots.txt disallows (`/search`, `/companies/*/salaries_of_job_rank/`, `/profile`, ...),
and it does not read salary or review pages.

## ⚠️ Current status (2026-10-20)

JobPlanet sits behind Cloudflare. During the build, plain `curl` with the CLI's honest
User-Agent got `200` from every endpoint below, but **Bun's `fetch` got `403` with
`cf-mitigated: challenge`** (a bot challenge) on the same URL with the same headers. The
CLI does **not** try to get around that challenge (no browser impersonation, no
fingerprint tricks), so live calls may fail with
`{"error":"Request failed: 403 Forbidden","code":"SEARCH_FAILED"}`. The parsers are
verified against responses captured with curl (see `cli/tests/fixtures/`). The skill ships
`enabled: false` until a live run from the CLI succeeds.

## When to use this skill

- Find open positions in Korea by role category (백엔드 개발, 데이터, 디자인, 마케팅 ...) and region
- Show newest postings first, optionally only those posted in the last N days
- Compare hiring companies by their JobPlanet rating
- Read one posting's details (employment type, experience, education, deadline, description)

## Commands

### Search job postings

```bash
bun run .agents/skills/jobplanet-search/cli/src/cli.ts search [flags]
```

Flags:
- `--query <text>` / `-q <text>` — role or keyword. JobPlanet's postings endpoint has **no
  free-text keyword parameter** (its keyword search lives under `/search`, which robots.txt
  disallows), so the query is resolved like this:
  - if it names a JobPlanet category — a level-1 group exactly (`데이터`, `디자인`, `개발`) or
    part of a level-2 label (`백엔드` → 백엔드 개발, `프론트엔드`, `UI/UX`, `PM`) — it is sent as
    a **server-side category filter** (`meta.queryMode: "occupation"`, labels in `meta.occupations`);
  - otherwise it is a **client-side keyword filter** over the fetched page (title, company,
    categories, skills; all words must match; `meta.queryMode: "text"`). Use `--page` to scan further.
- `--location <region>` / `-l <region>` — region filter, comma-separated for several:
  `서울, 경기, 인천, 부산, 대구, 대전, 광주, 울산, 세종, 강원, 경남, 경북, 전남, 전북, 충남, 충북, 제주, 해외`.
  English names (`Seoul`, `Busan`, `Gyeonggi`) and suffixed names (`서울특별시`) also work.
  City districts or towns (`판교`, `강남`) are **not** supported — JobPlanet filters by
  province/metro only (판교 → `경기`).
- `--jobage <days>` — posted within N days. JobPlanet has no date parameter, so this is a
  client-side filter on the posting's start date (KST) over the fetched page.
- `--page <n>` — 1-indexed page, 50 postings per page, newest first.
- `--limit <n>` / `-n <n>` — cap results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch posting detail

```bash
bun run .agents/skills/jobplanet-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric posting id from `search` (e.g. `1755787`). A JobPlanet URL also works
(`https://www.jobplanet.co.kr/job/search?posting_ids[]=1755787`, `https://b.jobplanet.co.kr/job-postings-1755787`).
Returns title, company, rating, region and address, employment type, experience,
education, categories, skills, posted/deadline dates, open/closed status, description,
and an external apply link when JobPlanet gives one.

## Usage examples

```bash
# Backend developer postings in Seoul
bun run .agents/skills/jobplanet-search/cli/src/cli.ts search -q "백엔드" -l 서울 --format table

# Data roles in Seoul or Gyeonggi (Pangyo is in 경기), posted in the last 7 days
bun run .agents/skills/jobplanet-search/cli/src/cli.ts search -q "데이터" -l "서울,경기" --jobage 7 --format table

# UI/UX designers in Busan
bun run .agents/skills/jobplanet-search/cli/src/cli.ts search -q "UI/UX" -l 부산 --format table

# Keyword not matching a category -> client-side filter (here: Java postings in Daejeon)
bun run .agents/skills/jobplanet-search/cli/src/cli.ts search -q "Java" -l 대전 --page 2

# Full detail of one posting
bun run .agents/skills/jobplanet-search/cli/src/cli.ts detail 1755787 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning (includes RATING column) |
| `plain` | Reading a single posting's full detail (`detail` command) |

JSON search output: `{ "meta": { "count", "page", "total", "queryMode", "occupations" }, "results": [...] }`.
Each result has `id`, `title`, `company`, `location`, `date`, `url` (always present, `null`
when missing) plus `companyId`, `deadline`, `applyUrl`, `jobType`, `occupations`, `skills`,
`rating` (company rating, `null` when the company has no reviews) and `ratingCount`.
`meta.total` is JobPlanet's server-side count before any client-side filtering.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data source: `GET https://www.jobplanet.co.kr/api/v3/job/postings` (JSON) for search and the
  server-rendered posting page `https://www.jobplanet.co.kr/job/search?posting_ids[]=<id>` for
  detail. Details and parse anchors: `url-reference.md`.
- Many postings are synced from JobKorea (`posting_apply_type: jobkorea_inlink/outlink`); their
  JobPlanet description can be short (often just the office address) and `applyUrl` points to
  jobkorea.co.kr. The CLI never fetches that link.
- The category list is a snapshot in `cli/src/occupations.ts` (21 groups, 209 roles, captured
  2026-10-20); regenerate it if JobPlanet changes categories.
- Retries 429/5xx with exponential backoff and jitter (max 6), 15 s timeout per request.
