# JobKorea (잡코리아) URL Reference

Public, unauthenticated pages on `https://www.jobkorea.co.kr` used by this skill
(investigated 2026-10-20). The site is a server-rendered Next.js app.

> Personal use only - keep volume low (see SKILL.md).

## robots.txt (v3.0, last updated 2026-08-21)

- AI *training* crawlers (`GPTBot`, `ClaudeBot`, `anthropic-ai`, `Claude-Web`, ...) get `Disallow: /`.
- `Claude-User`, `Claude-SearchBot`, `ChatGPT-User`, ... are grouped as "AI Search/Citation
  Crawlers (Public Content Only)" with the same Disallow list as `*`:
  `/login/ /user/ /my/ /account/ /RecrtMng/ /corp/ /text_co/ /Salary/mylist
  /Recruit/JobList/SpaceClick` (plus capitalised variants; `/User/Qstn/...` allowed).
- `/Search/` is disallowed only for social-preview bots (facebookexternalhit, Twitterbot, ...).
- `/Search/`, `/Recruit/GI_Read/<id>` and `/Recruit/GI_Read_Comt_Ifrm` are allowed for `*`
  and for `Claude-User`. Do **not** use `/corp/` (company pages) or `/Recruit/JobList/SpaceClick`.

## Search

```
GET https://www.jobkorea.co.kr/Search/?stext=<query>&tabType=recruit&Page_No=<n>[&ord=RegDtDesc]
```

| Param | Meaning | Example |
|-------|---------|---------|
| `stext` | Keywords (UTF-8, URL-encoded) | `백엔드 개발자` |
| `tabType` | Result tab; `recruit` = job postings | `recruit` |
| `Page_No` | 1-indexed page, 20 organic results/page (site caps at 500) | `2` |
| `ord` | Sort: `RelevanceDesc` (default), `RegDtDesc` 등록일순, `EditDtDesc`, `ApplyCloseDtAsc` 마감임박순, `ReadCntDesc`, `ApplicantDesc` | `RegDtDesc` |
| `local` | Area codes (comma list, e.g. `I000` 서울) - **ignored by the server render** (applied client-side only), so the CLI does not use it | - |

No posting-age parameter is honoured server-side; `--jobage` uses `ord=RegDtDesc` plus a
client-side `createdAt` filter.

### Response structure

The HTML contains `<script>self.__next_f.push([1,"..."])</script>` chunks (React flight
payload). Concatenating their JSON-string bodies yields the dehydrated react-query cache:

- **Job list:** the query whose `"queryKey":["JOB_LIST",20,<page-1>,<sort>,"DESC","<stext>",...]`.
  Its `state.data` is `{ pageSize, pageNumber, totalElements, totalPages, content: [...] }`.
  The parser finds the `"queryKey":["JOB_LIST"` marker, steps back to the preceding
  `"data":{"pageSize"`, slices the balanced object and `JSON.parse`s it, then maps each
  `content[]` item independently.

  | Item field | Output |
  |------------|--------|
  | `id` | `id`, `url` = `/Recruit/GI_Read/<id>` |
  | `title` | `title` |
  | `postingCompanyName` (fallback `companyName`) | `company` |
  | `areaCodeList` (e.g. `["I150","B150"]`) | `location` via the area code table, first + `외 N` |
  | `createdAt` | `date` |
  | `applicationPeriod.end` | `deadline` (`2070-01-01` = 상시/채용시 마감 -> null + `openUntilFilled`) |
  | `careerType` / `careerRange` | `career`: 1 신입, 2 경력[N년↑], 3 신입·경력[N년↑], else 경력무관 (range 100 = no minimum) |
  | `educationCode` | `education`: 0 학력무관, 3 고졸↑, 4 초대졸↑, 5 대졸↑, 6 석사↑, 7 박사↑, other 학력무관 |
  | `employmentTypeCodeList` (`"1/0"`, `"3/1"`) | `employmentType` via the employment code table on the part before `/` |
  | `jobClassificationOrIndustry` (`",솔루션·SI·CRM·ERP,백엔드개발자,"`) | `jobCategory` |

  The career/education mappings mirror the site's own front-end formatters.
- **Code tables:** flat objects `{"code":"I010",...,"type":"area","tagDisplayName":"서울>강남구"}`
  and `{"code":"1","displayName":"정규직",...,"type":"employment"}` are embedded in the same
  payload. Employment codes: 1 정규직, 2 계약직, 3 인턴, 4 파견직, 5 도급, 6 프리랜서, ...
- **Ads:** the first card block ("나에게 꼭 맞는 공고", AD) and CPC slots interleaved in the
  HTML list are *not* part of `JOB_LIST`.

### HTML fallback (if the flight payload ever disappears)

Cards are `data-sentry-component="CardJob"` blocks; only those after the
`총 <span>N</span>건` header are organic (CPC ads are still interleaved). Per card:
id from `/Recruit/GI_Read/(\d+)`, title from the `data-sentry-component="Title"` link,
company from `span.text-gray700.text-typo-b2-16`, location from the chip after
`emoji--basicemoji-place2`, job category after `emoji--basicemoji-briefcase`, career from
`span.text-gray700.text-typo-c1-13`. No dates in the cards.

## Detail

```
GET https://www.jobkorea.co.kr/Recruit/GI_Read/<id>
GET https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=<id>
```

`GI_Read/<id>`:
- `<script type="application/ld+json">` with `@type: JobPosting`: `title`, `datePosted`,
  `validThrough`, `employmentType` (schema.org enum), `experienceRequirements`,
  `educationRequirements`, `hiringOrganization.name`, `jobLocation.address.streetAddress`.
- Labelled summary rows `<span class="min-w-[80px]">LABEL</span>VALUE` for 고용형태, 급여,
  근무시간, 경력, 학력 (a row ends at the next `min-w-[80px]` label).
- 모집분야: `<div class="min-w-[80px]"><span>모집분야</span></div>` + value up to `</div></div>`.
- `og:description` repeats `경력 : ..., 학력 : ..., 급여 : ..., 마감일 : YYYY.MM.DD`.
- A page with neither JSON-LD nor `og:title` is treated as NOT_FOUND.

`GI_Read_Comt_Ifrm?Gno=<id>` (the 상세요강 iframe `src` on the posting page): the body is
the div `id="detail-content"` (class `html-viewer-content-reset`) inside
`id="details-section"`; it is employer-authored HTML (tables, lists, sometimes only images).
The CLI strips `<style>`/`<script>`, keeps block-level line breaks and decodes entities.
