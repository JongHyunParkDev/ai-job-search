# Greenhouse Job Board API — URL reference

Investigated 2026-10-21 against boards `coupang` and `gitlab`. Public, read-only,
no API key. The authenticated Harvest API (`harvest.greenhouse.io`) and the job-board
POST (application) endpoint are out of scope and never called.

## robots.txt

`https://boards-api.greenhouse.io/robots.txt`:

```
User-agent: *
Disallow: /embed/
```

`python tools/robots_check.py https://boards-api.greenhouse.io/v1/boards/coupang/jobs`
→ `ALLOWED`. The CLI refuses any URL whose path starts with `/embed/` and any host other
than `boards-api.greenhouse.io` (`fetchJson` in `cli/src/helpers.ts`).

## Endpoints

| Purpose | Method + URL | Notes |
|---------|--------------|-------|
| List a board's jobs | `GET https://boards-api.greenhouse.io/v1/boards/<board_token>/jobs` | Whole board in one response, no server-side filter or paging. Coupang: 684 jobs / ~530 KB; GitLab: 232 jobs / ~165 KB. `?content=true` would add every description — not used (keeps the response small). |
| One job | `GET https://boards-api.greenhouse.io/v1/boards/<board_token>/jobs/<job_id>` | Adds `content`, `departments`, `offices`. ~7 KB. |

Status codes: `200` JSON; `404` with body `{"status":404,"error":"Job not found"}` for
both an unknown job id **and** an unknown board token. The CLI maps the list 404 to
`BOARD_NOT_FOUND` and the detail 404 to `NOT_FOUND`. 429/5xx are retried with backoff.

## CLI parameters → behaviour (all client-side)

| CLI flag | Applied to | Rule |
|----------|-----------|------|
| `--board` | URL path | `^[A-Za-z0-9][A-Za-z0-9_-]*$` |
| `--query` | `title` | every whitespace-separated word is a case-insensitive substring |
| `--location` | `location.name` | case-insensitive substring |
| `--jobage` | `first_published` ?? `updated_at` | within N×24 h of now; undated jobs are excluded |
| `--page` / `--limit` | filtered list sorted by date desc | `slice((page-1)*limit, page*limit)`, limit default 20 |

## List response (`/jobs`)

```jsonc
{
  "jobs": [
    {
      "id": 8127146,                       // numeric job id (= gh_jid)
      "internal_job_id": 3499130,          // employer-side id, not used
      "title": "Staff Backend Engineer (…)",
      "absolute_url": "https://www.coupang.jobs/en/jobs/?gh_jid=8127146", // employer careers page or job-boards.greenhouse.io
      "location": { "name": "Seoul, South Korea" },  // free text set by the employer
      "updated_at": "2026-10-14T19:45:11-04:00",      // documented; last edit
      "first_published": "2026-08-12T21:24:05-04:00", // present on both boards checked
      "company_name": "Coupang",
      "requisition_id": "8919",
      "language": "en",                    // "ko" for Korean postings
      "application_deadline": null,
      "metadata": [ … ],                   // employer custom fields — NOT output (may hold people's names)
      "data_compliance": [ … ],            // GDPR flags — not output
      "education": "…"                     // only on some boards
    }
  ],
  "meta": { "total": 684 }
}
```

CLI mapping: `id` ← `String(id)`, `title` ← `title`, `company` ← `company_name` ?? board
token, `location` ← `location.name`, `date` ← `first_published` ?? `updated_at`,
`url` ← `absolute_url`, plus `updatedAt`, `firstPublished`, `deadline`
(`application_deadline`), `requisitionId`, `language`.

## Detail response (`/jobs/<id>`)

Same fields as a list item, plus:

```jsonc
{
  "content": "&lt;p&gt;우리는 … &amp;quot;쿠팡 없이 …&amp;quot; …&lt;/p&gt;",
  "departments": [ { "id": 82960, "name": "…", "child_ids": [], "parent_id": null } ],
  "offices": [ { "id": 6062, "name": "Seoul", "location": "Seoul, South Korea", … } ]
}
```

`content` is HTML that has been **escaped one extra time**: tags arrive as `&lt;p&gt;` and
text entities as `&amp;amp;` / `&amp;quot;`. `htmlToText` decodes one level (→ real
HTML), turns `<br>`, `<li>` and block-closing tags into line breaks, strips the remaining
tags, then decodes the text a second time. Tags seen on coupang: `p`, `strong`, `ul`, `li`.

## Job URLs accepted by `detail`

| Input | Extracted id |
|-------|--------------|
| `8127146` | `8127146` |
| `https://boards.greenhouse.io/<token>/jobs/<id>` | `<id>` (token must equal `--board`) |
| `https://job-boards.greenhouse.io/<token>/jobs/<id>` | `<id>` (token must equal `--board`) |
| `https://boards-api.greenhouse.io/v1/boards/<token>/jobs/<id>` | `<id>` (token must equal `--board`) |
| any URL with `?gh_jid=<id>` (e.g. `https://www.coupang.jobs/en/jobs/?gh_jid=8127146`) | `<id>` |
| any other URL | rejected, `BAD_ID` |

The input URL is never fetched; the CLI builds the API URL from `--board` and the id.
