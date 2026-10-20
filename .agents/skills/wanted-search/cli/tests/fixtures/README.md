# Fixtures

Trimmed captures of Wanted's public JSON API (fetched 2026-10-20 with the CLI's
own User-Agent), used by `parsing.test.ts` so the parsers are tested offline.

- `search-jobs.json` — `GET /api/v4/search?query=백엔드&tab=position&result_items=jobs&locations=busan&locations=seoul.gangnam-gu&years=3&job_sort=job.latest_order&limit=8` — first 3 items, fields reduced to those the CLI reads, plus two deliberately malformed items (empty title, missing id).
- `detail-393427.json` — `GET /api/v4/jobs/393427` — fields reduced, text sections truncated to 300 chars.
