# Incruit URL Reference

Investigated 2026-10-20 with the CLI's own User-Agent `Mozilla/5.0 (compatible; incruit-cli/1.0)`.
All responses are `Content-Type: text/html; Charset=euc-kr`.

## Hosts and robots.txt

| Host | robots.txt for `*` | Used? |
|------|--------------------|-------|
| `www.incruit.com` | `Disallow: /` (only Google bots allowed) | **No** — never request it (company links in results point here; they are only emitted as data) |
| `search.incruit.com` | Disallows `/Company /Web /G_Common /Who /Jobarba /L_Common` (+ lowercase); `Allow: /`. `ClaudeBot`, `GPTBot` etc. (training crawlers) `Disallow: /` | Yes — `/list/search.asp` only |
| `job.incruit.com` | Disallows `/jobdb_info/jobpostcontpartner.asp` only. `ClaudeBot`/`GPTBot` `Disallow: /`; `Claude-SearchBot`, `OAI-SearchBot`, `PerplexityBot` disallow `/S_Common/` | Yes — `/jobdb_info/jobpost.asp` only; `/s_common/` deliberately avoided |

Neither `*` nor `Claude-User` is disallowed on the paths used. Re-check with
`python tools/robots_check.py '<url>'` if the portal changes.

## Search

```
GET https://search.incruit.com/list/search.asp?col=job&kw=<EUC-KR %-encoded>&psize=30&startno=<offset>
```

| Param | Meaning |
|-------|---------|
| `col=job` | Job-postings collection (other values: `all`, company etc.) |
| `kw` | Keyword, **EUC-KR** percent-encoded (`백엔드` → `%B9%E9%BF%A3%B5%E5`). Region names go here too (site placeholder: "회사명, 직종, 지역 등") |
| `psize` | Page size: 10/20/30/40/50/60 (site default 30; CLI sends 30) |
| `startno` | 0-based offset = `(page - 1) * psize` |
| `SortCd` | `rank` (default, relevance) / `reg` / `mod` / `viewcnt` / `applycnt` / `invite` (deadline). Not used: `reg` matched multi-word queries loosely |
| `apply=m` | Only "바로지원" (apply via Incruit) postings. Not used |

No location or posting-age parameter was found on this endpoint.

### Parse anchors (per card)

The page is split on `<ul class="c_row" jobno="<13-digit id>">`; rows without `jobno` are ad
banners and are skipped. Each chunk is cut at its first `</ul>`.

| Field | Anchor |
|-------|--------|
| id | `jobno="…"` |
| title | first `<a href="…jobpost.asp?job=<id>…">…</a>` (strip `<span class="highlight">`) |
| company / companyUrl | `<a href="…" class="cpname">…</a>` inside `cell_first` |
| location, experience, education, employment type | the four `<span>`s of `<div class="cl_md">` inside `cell_mid` |
| jobCategory | `<span>`s of `<div class="cl_btm">` inside `cell_mid` |
| deadline, postedText | `<span>`s of `<div class="cl_btm">` inside `cell_last` (`~11.10 (화)` / `채용시`, `(9일전 등록)`) |
| date | derived from the id prefix `YYMMDD` (verified consistent with "N일전 등록" on 60 cards) |

Pagination links look like `?col=job&kw=java&startno=30` (`<p class="sqr_paging …">`).

## Detail

```
GET https://job.incruit.com/jobdb_info/jobpost.asp?job=<id>
```

Unknown/removed id → `302` to `/jobdb_list/searchjob.asp?…&from=jobpostnone` (CLI: `NOT_FOUND`;
redirects are not followed).

| Field | Anchor |
|-------|--------|
| JSON-LD | `<script type="application/ld+json">` with `@type: JobPosting`: `title`, `datePosted`, `validThrough`, `employmentType`, `hiringOrganization.{name,sameAs}`, `jobLocation.address.{streetAddress,addressRegion,addressLocality}`, `baseSalary` |
| title | `<h1>…</h1>` (fallback JSON-LD `title`) |
| company | `<input id="apy_comp_nm" value="…">` (fallback JSON-LD) |
| 고용형태 / 경력 / 학력 / 근무지역 / 급여조건 | `<div class="tt"><em>LABEL</em></div><div class="txt"><em>VALUE</em>` in `ul.jc_list` |
| deadline | `<em>마감</em> … <div class="day"><em>2026.11.10 (화) 23:59</em>` |
| description | `<meta name="description" content="…">` — Incruit's flattened summary of the body |
| full body | iframe `https://job.incruit.com/s_common/jobpost/jobpostcont.asp?job=<id>` — **not fetched** (see robots) |
| isActive | `validThrough` ≥ now (`채용시` postings carry a far-future `validThrough`) |

`printjobpost.asp` (print view) is disallowed for Google bots and is not used.
