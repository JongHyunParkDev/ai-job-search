# Saramin (사람인) URL Reference

Public, unauthenticated HTML pages used by this skill (investigated 2026-10-20). All requests
are plain `GET` with the honest UA `Mozilla/5.0 (compatible; saramin-cli/1.0)`; no cookies,
no browser headers.

> Personal use only - Saramin's terms forbid copying/redistributing site information without
> consent and profit-making use of it; keep volume low.

## robots.txt (`https://www.saramin.co.kr/robots.txt`)

For `User-agent: *` the paths below are **not** disallowed (also confirmed with
`python tools/robots_check.py`). Notable disallows the CLI must never touch: `/zf_user/auth`,
`/zf_user/mandb`, `/zf_user/talent`, `/zf_user/company/`, `/zf_user/recruit/view/`,
`/recruit/recruit_view.php`, apply/resume paths (`/zf_user/member/apply/`,
`/zf_user/nonmember/apply`, `/zf_user/member/resume/`, `/zf_user/recruit-apply/`),
`/zf_user/jobs/view/etc`, `/zf_user/jobs/view*innerCampaign=headhuntingView`, `/feed.php`,
`/ad`, `/zf_ad`. `GPTBot` and `Bytespider` are disallowed from the whole site. The CLI always
builds its own URLs (it never follows links taken from result markup).

## Search

```
GET https://www.saramin.co.kr/zf_user/search/recruit
```

| Param | Meaning | Example |
|-------|---------|---------|
| `searchType` | Always `search` | `search` |
| `searchword` | Free-text keywords (UTF-8, URL-encoded) | `백엔드` |
| `loc_mcd` | Province/city code(s), comma-separated (codes ending `000`) | `101000` (서울), `106000` (부산) |
| `loc_cd` | District code(s), comma-separated | `102180` (성남시/판교), `101010` (강남구) |
| `recruitSort` | Sort; `reg_dt` = newest registered (used with `--jobage`). Default relevance (`accuracy`); `edit_dt` also exists | `reg_dt` |
| `recruitPage` | 1-indexed page | `1` |
| `recruitPageCount` | Page size; the CLI fixes it at `40` | `40` |

There is **no posted-within parameter**; `--jobage` is a client-side filter on the card date.
`loc_mcd` and `loc_cd` can be combined in one request (verified live: `loc_mcd=101000&loc_cd=102180`).

Region codes come from the area map embedded in the search page as JSON
(`"area":{"101000":[{"mcode":..,"code":"101000","name":"서울전체","id":"loc_mcd"},...]}`).
Top level: 101000 서울, 102000 경기, 104000 대구, 105000 대전, 106000 부산, 107000 울산,
108000 인천, 109000 강원, 110000 경남, 111000 경북, 112000 전남광주, 113000 전북, 114000 충북,
115000 충남, 116000 제주, 117000 전국, 118000 세종. The CLI's name-to-code table is
`REGIONS` in `cli/src/helpers.ts`.

### Response structure (HTML, ~2.4 MB per page)

- Total: `<span class="cnt_result">총 2,421건</span>`
- One card per posting: `<div class="item_recruit" value="<rec_idx>" ...>` - the CLI splits
  the page on this marker and parses each chunk independently.

| Field | Anchor inside a card |
|-------|----------------------|
| `id` | `value="<rec_idx>"` on the card div |
| `title` | `<h2 class="job_tit"><a title="...">` (title attribute; inner text has `<b>` keyword highlights) |
| `company` | `<strong class="corp_name"><a ...>회사명</a>` |
| `location` | 1st `<span>` of `<div class="job_condition">` (e.g. `서울 송파구`) |
| `career` / `education` / `employmentType` | remaining `job_condition` spans (`경력 3~15년` / `대졸↑` / `정규직·인턴직`), classified by keyword |
| `deadline` | `<div class="job_date"><span class="date">~ 10/27(화)</span>` (also `내일마감`, `오늘마감`, `채용시`) |
| `date` | `<span class="job_day">등록일 26/10/07</span>` or `수정일 26/09/29` (YY/MM/DD) |
| `sectors` | `<a>` texts in `<div class="job_sector">` |

## Detail

Two requests per posting:

```
GET https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=<id>
GET https://www.saramin.co.kr/zf_user/jobs/relay/view-detail?rec_idx=<id>&rec_seq=0
```

1. **`relay/view`** - the posting page. Its visible summary block is loaded by XHR
   (`/zf_user/jobs/relay/view-ajax`, which returned 404 for a plain POST and is not used), so the
   CLI reads only the server-rendered `<meta>` tags:
   - `og:title`: `[<company>] <title>(D-1) - 사람인`
   - `description`: `<company>, <title>, 경력:<career>, 학력:<education>, <salary text>, 마감일:YYYY-MM-DD, 홈페이지:<url>`
   A page without these tags is reported as `NOT_FOUND`.
2. **`relay/view-detail`** - the iframe body with the employer-written description, inside
   `<div class="user_content">`. Often contains images (`<img src="//www.saraminimage.co.kr/...">`);
   the CLI counts them as `descriptionImageCount` and does not download them.

The canonical posting URL emitted by the CLI is `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=<id>`.

## Official Open API (not used)

`https://oapi.saramin.co.kr/job-search?access-key=<key>&keywords=...` returns JSON but needs an
access key issued by Saramin. If support is ever added, the key must come only from the
`SARAMIN_API_TOKEN` environment variable (never a flag, never committed).
