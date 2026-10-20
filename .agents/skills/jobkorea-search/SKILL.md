---
name: jobkorea-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in South Korea on
  JobKorea (잡코리아, jobkorea.co.kr), find Korean job listings, or look up a
  specific JobKorea posting. Covers every sector and region in Korea (Seoul,
  Pangyo/Seongnam, Busan, Incheon, Daejeon, Daegu, Gwangju, ...), with Korean or
  English keywords. Trigger phrases: find a job in Korea, Korean job search,
  jobs in Seoul, JobKorea, 잡코리아, 채용공고, 채용정보, 구인, 구직, 취업,
  일자리, 신입 채용, 경력 채용, 공채, "서울 백엔드 개발자 채용", 이 공고 자세히 보여줘.
context: fork
enabled: false  # see "Personal use only" below; set to true to let /scrape include this portal
allowed-tools: Bash(bun run .agents/skills/jobkorea-search/cli/src/cli.ts *)
---

# JobKorea Search Skill

Search live job listings on **JobKorea (잡코리아)**, one of South Korea's largest job
boards. No authentication, no API key, **zero runtime dependencies** - it runs with just
`bun`. Results carry Korean-market fields alongside the standard ones: career level
(경력), education (학력), employment type (고용형태), deadline (마감일) and job category.

## ⚠️ Personal use only

JobKorea's `robots.txt` (v3.0, 2026-08-21) blocks AI *training* crawlers outright but
lists `Claude-User` among the "AI Search/Citation Crawlers (Public Content Only)", which
may fetch public pages; the search and posting paths this skill uses are not disallowed
for that group or for `*`. JobKorea's Terms of Service (이용약관) could not be retrieved
when this skill was built, and JobKorea has gone to court over automated collection of its
listings by a competitor in the past. So: **keep volume low, use it only for your own
job search, never commercially or for bulk data collection**, and run it on your own
responsibility. The skill ships with `enabled: false` for that reason; flip it to `true`
once you have read the current 이용약관 yourself.

## When to use this skill

- Search JobKorea for openings by role, skill or company (Korean or English keywords)
- Find recent postings (`--jobage`)
- Get the full 상세요강 (description), salary, working hours and deadline of one posting

## Commands

### Search job listings

```bash
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` - **required.** Keywords, e.g. `"백엔드 개발자"`, `"data analyst"`, `"카카오"`.
- `--jobage <days>` - posted within N days. JobKorea has no server-side age filter, so this sorts by 등록일 (newest first) and filters the page client-side; a page may then hold fewer than 20 results.
- `--page <n>` - page number (1-indexed, 20 organic results per page; ads are excluded).
- `--limit <n>` / `-n <n>` - cap total results emitted (client-side).
- `--format json|table|plain` - default `json`.

**No `--location` flag.** The server-rendered search page ignores JobKorea's area filter
parameter, so location goes inside `--query` (e.g. `"백엔드 판교"`, `"간호사 부산"`). Area
words only influence relevance ranking; they do not strictly filter, so check the
`location` field of each result.

### Fetch full job detail

```bash
bun run .agents/skills/jobkorea-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric posting id from `search` (e.g. `50087398`); a
`https://www.jobkorea.co.kr/Recruit/GI_Read/<id>` URL also works. Returns title, company,
work address, 경력, 학력, 고용형태, 급여, 근무시간, 모집분야, posted date, deadline and the
full description text (2 requests: the posting page and its 상세요강 frame).

## Usage examples

```bash
# Backend developer roles (Korean query)
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search -q "백엔드 개발자" --format table

# Data analyst roles mentioning Seoul, posted in the last 7 days
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search -q "데이터 분석 서울" --jobage 7 --format table

# Frontend roles around Pangyo, page 2
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search -q "프론트엔드 판교" --page 2 --format table

# English query, nurses in Busan
bun run .agents/skills/jobkorea-search/cli/src/cli.ts search -q "nurse 부산" --limit 10 --format plain

# Full details for one posting
bun run .agents/skills/jobkorea-search/cli/src/cli.ts detail 50087398 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default - programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON: `{ "meta": { "count", "page", "total" }, "results": [ { "id", "title",
"company", "location", "date", "url", "deadline", "openUntilFilled", "career",
"education", "employmentType", "jobCategory" } ] }`. Missing values are `null`. `total`
is JobKorea's reported hit count for the query.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data comes from JobKorea's public, server-rendered search page and posting pages; no credentials are needed. The CLI identifies itself honestly (`Mozilla/5.0 (compatible; jobkorea-cli/1.0)`).
- Search results are read from the structured job list JobKorea embeds in the page, so sponsored cards ("나에게 꼭 맞는 공고" and interleaved ad slots) are not returned.
- `location` is the first work area plus `외 N` when a posting lists several, e.g. `서울 서초구 외 1`. `detail` returns the full street address.
- `date` is the posting's registration time (ISO, KST). `deadline` is the application end time; postings with no fixed deadline (상시채용 / 채용시 마감) have `deadline: null` and `openUntilFilled: true`.
- Some postings put the whole 상세요강 in an image; `detail` then returns little or no description text.
- The CLI retries 429/5xx with exponential backoff and jitter. Keep volume low (see above).
