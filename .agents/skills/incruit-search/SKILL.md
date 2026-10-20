---
name: incruit-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in South Korea on
  Incruit (인크루트), find Korean job listings, or look up a specific Incruit
  job posting. Covers all sectors and roles (IT/software, data, sales,
  manufacturing, finance, public sector, headhunting and dispatch postings)
  across Korean regions such as 서울, 경기, 부산, 대구, 인천, 대전, 광주, 울산.
  Trigger phrases: find a job in Korea, Korean job search, jobs in Seoul,
  Incruit, job openings in Korea, 채용공고, 채용정보, 구인, 구직, 취업,
  일자리, 인크루트, 인크루트 채용, 채용 검색, 신입 채용, 경력직 채용,
  "서울 백엔드 개발자 채용 찾아줘", look up this Incruit posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/incruit-search/cli/src/cli.ts *)
---

# Incruit Search Skill

Search live job listings on **Incruit (인크루트)**, one of South Korea's large general
job portals. No authentication, no API key, and **zero runtime dependencies** — it runs
with just `bun`. Postings are in Korean; queries can be Korean or English (e.g. `java`).

## ⚠️ Personal use only

This reads Incruit's public search and posting pages. Incruit's main site
(`www.incruit.com`) disallows all generic crawlers in its robots.txt, and Korean job
portals' terms commonly prohibit automated collection of postings. The CLI only uses
hosts/paths whose robots.txt permits generic agents (`search.incruit.com/list/`,
`job.incruit.com/jobdb_info/jobpost.asp`), but **keep volume low, don't use it
commercially or for bulk data collection, and run it on your own responsibility.**

## When to use this skill

- Search Korean job openings by keyword (role, skill, company), optionally by region
- Filter to recently registered postings (`--jobage`)
- Get the summary details of a specific Incruit posting (salary, experience, deadline)

## Commands

### Search job listings

```bash
bun run .agents/skills/incruit-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Keywords (job title, skill, company). Korean or English.
- `--location <text>` / `-l <text>` — region, e.g. `"서울"`, `"부산"`, `"경기 성남시"`. Incruit has no
  separate location parameter, so this is appended to the keyword search **and** applied as a
  client-side filter on each card's location (whitespace-insensitive substring match).
- `--jobage <days>` — registered within N days. Incruit has no posting-age parameter, so this is a
  **client-side filter on the fetched page** (registration date comes from the posting ID). Results
  stay in relevance order, so a small `--jobage` may return few results; check `--page 2`, `3` too.
- `--page <n>` — page number (1-indexed, 30 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch job detail

```bash
bun run .agents/skills/incruit-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the 13-digit posting ID from `search` (e.g. `2610110000086`). A full
`https://job.incruit.com/jobdb_info/jobpost.asp?job=...` URL also works. Returns title, company,
location, employment type (고용형태), experience (경력), education (학력), salary (급여조건),
registration date, deadline (마감), street address, company website, active status, and a
description summary.

## Usage examples

```bash
# Backend developer roles in Seoul
bun run .agents/skills/incruit-search/cli/src/cli.ts search -q "백엔드 개발자" -l "서울" --format table

# Data analyst roles registered in the last 14 days
bun run .agents/skills/incruit-search/cli/src/cli.ts search -q "데이터 분석" --jobage 14 --format table

# Production engineering roles in Ulsan
bun run .agents/skills/incruit-search/cli/src/cli.ts search -q "생산기술" -l "울산" --format table

# Entry-level marketing roles in Busan, second page
bun run .agents/skills/incruit-search/cli/src/cli.ts search -q "마케팅 신입" -l "부산" --page 2 --format table

# English skill keyword, Pangyo/Seongnam area
bun run .agents/skills/incruit-search/cli/src/cli.ts search -q "java" -l "성남시" --limit 10

# Details for one posting
bun run .agents/skills/incruit-search/cli/src/cli.ts detail 2610110000086 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single posting (`detail`) or a readable list |

Search JSON: `{ "meta": { "count", "page" }, "results": [ { id, title, company, companyUrl,
location, date, url, experience, education, employmentType, jobCategory, deadline, postedText } ] }`.
Missing values are `null`. `date` is the registration date (YYYY-MM-DD); `deadline` is Incruit's
raw text (`~11.10 (화)`, `채용시` = until filled); `postedText` is the relative text (`9일전 등록`,
`2시간전 수정`).

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Pages are EUC-KR (CP949). The CLI decodes them and sends the keyword EUC-KR percent-encoded,
  which is what `search.incruit.com` expects (its own search form submits EUC-KR).
- Multi-word queries are matched loosely (any word may match); put the most specific term first and
  prefer 1–2 words. The default relevance order handles this well; newest-first ordering does not,
  which is why the CLI does not use it.
- Results mix regular postings (채용정보), headhunting (헤드헌팅) and dispatch (파견대행) listings,
  as on the site.
- `detail` description is the summary Incruit publishes in the page's meta description (the first
  ~200 characters of the posting body). The full body is rendered in an iframe under
  `job.incruit.com/s_common/`, which robots.txt disallows for AI search agents, so the CLI does not
  fetch it — open the `url` for the full text.
- Posting IDs start with the registration date (`YYMMDD…`), which is how `date` and `--jobage` work.
- A removed/unknown posting returns `{"code":"NOT_FOUND"}` (Incruit redirects it to a list page).
- The CLI retries 429/5xx with exponential backoff and jitter; requests time out after 15 s.
