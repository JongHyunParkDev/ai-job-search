# JobPlanet (잡플래닛) URL Reference

Public, unauthenticated endpoints of the job-postings section of https://www.jobplanet.co.kr,
investigated 2026-10-20.

> Personal use only — keep volume low. See SKILL.md.

## robots.txt (User-agent: `*`)

Relevant disallows: `/search` (prefix, i.e. the site-wide search incl. `/search?...`),
`/apply`, `/info`, `/profile*`, `/users`, `/user-session/sign-in`, `/welcome/*` (incl. terms),
`/wizard/`, `/common`, `/companies/*/salaries_of_job_rank/`, `/partners/business_consulting`.

Paths this skill uses — all checked with `python tools/robots_check.py` → ALLOWED:

| Path | Status |
|------|--------|
| `/api/v3/job/postings?...` | allowed (no `/api` rule) |
| `/job/search?posting_ids[]=<id>` | allowed (`/job/search` is not under the `/search` prefix) |
| `/search?...` | **disallowed — never used** |

## Access / bot protection

The site is behind Cloudflare. On 2026-10-20 `curl` with `User-Agent: Mozilla/5.0 (compatible;
jobplanet-cli/1.0)` received `200` for every URL below, while Bun's `fetch` with the identical
UA and `Accept` header received `403` + `cf-mitigated: challenge` ("Just a moment..."). The CLI
does not attempt to pass the challenge; it reports the 403 as `SEARCH_FAILED` / `DETAIL_FAILED`.

## Search

```
GET https://www.jobplanet.co.kr/api/v3/job/postings
```

This is the endpoint the `/job` page's own client calls (`(0,n.A)("/api/v3/job/postings",
{params:{...filters,page,page_size:9}})`, seen in the Next.js chunk). The filters are
**comma-joined** strings (module `48270` in the same bundle: `occupation_level1: e.occupation_level1.join()`).

| Param | Meaning | Example |
|-------|---------|---------|
| `occupation_level1` | Level-1 category (직군) ids | `11600` (개발) |
| `occupation_level2` | Level-2 category (직무) ids | `11904` (백엔드 개발) · `11904,11605` |
| `city` | Region ids | `1` 서울 · `2` 경기 · `3` 인천 · `4` 부산 · `5` 대구 · `6` 대전 · `7` 광주 · `8` 울산 · `19` 세종 · `9` 강원 · `10` 경남 · `11` 경북 · `12` 전남 · `13` 전북 · `14` 충남 · `15` 충북 · `16` 제주 · `18` 해외 |
| `job_type` | Employment type | `3` 정규직 · `4` 계약직 (not exposed by the CLI) |
| `education_level_id` | Education | `3`–`9` (not exposed) |
| `years_of_experience` | Range `min,max` | (not exposed) |
| `review_score` | Rating filter | (values not investigated; not exposed) |
| `order_by` | Sort | `aggressive` (추천순, site default) · `recent` (최신순, CLI default) · `deadline` |
| `page` | 1-indexed page | `1` |
| `page_size` | Page size | site uses `9`; `50` and `100` verified to work. CLI uses `50`. |

**No keyword parameter.** `q`, `keyword` are silently ignored (total stays at the unfiltered
count, ~69,7k on 2026-10-20). Keyword search on JobPlanet is `/search`, which robots.txt
disallows — hence the CLI's query → category mapping and client-side text fallback.

The category tree (ids + Korean labels) is rendered server-side in the `/job` page's flight
payload under `display_filters` → `{"name":"occupation_level1", "data":[{label, value, data:[{label, value}]}]}`.
It is snapshotted in `cli/src/occupations.ts`.

### Response

```json
{ "status": "success", "code": 200,
  "data": { "total_count": 745,
            "recruits": [ { "id": 1755787, "title": "...", "cities": ["서울"],
                            "company": { "id": 311294, "name": "(주)...", "grade": 2.6, "grade_count": 259, "city_name": "서울" },
                            "occupation_names": { "level1": ["개발"], "level2": ["백엔드 개발", "개발"] },
                            "skills": [], "job_type": "정규직",
                            "start_at": "2026-10-20", "end_at": "2026-11-18", "created_at": "...+09:00",
                            "deadline_message": "~11/18(수)",
                            "posting_apply_type": "jobkorea_inlink", "external_url": "https://www.jobkorea.co.kr/...",
                            ... } ] } }
```

Field mapping: `id`→`id` (stringified), `title`, `company.name`→`company`, `cities[]`→`location`
(joined), `start_at`→`date`, `end_at`→`deadline`, `external_url`→`applyUrl`,
`company.grade`→`rating` (null when `grade_count` is 0 — the API sends `0.0` then),
`occupation_names.level2`→`occupations`. Each recruit is mapped independently.

## Detail

```
GET https://www.jobplanet.co.kr/job/search?posting_ids[]=<id>
```

(This is the canonical posting URL used in JobPlanet's own `job-posting-detail-sitemap-*.xml`.)
The HTML is a Next.js App Router page; content is in `self.__next_f.push([1,"..."])` flight
chunks. Parse anchors (after JSON-decoding and concatenating every chunk):

1. **JSON-LD**: `"__html":"<json string>"` whose decoded value has `"@type":"JobPosting"` —
   `title`, `description` (HTML, entity-encoded: decode, then strip tags), `datePosted`,
   `validThrough`, `employmentType` (`FULL_TIME` ...), `hiringOrganization.name/sameAs`,
   `jobLocation.address.addressRegion`.
2. **Hydrated posting object**: first `{"open":` after `hydrationState` (string-aware brace
   matching) — `open` (bool), `title`, `name` (company), `company_id`, `score` (company rating),
   `company.reviews.count`, `working_area[]`, `location` (address), `job_type`, `recruitment_text[]`,
   `annual.text`, `education_level_name`, `occupations[]`, `skills`, `start_at`, `end_at`
   (`2026.11.18`), `outlink_website`, and section fields `introduction`, `primary_responsibility`,
   `required_qualification`, `preferred_skill`, `benefit`, `hiring_process`, `etc` (often null
   for JobKorea-synced postings).

The posting object also embeds review snippets and salary/interview sub-scores; the CLI
**does not read or output** them.

A missing posting yields a page with neither anchor → `NOT_FOUND`.

`GET /api/v3/job/postings/<id>` returns 404 — there is no JSON detail endpoint at that path.
