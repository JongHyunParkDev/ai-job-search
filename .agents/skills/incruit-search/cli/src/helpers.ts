// Data source: Incruit (인크루트), South Korea.
//   search: https://search.incruit.com/list/search.asp?col=job&kw=...   (server-rendered HTML)
//   detail: https://job.incruit.com/jobdb_info/jobpost.asp?job=<id>      (HTML + schema.org JSON-LD)
// Both hosts serve EUC-KR (CP949). Responses are decoded with TextDecoder("euc-kr")
// and the search keyword is percent-encoded in EUC-KR, which is what the site expects.
//
// Hosts deliberately NOT used: www.incruit.com (robots.txt: "User-agent: * / Disallow: /")
// and job.incruit.com/s_common/* (the description iframe; disallowed for AI search agents).
// No authentication, zero runtime dependencies.

export const SEARCH_URL = "https://search.incruit.com/list/search.asp"
export const DETAIL_URL = "https://job.incruit.com/jobdb_info/jobpost.asp"
export const PAGE_SIZE = 30

const UA = "Mozilla/5.0 (compatible; incruit-cli/1.0)"
const TIMEOUT_MS = 15000

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

// ---------------------------------------------------------------------------
// EUC-KR encoding/decoding
// ---------------------------------------------------------------------------

const eucKrDecoder = new TextDecoder("euc-kr")
let eucKrTable: Map<string, [number, number]> | null = null

/**
 * Build a char -> 2-byte EUC-KR (CP949) table by decoding every lead/trail
 * pair once. Bun/WHATWG ship an EUC-KR decoder but no encoder, so this is the
 * dependency-free way to percent-encode Hangul query text for the site.
 */
function table(): Map<string, [number, number]> {
  if (eucKrTable) return eucKrTable
  const map = new Map<string, [number, number]>()
  const buf = new Uint8Array(2)
  for (let a = 0x81; a <= 0xfe; a++) {
    for (let b = 0x41; b <= 0xfe; b++) {
      buf[0] = a
      buf[1] = b
      const s = eucKrDecoder.decode(buf)
      if (s.length === 1 && s !== "�" && !map.has(s)) map.set(s, [a, b])
    }
  }
  eucKrTable = map
  return map
}

const hex = (n: number) => "%" + n.toString(16).toUpperCase().padStart(2, "0")

/**
 * Percent-encode a string as EUC-KR. ASCII is encoded like encodeURIComponent
 * (space -> %20). Characters with no EUC-KR mapping (emoji etc.) are dropped
 * and replaced by a space, since the site could not match them anyway.
 */
export function encodeEucKr(text: string): string {
  const map = table()
  let out = ""
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x80) {
      out += /[A-Za-z0-9\-_.~]/.test(ch) ? ch : hex(cp)
      continue
    }
    const pair = map.get(ch)
    out += pair ? hex(pair[0]) + hex(pair[1]) : "%20"
  }
  return out
}

export function decodeEucKr(buf: ArrayBuffer | Uint8Array): string {
  return eucKrDecoder.decode(buf)
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

export interface FetchResult {
  status: number
  location: string | null
  body: string
}

/**
 * GET with exponential backoff + jitter on 429/5xx (max 6 retries) and a
 * per-request timeout. Redirects are NOT followed: Incruit answers a missing
 * posting with a 302 to a list page, which the caller turns into NOT_FOUND.
 * A 404 returns an empty body rather than throwing.
 */
export async function htmlFetch(url: string): Promise<FetchResult> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
    if (response.status === 404) return { status: 404, location: null, body: "" }
    if (response.status >= 300 && response.status < 400) {
      return { status: response.status, location: response.headers.get("location"), body: "" }
    }
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return { status: response.status, location: null, body: decodeEucKr(await response.arrayBuffer()) }
  }
  throw new Error("Request failed after max retries")
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&middot;/g, "·")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => numericEntity(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ").trim()
}

/** Incruit posting IDs are 13 digits; the first six are the registration date (YYMMDD). */
export function dateFromId(id: string): string | null {
  const m = id.match(/^(\d{2})(\d{2})(\d{2})\d{7}$/)
  if (!m) return null
  const [, yy, mm, dd] = m
  const month = Number(mm)
  const day = Number(dd)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `20${yy}-${mm}-${dd}`
}

/** Today's date in Korea (UTC+9, no DST) as YYYY-MM-DD. */
export function todayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000)
}

// ---------------------------------------------------------------------------
// Search-results parsing
// ---------------------------------------------------------------------------

export interface JobCard {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  date: string | null
  url: string
  experience: string | null
  education: string | null
  employmentType: string | null
  jobCategory: string | null
  deadline: string | null
  postedText: string | null
}

function spans(html: string): string[] {
  const out: string[] = []
  const re = /<span[^>]*>([\s\S]*?)<\/span>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const t = clean(m[1])
    if (t) out.push(t)
  }
  return out
}

/** Inner HTML of the first `<div class="...name...">` up to its first closing tag (cells are flat). */
function cell(html: string, cls: string): string | null {
  const re = new RegExp(`<div class="${cls}">([\\s\\S]*?)</div>`, "i")
  const m = html.match(re)
  return m ? m[1] : null
}

