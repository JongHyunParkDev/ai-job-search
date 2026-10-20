// Data source: JobKorea (잡코리아, www.jobkorea.co.kr) public pages. No authentication.
//
// Search: GET /Search/?stext=<q>&tabType=recruit&Page_No=<n>[&ord=RegDtDesc]
//   The page is a server-rendered Next.js app. Besides the HTML cards, it embeds
//   the react-query cache in the RSC "flight" payload (self.__next_f.push(...)).
//   The JOB_LIST query in that cache holds the organic results as structured
//   JSON (id, title, company, createdAt, applicationPeriod, careerType,
//   educationCode, employment/area codes) plus totalElements. We read that,
//   item by item, and fall back to per-card HTML parsing if it is missing.
//   Ad cards ("나에게 꼭 맞는 공고" and interleaved CPC slots) are not in JOB_LIST.
// Detail: GET /Recruit/GI_Read/<id> (JSON-LD JobPosting + labelled summary rows)
//   and GET /Recruit/GI_Read_Comt_Ifrm?Gno=<id> (the 상세요강 body, iframe source).
//
// robots.txt (v3.0, 2026-08-21) allows these paths for `*` and for Claude-User
// (listed under "AI Search/Citation Crawlers (Public Content Only)").

export const BASE_URL = "https://www.jobkorea.co.kr"
export const SEARCH_URL = `${BASE_URL}/Search/`
export const DETAIL_URL = `${BASE_URL}/Recruit/GI_Read`
export const DESCRIPTION_URL = `${BASE_URL}/Recruit/GI_Read_Comt_Ifrm`

const UA = "Mozilla/5.0 (compatible; jobkorea-cli/1.0)"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Fetch HTML with exponential backoff + jitter on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

// ---------------------------------------------------------------------------
// Text helpers

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ").trim()
}

/** Render an HTML fragment as readable text, keeping block/line breaks. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr|table|section)>/gi, "\n")
  return withBreaks
    .split("\n")
    .map(clean)
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Inner HTML of the first <div> whose opening tag matches `attrPattern`
 * (a regex source matched inside the tag), tracking nested <div> depth.
 */
export function extractDiv(html: string, attrPattern: string): string | null {
  const openRe = new RegExp(`<div[^>]*${attrPattern}[^>]*>`, "i")
  const open = openRe.exec(html)
  if (!open) return null
  let i = open.index + open[0].length
  let depth = 1
  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)
    if (nextClose === -1) return null
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }
  return html.slice(open.index + open[0].length, i - 6)
}

// ---------------------------------------------------------------------------
// Next.js flight payload

/** Concatenate every `self.__next_f.push([1,"..."])` string chunk, unescaped. */
export function decodeFlight(html: string): string {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g
  let out = ""
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      out += JSON.parse(m[1]) as string
    } catch {
      // A malformed chunk only loses its own slice of the payload.
    }
  }
  return out
}

