---
name: saramin-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in South Korea on
  Saramin (사람인, saramin.co.kr), find Korean job listings, or look up a
  specific Saramin job posting. Covers all sectors and roles (IT/developer,
  data, design, marketing, sales, finance, manufacturing, etc.) across Korea:
  Seoul, Gyeonggi/Pangyo, Busan, Incheon, Daejeon, and more. Trigger phrases:
  find a job in Korea, Korean job search, jobs in Seoul, jobs in Pangyo, Saramin,
  look up this Saramin posting; 채용공고, 구인, 취업, 일자리, 사람인, 채용 검색,
  공고 찾아줘, 서울 개발자 채용, 판교 채용, 부산 일자리, 신입 채용, 경력 채용.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/saramin-search/cli/src/cli.ts *)
---

# Saramin Search Skill

Search live job postings on **Saramin (사람인)**, one of South Korea's largest general job
boards. Reads Saramin's public, server-rendered search and posting pages - no login, no API
key, and **zero runtime dependencies** (it runs with just `bun`).

> 사람인(saramin.co.kr)의 공개 채용공고 검색·상세 페이지를 읽어 오는 스킬입니다. 로그인이나 API 키가 필요하지 않습니다.

## ⚠️ Personal use only

Saramin's member terms (이용약관, checked 2026-10-20) say information obtained through the
service may not be copied, reproduced or provided to others without Saramin's prior consent,
that the service may be used only for job seeking, and that profit-making use of the site's
information and anything that disrupts stable operation of the service are prohibited.
robots.txt permits the search and posting paths this skill uses. **Keep volume low, use it
only for your own job search, and don't use it commercially, for bulk data collection, or to
republish postings.** Run it on your own responsibility.

## When to use this skill

- Search Korean job postings by keyword (Korean or English), optionally narrowed to a region or district
- Filter to recently registered/updated postings (`--jobage`)
- Get the full description, experience/education requirements, salary text and deadline of one posting

## Commands

### Search job listings

```bash
bun run .agents/skills/saramin-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` - **required.** Keywords: job title, skill, or company, e.g. `"백엔드"`, `"데이터 엔지니어"`, `"React"`.
- `--location <place>` / `-l <place>` - region or district. Provinces/cities: `서울`, `경기`, `인천`, `부산`, `대구`, `대전`, `광주` (Saramin groups it with 전남), `울산`, `세종`, `강원`, `충북`, `충남`, `전북`, `경북`, `경남`, `제주`, `전국`. Districts/hubs: `판교`/`성남`, `분당`, `수원`, `용인`, `화성`, `동탄`, `강남`, `서초`, `송파`, `마포`, `여의도`, `구로`, `가산`, `성수`, `해운대`, `서면`, `송도`, `유성`, `창원`, `청주`, `천안` and more. English romanizations (`Seoul`, `Busan`, `Pangyo`) and raw 6-digit Saramin region codes also work. Comma-separate several: `"서울,판교"`. An unknown place exits with `BAD_LOCATION` - put it in `--query` instead.
- `--jobage <days>` - only postings registered **or modified** within N days. Saramin has no posted-within URL parameter, so the CLI sorts by registration date and filters the fetched page client-side (a page can therefore return fewer than 40 results).
- `--page <n>` - page number (1-indexed, 40 results per page).
- `--limit <n>` / `-n <n>` - cap total results emitted (client-side).
- `--format json|table|plain` - default `json`.

Each result has `id`, `title`, `company`, `location`, `date`, `url`, plus Korean-market fields:
`dateType` (`registered` 등록일 / `modified` 수정일), `deadline` (as shown, e.g. `~ 11/18(수)`, `내일마감`, `채용시`),
`deadlineDate` (ISO, null for rolling 채용시/상시), `career` (경력), `education` (학력),
`employmentType` (근무형태), and `sectors` (job category / skill tags). `meta.total` is Saramin's total match count.

### Fetch full job detail

```bash
bun run .agents/skills/saramin-search/cli/src/cli.ts detail <rec_idx|url> [--format json|plain]
```

`rec_idx` is the numeric `id` from `search` (e.g. `55210151`); a saramin.co.kr posting URL
with `rec_idx=` also works. Returns title, company, `career`, `education`, `salary` (급여 text such
as `면접 후 결정`), `deadlineDate`, `homepage`, the full `description` text, and
`descriptionImageCount`. Detail makes two requests (posting summary + description body).

## Usage examples

```bash
# 서울 백엔드 개발자 공고 (Backend developer roles in Seoul)
bun run .agents/skills/saramin-search/cli/src/cli.ts search -q "백엔드 개발자" -l 서울 --format table

# 판교/성남 프론트엔드, 최근 7일 (Frontend roles in Pangyo, last 7 days)
bun run .agents/skills/saramin-search/cli/src/cli.ts search -q "프론트엔드" -l 판교 --jobage 7 --format table

# Data engineer roles in Busan, English query
bun run .agents/skills/saramin-search/cli/src/cli.ts search -q "data engineer" -l Busan --limit 10

# 서울 + 판교 동시 검색, 마케팅 신입 (Marketing roles in Seoul and Pangyo)
bun run .agents/skills/saramin-search/cli/src/cli.ts search -q "마케팅 신입" -l "서울,판교" --format table

# 부산 해운대 물류 관리 (Logistics roles in Haeundae, Busan), page 2
bun run .agents/skills/saramin-search/cli/src/cli.ts search -q "물류 관리" -l 해운대 --page 2

# 공고 상세 (Full details for one posting)
bun run .agents/skills/saramin-search/cli/src/cli.ts detail 55210151 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default - programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from Saramin's public HTML pages - no credentials. The CLI identifies itself honestly as `Mozilla/5.0 (compatible; saramin-cli/1.0)`.
- Saramin also offers an official Open API (`oapi.saramin.co.kr/job-search`, requires an issued access key). This skill does not use it.
- `date` is the date shown on the card, which is the **modification** date (수정일) for edited postings, not always the original posting date - check `dateType`.
- `deadlineDate` on search cards is inferred from `~ MM/DD` (no year shown); detail's `deadlineDate` comes from Saramin's own `YYYY-MM-DD`.
- Many postings are partly or wholly images; `descriptionImageCount > 0` with a short `description` means open the URL to read the rest.
- `detail` returns `location: null` and `date: null`: the posting page does not server-render them; use the values from `search`.
- Default ordering is Saramin's relevance ranking (정확도순); with `--jobage` it switches to newest-registered first (등록일순).
- Saramin may rate-limit; the CLI retries 429/5xx with exponential backoff and a 20 s per-request timeout. Keep volume low (see the terms note above).
