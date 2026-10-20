# Wanted (원티드) URL Reference

Public, unauthenticated JSON endpoints used by this skill — the same ones the
wanted.co.kr frontend calls. Verified 2026-10-20 with the CLI's honest User-Agent
`Mozilla/5.0 (compatible; wanted-cli/1.0)` (HTTP 200, `application/json`).

> Personal use only. `https://www.wanted.co.kr/robots.txt` returned CloudFront
> `403 Request blocked` to every client tried (the honest UA, `Claude-User`, and a
> Chrome UA; both `www.` and bare host), so the robots policy is **unconfirmed**.
> Keep volume low.

## Keyword search

```
GET https://www.wanted.co.kr/api/v4/search
```

| Param | Meaning | Example |
|-------|---------|---------|
| `query` | Keywords (Korean/English) | `백엔드` |
| `tab` | Result tab | `position` |
| `result_items` | Restrict sections returned (repeatable) | `jobs` |
| `country` | Market | `kr` |
| `locations` | Region/district key, repeatable (OR) | `all` · `seoul` · `seoul.gangnam-gu` · `busan` |
| `years` | Experience; keeps postings whose `[annual_from, annual_to]` covers it | `-1` (all) · `0` (신입) · `3` |
| `job_sort` | Sort | `job.latest_order` (CLI default) |
| `limit` / `offset` | Paging | `20` / `0`, `20`, ... |

Response: `{ links: {prev, next}, data: { jobs: [...], companies, tags, company_tags, recommend_tags } }`.
`links.next` is a relative URL with the next `offset`. No total count.

Note: `/api/chaos/search/v1/results?query=...` (the site's combined search page) also
answers 200, but it ignores `limit` (always 12 per section) and mixes companies, articles
and social posts; its `positions.links.next` points at `/api/chaos/search/v1/position`.
The CLI does not use it.

## Browse (no keyword)

```
GET https://www.wanted.co.kr/api/v4/jobs?country=kr&locations=all&years=-1&job_sort=job.latest_order&limit=20&offset=0
```

Same params as search minus `query`/`tab`/`result_items`. Response:
`{ links: {prev, next}, data: [...] }` — items in the same shape as `data.jobs` above.

## List item fields (search and browse)

| Field path | Contract field |
|------------|----------------|
| `id` | `id` (url = `https://www.wanted.co.kr/wd/<id>`) |
| `position` | `title` |
| `company.name` | `company` |
| `address.location` + `address.district` | `location` (`서울 강남구`) |
| `due_time` | `deadline` (`YYYY-MM-DD`; `null` = 상시채용) |
| `annual_from` / `annual_to` | `experienceMin` / `experienceMax` (`annual_to = 100` = open-ended → `null`) |
| `company.industry_name` | `industry` |
| `category_tags[].id` | `categoryIds` (ids only; no titles in the list response) |
| — | `date`: **no posting date exists** on list or detail responses |

Other fields seen: `status`, `address.location_key` (`seoul`), `address.district_key`
(`seoul.gangnam-gu`), `address.full_location`, `reward`, `logo_img`, `title_img`,
`company.application_response_stats`, `like_count`.

## Detail

```
GET https://www.wanted.co.kr/api/v4/jobs/<id>
```

Response `{ job: {...}, application, like_users }`. `job` has the list fields plus:

| Field path | Meaning |
|------------|---------|
| `job.detail.intro` | 포지션 소개 |
| `job.detail.main_tasks` | 주요업무 |
| `job.detail.requirements` | 자격요건 |
| `job.detail.preferred_points` | 우대사항 |
| `job.detail.benefits` | 혜택 및 복지 |
| `job.skill_tags[].title` | Skill tags (may be empty) |
| `job.company_tags[].title` | Company badges (e.g. 연봉상위6~10%) |
| `job.address.full_location` | Street address |
| `job.status` | `active` for open postings |

Detail text is plain text with `\n` line breaks (no HTML), but contains zero-width
spaces (U+200B) which the CLI strips. `job.address` here has no `district`.
An unknown id returns 404 → `NOT_FOUND`.

## Region keys

`seoul, busan, daegu, incheon, gwangju, daejeon, ulsan, sejong, gyeonggi, gangwon,
chungbuk, chungnam, jeonbuk, jeonnam, gyeongbuk, gyeongnam, jeju`. `seoul`, `busan`
(accepted), `gyeonggi` and `daejeon` were exercised live; `seoul.gangnam-gu` was verified
as a district key. District keys follow `<region>.<district>` as in `address.district_key`.

## Job pages

`https://www.wanted.co.kr/wd/<id>` is the human-facing page (used only as the result
`url`; the CLI never fetches it).