/**
 * Parse the search page. Every posting is a `<ul class="c_row" jobno="<id>">`;
 * the page is split on that marker and each chunk parsed on its own, so one
 * malformed card (or an ad row without a jobno) cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<ul class="c_row" jobno="/).slice(1)

  for (const raw of chunks) {
    const idMatch = raw.match(/^(\d{10,})"/)
    if (!idMatch) continue
    const id = idMatch[1]
    // The row ends at its own </ul>; cut there so trailing page chrome
    // (pagination, sidebars) after the last row is not parsed into it.
    const end = raw.indexOf("</ul>")
    const chunk = end === -1 ? raw : raw.slice(0, end)

    const titleMatch = chunk.match(
      /<a href="([^"]*jobpost\.asp\?job=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/i,
    )
    if (!titleMatch) continue
    const title = clean(titleMatch[2])
    if (!title) continue

    const comp = chunk.match(/<a href="([^"]*)" class="cpname"[^>]*>([\s\S]*?)<\/a>/i)
    const company = comp ? clean(comp[2]) || null : null
    const companyUrl = comp ? decodeHtmlEntities(comp[1]) || null : null

    // cell_mid > cl_md: [location, experience, education, employment type]
    const md = cell(chunk, "cl_md")
    const mdSpans = md ? spans(md) : []
    // cell_mid > cl_btm: job category; cell_last > cl_btm: [deadline, "(N일전 등록)"]
    const midStart = chunk.indexOf('class="cell_mid"')
    const lastStart = chunk.indexOf('class="cell_last"')
    const midHtml = midStart === -1 ? "" : chunk.slice(midStart, lastStart === -1 ? undefined : lastStart)
    const lastHtml = lastStart === -1 ? "" : chunk.slice(lastStart)
    const category = cell(midHtml, "cl_btm")
    const catSpans = category ? spans(category) : []
    const lastBtm = cell(lastHtml, "cl_btm")
    const lastSpans = lastBtm ? spans(lastBtm) : []
    const posted = lastSpans.find((s) => /등록|수정/.test(s)) ?? null

    results.push({
      id,
      title,
      company,
      companyUrl,
      location: mdSpans[0] ?? null,
      date: dateFromId(id),
      url: `${DETAIL_URL}?job=${id}`,
      experience: mdSpans[1] ?? null,
      education: mdSpans[2] ?? null,
      employmentType: mdSpans[3] ?? null,
      jobCategory: catSpans.length ? catSpans.join(", ") : null,
      deadline: lastSpans.find((s) => s !== posted) ?? null,
      postedText: posted ? posted.replace(/^\(|\)$/g, "") : null,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Detail parsing
// ---------------------------------------------------------------------------

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  deadline: string | null
  employmentType: string | null
  experience: string | null
  education: string | null
  salary: string | null
  address: string | null
  companyWebsite: string | null
  description: string | null
  isActive: boolean
}

/** schema.org JobPosting from the page's ld+json block, or null. */
function jobPostingLd(html: string): Record<string, any> | null {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1])
      if (data && data["@type"] === "JobPosting") return data
    } catch {
      // malformed block: ignore, fall back to HTML fields
    }
  }
  return null
}

/** Value of a `<div class="tt"><em>LABEL</em></div><div class="txt">VALUE</div>` pair. */
function labelled(html: string, label: string): string | null {
  const re = new RegExp(
    `<div class="tt">\\s*<em>${label}</em>\\s*</div>\\s*<div class="txt[^"]*">\\s*<em[^>]*>([\\s\\S]*?)</em>`,
    "i",
  )
  const m = html.match(re)
  return m ? clean(m[1]) || null : null
}

function meta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)="${name}"[^>]+content="([^"]*)"`, "i")
  const m = html.match(re)
  return m ? decodeHtmlEntities(m[1]).trim() || null : null
}

export function parseJobDetail(html: string, id: string, now: Date = new Date()): JobDetail {
  const ld = jobPostingLd(html)

  const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/i)
  const title = (h1 ? clean(h1[1]) : "") || (ld?.title ? clean(String(ld.title)) : "") || "(untitled)"

  const compInput = html.match(/id="apy_comp_nm" value="([^"]*)"/i)
  const company =
    (compInput ? decodeHtmlEntities(compInput[1]).trim() : "") ||
    (ld?.hiringOrganization?.name ? String(ld.hiringOrganization.name) : "") ||
    null

  const addr = ld?.jobLocation?.address
  const location =
    labelled(html, "근무지역") ??
    ([addr?.addressRegion, addr?.addressLocality].filter(Boolean).join(" ") || null)

  // Application window: "2026.10.11 (일) 00:00" .. "2026.11.10 (화) 23:59"
  const endMatch = html.match(/<em>마감<\/em>[\s\S]*?<div class="day">\s*<em>([^<]*)<\/em>/i)
  const deadline =
    (endMatch ? clean(endMatch[1]) : "") ||
    (ld?.validThrough ? String(ld.validThrough).slice(0, 10) : "") ||
    null

  // The full posting body lives in an iframe under /s_common/, which this CLI
  // does not fetch (see header). The page's meta description is Incruit's own
  // flattened text of that body, so it is used as the description.
  const description = meta(html, "description") ?? meta(html, "og:description")

  // Closed = the JSON-LD validThrough is in the past. "Until filled" postings
  // (채용시) carry a far-future validThrough, so they stay active. Absence of
  // validThrough is treated as active (no evidence of closure).
  const until = ld?.validThrough ? Date.parse(String(ld.validThrough)) : NaN

  return {
    id,
    title,
    company,
    location,
    date: ld?.datePosted ? String(ld.datePosted) : dateFromId(id),
    url: `${DETAIL_URL}?job=${id}`,
    deadline,
    employmentType: labelled(html, "고용형태"),
    experience: labelled(html, "경력"),
    education: labelled(html, "학력"),
    salary: labelled(html, "급여조건"),
    address: addr?.streetAddress ? String(addr.streetAddress) : null,
    companyWebsite: ld?.hiringOrganization?.sameAs ? String(ld.hiringOrganization.sameAs) : null,
    description,
    isActive: Number.isNaN(until) ? true : until >= now.getTime(),
  }
}
