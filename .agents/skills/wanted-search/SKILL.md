---
name: wanted-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in South Korea on
  Wanted (원티드, wanted.co.kr), find Korean job listings, or look up a specific
  Wanted job posting. Strongest for tech, startup and IT roles (developer,
  data, design, PM, marketing) in Seoul, Pangyo/Gyeonggi, Busan and other
  Korean cities. Trigger phrases: find a job in Korea, Korean job search, jobs
  in Seoul, developer jobs Korea, Wanted job, 원티드, 채용공고, 구인, 취업,
  구직, 일자리, 이직, 개발자 채용, 백엔드 채용, 신입 채용, 경력직 채용,
  서울 채용, "원티드에서 X 공고 찾아줘", look up this wanted.co.kr/wd posting.
context: fork
enabled: false  # robots.txt unreadable (CloudFront 403 for every client), so access is unconfirmed: opt in deliberately, personal use only
allowed-tools: Bash(bun run .agents/skills/wanted-search/cli/src/cli.ts *)
---

# Wanted Search Skill

Search live job postings on **Wanted (원티드, https://www.wanted.co.kr)**, one of South
Korea's largest job platforms, focused on tech and startup roles. It reads the public JSON
API the website itself uses: no login, no API key, and **zero runtime dependencies** (just
`bun`).

## ⚠️ Personal use only

Wanted's `robots.txt` could not be read (CloudFront answers `403 Request blocked` to every
client tried, browsers included), so whether the site permits automated access to these
paths is **unconfirmed**, and its terms of service could not be reviewed either. Treat
this skill as a personal job-search helper: **keep volume low (a few searches at a time),
do not use it commercially, for bulk data collection or to republish listings.** Run it
on your own responsibility. The CLI always identifies itself honestly
(`Mozilla/5.0 (compatible; wanted-cli/1.0)`) and never impersonates a browser.

## When to use this skill

- Search Korean job postings by keyword (Korean or English), region and years of experience
- Browse the newest postings when no keyword is given
- Get the full description of a specific posting (intro, main tasks, requirements,
  preferred points, benefits), its deadline, experience range and skill tags

## Commands

### Search job listings

```bash
bun run .agents/skills/wanted-search/cli/src/cli.ts search [-q "<keywords>"] [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords (title, skill, company), Korean or English. Optional; omit to browse the latest postings.
- `--location <list>` / `-l <list>` — region(s), comma-separated. Accepts Korean names (`서울`, `서울특별시`, `경기`, `부산`, `대전`, `제주`, ...), English names (`Seoul`, `Gyeonggi`), or Wanted district keys (`seoul.gangnam-gu`). Unknown places exit 1 with `BAD_LOCATION`. Default: all of Korea.
- `--years <n>` — experience in years (`0` = 신입 / new grad). Keeps postings whose required-experience range includes `n`.
- `--page <n>` — page number (1-indexed, 20 results per page).
- `--limit <n>` / `-n <n>` — cap results emitted (client-side; at most 20 per page).
- `--format json|table|plain` — default `json`.

`--jobage` is **not supported** (exits 1 with `UNSUPPORTED_FLAG`): Wanted's API exposes
no posting date. Results are always sorted newest first, so `--page 1 --limit N` gives the
most recent N matches.

### Fetch full job detail

```bash
bun run .agents/skills/wanted-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric id from `search` results (e.g. `393427`); a full
`https://www.wanted.co.kr/wd/<id>` URL also works. URLs on other hosts are rejected.

## Usage examples

```bash
# Backend developer roles in Seoul
bun run .agents/skills/wanted-search/cli/src/cli.ts search -q "백엔드 개발자" -l 서울 --format table

# Data engineer roles in Gangnam for someone with 3 years of experience
bun run .agents/skills/wanted-search/cli/src/cli.ts search -q "데이터 엔지니어" -l seoul.gangnam-gu --years 3 --format table

# Frontend roles in Gyeonggi (Pangyo/Bundang) or Seoul, 10 newest
bun run .agents/skills/wanted-search/cli/src/cli.ts search -q "프론트엔드" -l 경기,서울 --limit 10 --format table

# New-grad (신입) product designer roles anywhere in Korea, second page
bun run .agents/skills/wanted-search/cli/src/cli.ts search -q "프로덕트 디자이너" --years 0 --page 2

# PM roles in Busan
bun run .agents/skills/wanted-search/cli/src/cli.ts search -q "PM" -l 부산 --format plain

# Full details for a specific posting
bun run .agents/skills/wanted-search/cli/src/cli.ts detail 393427 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning (id, title, company, location, experience, deadline) |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON: `{ "meta": { "count", "page" }, "results": [...] }`. Each result has
`id`, `title`, `company`, `location` (e.g. `"서울 강남구"`), `date` (always `null`, see
Notes), `url`, plus `deadline` (`YYYY-MM-DD`, `null` = 상시채용 / rolling), `experienceMin`,
`experienceMax` (`null` = open-ended, e.g. "5년 이상"), `industry`, `categoryIds`.

Detail JSON adds `status`, `isActive`, `address`, `skills`, `companyTags`, `description`
(all sections joined with Korean/English headings) and `sections` (each section separately).

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process
exits with code `1`.

## Notes

- Data comes from Wanted's public JSON API (`/api/v4/search`, `/api/v4/jobs`,
  `/api/v4/jobs/<id>`); see `url-reference.md`.
- **No posting date.** Neither list nor detail responses carry a publication date, so
  `date` is always `null` and `/scrape`'s client-side date filter cannot scope this
  portal. Results are sorted newest first (`job_sort=job.latest_order`), so bound recency
  with `--limit`/`--page`.
- Postings are in Korean. Search keywords match in both Korean and English
  (`백엔드` and `backend` give different but overlapping results — try both).
- Wanted encodes "N years or more" as `annual_to = 100`; the CLI maps that to
  `experienceMax: null`.
- Detail `location` is the region only (`서울`); the street address is in `address`.
- The CLI retries 429/5xx and timeouts with exponential backoff (max 6 retries, 15 s
  request timeout). Keep volume low (see the personal-use note above).