/** Return the balanced JSON object/array text starting at `start` ("{" or "["). */
export function sliceBalanced(text: string, start: number): string | null {
  const open = text[start]
  if (open !== "{" && open !== "[") return null
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === "\\") i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{" || ch === "[") depth++
    else if (ch === "}" || ch === "]") {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

export interface CodeTables {
  area: Map<string, string>
  employment: Map<string, string>
}

/**
 * The search page ships JobKorea's code tables (area, employment, ...) in the
 * flight payload as flat objects like
 *   {"code":"I010","parentCode":"I000",...,"type":"area","tagDisplayName":"서울>강남구"}
 * Each object is parsed independently.
 */
export function parseCodeTables(flight: string): CodeTables {
  const tables: CodeTables = { area: new Map(), employment: new Map() }
  const re = /\{"code":"[^"]*"[^{}]*?"type":"(area|employment)"[^{}]*\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(flight)) !== null) {
    try {
      const o = JSON.parse(m[0]) as { code: string; displayName?: string; tagDisplayName?: string }
      const name =
        m[1] === "area"
          ? (o.tagDisplayName || o.displayName || "").replace(/>/g, " ")
          : o.displayName || ""
      if (o.code && name) tables[m[1] as keyof CodeTables].set(o.code, name)
    } catch {
      // skip malformed entry
    }
  }
  return tables
}

// ---------------------------------------------------------------------------
// Code mappings (mirrors the site's own front-end formatters)

/** careerType/careerRange -> label, as rendered on the result cards. */
export function careerLabel(type: unknown, range: unknown): string | null {
  const r = typeof range === "number" ? range : Number(range)
  const years = Number.isFinite(r) && r > 0 && r < 100 ? `${r}년↑` : ""
  switch (String(type ?? "")) {
    case "1":
      return "신입"
    case "2":
      return `경력${years}`
    case "3":
      return `신입·경력${years}`
    case "4":
    case "0":
      return "경력무관"
    default:
      return type == null || type === "" ? null : "경력무관"
  }
}

/** educationCode -> label (site formatter: 0 학력무관, 3 고졸↑, 4 초대졸↑, 5 대졸↑, 6 석사↑, 7 박사↑). */
export function educationLabel(code: unknown): string | null {
  if (code == null || code === "") return null
  switch (String(code)) {
    case "3":
      return "고졸↑"
    case "4":
      return "초대졸↑"
    case "5":
      return "대졸↑"
    case "6":
      return "석사↑"
    case "7":
      return "박사↑"
    default:
      return "학력무관"
  }
}

// ---------------------------------------------------------------------------
// Search parsing

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  deadline: string | null
  career: string | null
  education: string | null
  employmentType: string | null
  jobCategory: string | null
  /** true when the posting has no fixed deadline (상시채용 / 채용시 마감). */
  openUntilFilled: boolean | null
}

/**
 * JobKorea stores "no fixed deadline" (상시채용 / 채용시 마감) as a far-future
 * sentinel date (2070-01-01). Report that as deadline null + openUntilFilled.
 */
export function splitDeadline(raw: string | null | undefined): { deadline: string | null; openUntilFilled: boolean | null } {
  const v = typeof raw === "string" && raw.trim() ? raw.trim() : null
  if (!v) return { deadline: null, openUntilFilled: null }
  const year = Number(v.slice(0, 4))
  if (Number.isFinite(year) && year >= 2060) return { deadline: null, openUntilFilled: true }
  return { deadline: v, openUntilFilled: false }
}

export interface SearchPage {
  total: number | null
  cards: JobCard[]
  source: "json" | "html"
}

export function canonicalUrl(id: string): string {
  return `${DETAIL_URL}/${id}`
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

function areaText(codes: unknown, tables: CodeTables): string | null {
  if (!Array.isArray(codes) || codes.length === 0) return null
  const names = codes.map((c) => tables.area.get(String(c))).filter((n): n is string => !!n)
  if (names.length === 0) return null
  return codes.length > 1 ? `${names[0]} 외 ${codes.length - 1}` : names[0]
}

function employmentText(codes: unknown, tables: CodeTables): string | null {
  if (!Array.isArray(codes) || codes.length === 0) return null
  const names = codes
    .map((c) => tables.employment.get(String(c).split("/")[0]))
    .filter((n): n is string => !!n)
  return names.length ? [...new Set(names)].join(", ") : null
}

/** Map one JOB_LIST content item. Returns null when it lacks an id or title. */
export function mapJsonItem(item: Record<string, unknown>, tables: CodeTables): JobCard | null {
  const id = item.id != null ? String(item.id) : ""
  const title = str(item.title)
  if (!/^\d+$/.test(id) || !title) return null
  const period = (item.applicationPeriod ?? {}) as Record<string, unknown>
  const category = str(item.jobClassificationOrIndustry)
  return {
    id,
    title: decodeHtmlEntities(title),
    company: str(item.postingCompanyName) ?? str(item.companyName),
    location: areaText(item.areaCodeList, tables),
    date: str(item.createdAt),
    url: canonicalUrl(id),
    ...splitDeadline(str(period.end)),
    career: careerLabel(item.careerType, item.careerRange),
    education: educationLabel(item.educationCode),
    employmentType: employmentText(item.employmentTypeCodeList, tables),
    jobCategory: category ? category.split(",").filter(Boolean).join(", ") || null : null,
  }
}

/** Locate the JOB_LIST query's data object in the flight payload. */
function findJobListData(flight: string): Record<string, unknown> | null {
  const keyIdx = flight.indexOf('"queryKey":["JOB_LIST"')
  if (keyIdx === -1) return null
  const dataIdx = flight.lastIndexOf('"data":{"pageSize"', keyIdx)
  if (dataIdx === -1) return null
  const objText = sliceBalanced(flight, dataIdx + '"data":'.length)
  if (!objText) return null
  try {
    return JSON.parse(objText) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Fallback: parse the organic result cards from the HTML. Cards are split on
 * the CardJob component marker and parsed one by one. Only cards after the
 * "총 N건" header are organic, but CPC ad slots are interleaved there and
 * cannot be told apart in markup alone, so the JSON path is preferred.
 */
export function parseHtmlCards(html: string): JobCard[] {
  const totalIdx = html.search(/>총 <span[^>]*>[\d,]+<\/span>건/)
  const scope = totalIdx === -1 ? html : html.slice(totalIdx)
  const chunks = scope.split(/data-sentry-component="CardJob"/).slice(1)
  const results: JobCard[] = []
  const seen = new Set<string>()
  for (const chunk of chunks) {
    try {
      const id = chunk.match(/\/Recruit\/GI_Read\/(\d+)/)?.[1]
      if (!id || seen.has(id)) continue
      const titleHtml = chunk.match(/data-sentry-component="Title"[^>]*>([\s\S]*?)<\/a>/)?.[1]
      const title = titleHtml ? clean(titleHtml) : ""
      if (!title) continue
      const company = chunk.match(/text-gray700 text-typo-b2-16">([\s\S]*?)<\/span>/)?.[1]
      const chips = [...chunk.matchAll(/emoji--basicemoji-(place2|briefcase)[\s\S]*?text-typo-b4-14">([\s\S]*?)<\/span>/g)]
      const place = chips.find((c) => c[1] === "place2")?.[2]
      const category = chips.find((c) => c[1] === "briefcase")?.[2]
      const career = chunk.match(/text-gray700 text-typo-c1-13">([\s\S]*?)<\/span>/)?.[1]
      seen.add(id)
      results.push({
        id,
        title,
        company: company ? clean(company) || null : null,
        location: place ? clean(place) || null : null,
        date: null,
        url: canonicalUrl(id),
        deadline: null,
        career: career ? clean(career) || null : null,
        education: null,
        employmentType: null,
        jobCategory: category ? clean(category) || null : null,
        openUntilFilled: null,
      })
    } catch {
      // one malformed card must not break the rest
    }
  }
  return results
}

export function parseSearchPage(html: string): SearchPage {
  const flight = decodeFlight(html)
  const data = flight ? findJobListData(flight) : null
  if (data && Array.isArray(data.content)) {
    const tables = parseCodeTables(flight)
    const cards: JobCard[] = []
    for (const item of data.content as unknown[]) {
      try {
        if (item && typeof item === "object") {
          const card = mapJsonItem(item as Record<string, unknown>, tables)
          if (card) cards.push(card)
        }
      } catch {
        // skip a malformed item
      }
    }
    const total = typeof data.totalElements === "number" ? data.totalElements : null
    return { total, cards, source: "json" }
  }
  const totalMatch = html.match(/>총 <span[^>]*>([\d,]+)<\/span>건/)
  return {
    total: totalMatch ? Number(totalMatch[1].replace(/,/g, "")) : null,
    cards: parseHtmlCards(html),
    source: "html",
  }
}

// ---------------------------------------------------------------------------
// Detail parsing

export interface JobDetail extends JobCard {
  salary: string | null
  workingHours: string | null
  description: string | null
}

/** Value of a labelled summary row: <span class="min-w-[80px]">LABEL</span>VALUE */
export function labelValue(html: string, label: string): string | null {
  const re = new RegExp(`<span class="min-w-\\[80px\\]">${label}</span>([\\s\\S]*?)(?=<(?:span|div) class="min-w-\\[80px\\]">|<!--|<template|$)`)
  const m = html.match(re)
  if (!m) return null
  // Cut at the row's end; the lookahead may run on into later blocks.
  const row = m[1].slice(0, 2000)
  const parts = [...row.matchAll(/<(?:span|li)[^>]*>([^<]+)</g)].map((x) => clean(x[1])).filter(Boolean)
  const text = parts.length ? parts.join(" ") : clean(row)
  return text.replace(/\s+/g, " ").trim() || null
}

interface JsonLdJob {
  title?: string
  datePosted?: string
  validThrough?: string
  employmentType?: string | string[]
  experienceRequirements?: string
  educationRequirements?: string
  hiringOrganization?: { name?: string }
  jobLocation?: { address?: { streetAddress?: string; addressLocality?: string } }
}

export function parseJsonLd(html: string): JsonLdJob | null {
  const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const o = JSON.parse(m[1]) as Record<string, unknown>
      if (o["@type"] === "JobPosting") return o as JsonLdJob
    } catch {
      // ignore unrelated/malformed blocks
    }
  }
  return null
}

/** Parse the 상세요강 iframe page into readable text. */
export function parseDescription(html: string): string | null {
  const body = extractDiv(html, 'id="detail-content"') ?? extractDiv(html, 'id="details-section"')
  if (!body) return null
  return htmlToText(body) || null
}

export function parseJobDetail(html: string, id: string, descriptionHtml: string): JobDetail | null {
  const ld = parseJsonLd(html)
  const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1]
  if (!ld && !ogTitle) return null
  const titleFromOg = ogTitle ? decodeHtmlEntities(ogTitle).replace(/ \| 잡코리아$/, "").replace(/^.*? 채용 - /, "") : null
  const employment =
    labelValue(html, "고용형태") ??
    (Array.isArray(ld?.employmentType) ? ld?.employmentType.join(", ") : ld?.employmentType ?? null)
  const address = ld?.jobLocation?.address
  return {
    id,
    title: ld?.title ? decodeHtmlEntities(ld.title) : titleFromOg || "(untitled)",
    company: ld?.hiringOrganization?.name ?? null,
    location: address?.streetAddress ?? address?.addressLocality ?? labelValue(html, "근무지주소"),
    date: ld?.datePosted ?? null,
    url: canonicalUrl(id),
    ...splitDeadline(ld?.validThrough),
    career: labelValue(html, "경력") ?? ld?.experienceRequirements ?? null,
    education: labelValue(html, "학력") ?? ld?.educationRequirements ?? null,
    employmentType: employment,
    jobCategory: (() => {
      const m = html.match(/<div class="min-w-\[80px\]"><span>모집분야<\/span><\/div>([\s\S]*?)<\/div><\/div>/)
      return m ? clean(m[1]) || null : null
    })(),
    salary: labelValue(html, "급여"),
    workingHours: labelValue(html, "근무시간"),
    description: descriptionHtml ? parseDescription(descriptionHtml) : null,
  }
}
