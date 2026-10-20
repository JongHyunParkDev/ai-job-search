// Data source: JobPlanet (잡플래닛) public job-postings section.
//   search -> GET /api/v3/job/postings      (JSON, the same endpoint the /job page calls)
//   detail -> GET /job/search?posting_ids[]=<id>  (server-rendered HTML; the posting is
//             embedded in the Next.js flight payload as schema.org JobPosting JSON-LD plus
//             the hydrated posting object)
// No authentication. robots.txt disallows /search (the site-wide search) for `*`, but not
// /job/search or /api/v3/job/postings - this CLI never requests /search.
//
// Personal use only: keep volume low, no commercial or bulk collection.

import { OCCUPATIONS } from "./occupations.js"

export const BASE_URL = "https://www.jobplanet.co.kr"
export const SEARCH_URL = `${BASE_URL}/api/v3/job/postings`
export const PAGE_SIZE = 50

export function postingUrl(id: string): string {
  return `${BASE_URL}/job/search?posting_ids[]=${id}`
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; jobplanet-cli/1.0)"
export const REQUEST_TIMEOUT_MS = 15000

/**
 * Fetch text with exponential backoff + jitter on 429/5xx (max 6 retries) and a
 * per-request timeout. Returns "" on a 404.
 */
export async function httpFetch(url: string, accept: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: accept,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
}

/** HTML fragment -> readable text, keeping paragraph / list / line breaks. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
  return withBreaks
    .split("\n")
    .map((l) => decodeHtmlEntities(l.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim()
    return t ? t : null
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return null
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter((s): s is string => s !== null) : []
}

/** Normalise a Korean date like "2026.11.18" or "2026-11-18T..." to YYYY-MM-DD. */
export function isoDate(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  const m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
}

// ---------------------------------------------------------------------------
// Location (근무 지역) -> JobPlanet `city` ids. Values from the /job filter tree.

const CITY_IDS: [ids: string[], id: number][] = [
  [["서울", "seoul"], 1],
  [["경기", "gyeonggi"], 2],
  [["인천", "incheon"], 3],
  [["부산", "busan"], 4],
  [["대구", "daegu"], 5],
  [["대전", "daejeon"], 6],
  [["광주", "gwangju"], 7],
  [["울산", "ulsan"], 8],
  [["세종", "sejong"], 19],
  [["강원", "gangwon"], 9],
  [["경남", "gyeongnam"], 10],
  [["경북", "gyeongbuk"], 11],
  [["전남", "jeonnam"], 12],
  [["전북", "jeonbuk"], 13],
  [["충남", "chungnam"], 14],
  [["충북", "chungbuk"], 15],
  [["제주", "jeju"], 16],
  [["해외", "overseas", "abroad"], 18],
]

export const CITY_NAMES = CITY_IDS.map(([names]) => names[0])

/**
 * Resolve a comma-separated location list ("서울,경기", "Seoul", "서울특별시") to
 * city ids. Returns null if any entry is unknown.
 */
export function resolveCities(input: string): number[] | null {
  const ids: number[] = []
  for (const raw of input.split(",")) {
    const part = raw.trim().toLowerCase()
    if (!part) continue
    const hit = CITY_IDS.find(([names]) =>
      names.some((n) => part === n || (/^[가-힣]/.test(n) && part.startsWith(n))),
    )
    if (!hit) return null
    if (!ids.includes(hit[1])) ids.push(hit[1])
  }
  return ids.length ? ids : null
}

// ---------------------------------------------------------------------------
// Query -> occupation category resolution.
//
// The /api/v3/job/postings endpoint has no free-text keyword parameter (the site's
// keyword search lives under /search, which robots.txt disallows). So --query is
// resolved in one of two ways:
//   1. "occupation": the query names a JobPlanet category (e.g. "백엔드" matches
//      "백엔드 개발", "데이터" matches the 데이터 group) -> server-side filter.
//   2. "text": no category matches -> client-side keyword filter over the fetched
//      page (title, company, categories, skills).

export interface QueryPlan {
  mode: "none" | "occupation" | "text"
  level1: number[]
  level2: number[]
  labels: string[]
  terms: string[]
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "")

export function planQuery(query: string | undefined): QueryPlan {
  const plan: QueryPlan = { mode: "none", level1: [], level2: [], labels: [], terms: [] }
  if (!query || !query.trim()) return plan
  const q = norm(query)
  for (const g of OCCUPATIONS) {
    if (norm(g.label) === q) {
      plan.level1.push(g.id)
      plan.labels.push(g.label)
    }
  }
  if (!plan.level1.length) {
    for (const g of OCCUPATIONS) {
      for (const [label, id] of g.children) {
        if (norm(label).includes(q) && !plan.level2.includes(id)) {
          plan.level2.push(id)
          plan.labels.push(label)
        }
      }
    }
  }
  if (plan.level1.length || plan.level2.length) {
    plan.mode = "occupation"
  } else {
    plan.mode = "text"
    plan.terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  }
  return plan
}

export function matchesTerms(job: JobCard, terms: string[]): boolean {
  if (!terms.length) return true
  const hay = [job.title, job.company ?? "", ...job.occupations, ...job.skills].join(" ").toLowerCase()
  return terms.every((t) => hay.includes(t))
}

// ---------------------------------------------------------------------------
// Search parsing

export interface JobCard {
  id: string
  title: string
  company: string | null
  companyId: string | null
  location: string | null
  date: string | null
  deadline: string | null
  url: string
  applyUrl: string | null
  jobType: string | null
  occupations: string[]
  skills: string[]
  /** JobPlanet company rating (기업 평점, 0-5) - null when the company has no reviews. */
  rating: number | null
  ratingCount: number | null
}

export interface SearchPage {
  total: number | null
  cards: JobCard[]
}

/** Map one API `recruits[]` entry to a JobCard; null if it lacks id/title. */
export function parseRecruit(r: unknown): JobCard | null {
  if (!r || typeof r !== "object") return null
  const o = r as Record<string, unknown>
  const id = str(o.id)
  const title = str(o.title)
  if (!id || !/^\d+$/.test(id) || !title) return null
  const company = (o.company && typeof o.company === "object" ? o.company : {}) as Record<string, unknown>
  const occ = (o.occupation_names && typeof o.occupation_names === "object" ? o.occupation_names : {}) as Record<
    string,
    unknown
  >
  const gradeCount = typeof company.grade_count === "number" ? company.grade_count : null
  const grade = typeof company.grade === "number" ? company.grade : null
  const skills = Array.isArray(o.skills)
    ? o.skills.map((s) => (s && typeof s === "object" ? str((s as Record<string, unknown>).name) : str(s)))
        .filter((s): s is string => s !== null)
    : []
  const cities = strList(o.cities)
  return {
    id,
    title: decodeHtmlEntities(title),
    company: str(company.name),
    companyId: str(company.id),
    location: cities.length ? cities.join(", ") : str(company.city_name),
    date: isoDate(o.start_at) ?? isoDate(o.created_at),
    deadline: isoDate(o.end_at),
    url: postingUrl(id),
    applyUrl: str(o.external_url),
    jobType: str(o.job_type),
    occupations: strList(occ.level2),
    skills,
    rating: grade !== null && gradeCount ? grade : null,
    ratingCount: gradeCount,
  }
}

/**
 * Parse the postings API body. Each recruit is mapped independently so one
 * malformed entry cannot break the rest.
 */
export function parseSearchResponse(body: string): SearchPage {
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    throw new Error("JobPlanet returned a non-JSON response for the postings API")
  }
  const data = (json as { data?: { total_count?: unknown; recruits?: unknown } })?.data
  if (!data || !Array.isArray(data.recruits)) {
    throw new Error("Unexpected postings API response shape (missing data.recruits)")
  }
  const cards: JobCard[] = []
  for (const r of data.recruits) {
    try {
      const c = parseRecruit(r)
      if (c) cards.push(c)
    } catch {
      // skip malformed entry
    }
  }
  return { total: typeof data.total_count === "number" ? data.total_count : null, cards }
}

// ---------------------------------------------------------------------------
// Detail parsing

export interface JobDetail extends JobCard {
  employmentType: string | null
  experience: string | null
  education: string | null
  address: string | null
  isActive: boolean | null
  description: string | null
}

/** Concatenate the Next.js flight chunks (`self.__next_f.push([1,"..."])`). */
export function extractFlight(html: string): string {
  let flight = ""
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g
  for (const m of html.matchAll(re)) {
    try {
      flight += JSON.parse(m[1]) as string
    } catch {
      // skip an undecodable chunk
    }
  }
  return flight
}

/** Return the balanced JSON object starting at `start` (string-aware brace matching). */
export function sliceObject(text: string, start: number): string | null {
  if (start < 0 || text[start] !== "{") return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let j = start; j < text.length; j++) {
    const c = text[j]
    if (inStr) {
      if (esc) esc = false
      else if (c === "\\") esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) return text.slice(start, j + 1)
    }
  }
  return null
}

function findJsonLdPosting(flight: string): Record<string, unknown> | null {
  for (const m of flight.matchAll(/"__html":("(?:[^"\\]|\\.)*")/g)) {
    try {
      const inner = JSON.parse(m[1]) as string
      if (!inner.includes('"JobPosting"')) continue
      const obj = JSON.parse(inner) as Record<string, unknown>
      if (obj["@type"] === "JobPosting") return obj
    } catch {
      // not JSON-LD
    }
  }
  return null
}

function findHydratedPosting(flight: string): Record<string, unknown> | null {
  const anchor = flight.indexOf("hydrationState")
  const start = flight.indexOf('{"open":', anchor === -1 ? 0 : anchor)
  const raw = sliceObject(flight, start)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

const SECTIONS: [key: string, heading: string][] = [
  ["introduction", "소개"],
  ["primary_responsibility", "주요업무"],
  ["required_qualification", "자격요건"],
  ["preferred_skill", "우대사항"],
  ["benefit", "혜택 및 복지"],
  ["hiring_process", "채용절차"],
  ["etc", "기타"],
]

/** Parse a posting page. Returns null when the page carries no posting. */
export function parseJobDetail(html: string, id: string): JobDetail | null {
  const flight = extractFlight(html)
  const ld = findJsonLdPosting(flight)
  const p = findHydratedPosting(flight)
  if (!ld && !p) return null
  const P = p ?? {}
  const L = ld ?? {}
  const org = (L.hiringOrganization && typeof L.hiringOrganization === "object" ? L.hiringOrganization : {}) as Record<
    string,
    unknown
  >
  const company = (P.company && typeof P.company === "object" ? P.company : {}) as Record<string, unknown>
  const reviews = (company.reviews && typeof company.reviews === "object" ? company.reviews : {}) as Record<string, unknown>
  const addr = (
    L.jobLocation && typeof L.jobLocation === "object"
      ? ((L.jobLocation as Record<string, unknown>).address ?? {})
      : {}
  ) as Record<string, unknown>

  const parts: string[] = []
  const ldDesc = str(L.description)
  if (ldDesc) {
    const t = htmlToText(decodeHtmlEntities(ldDesc))
    if (t) parts.push(t)
  }
  for (const [key, heading] of SECTIONS) {
    const v = str(P[key])
    if (!v) continue
    const t = htmlToText(v)
    if (t && !parts.some((x) => x.includes(t))) parts.push(`[${heading}]\n${t}`)
  }

  const scoreNum = str(P.score) !== null ? Number(P.score) : NaN
  const reviewCount = typeof reviews.count === "number" ? reviews.count : null
  const working = strList(P.working_area)
  const skills = Array.isArray(P.skills)
    ? P.skills.map((s) => (s && typeof s === "object" ? str((s as Record<string, unknown>).name) : str(s)))
        .filter((s): s is string => s !== null)
    : []
  const title = str(P.title) ?? str(L.title)

  return {
    id,
    title: title ? decodeHtmlEntities(title) : "(untitled)",
    company: str(P.name) ?? str(org.name),
    companyId: str(P.company_id) ?? (str(org.sameAs)?.match(/\/companies\/(\d+)/)?.[1] ?? null),
    location: working.length ? working.join(", ") : str(addr.addressRegion),
    date: isoDate(L.datePosted) ?? isoDate(P.start_at),
    deadline: isoDate(L.validThrough) ?? isoDate(P.end_at),
    url: postingUrl(id),
    applyUrl: str(P.outlink_website),
    jobType: str(P.job_type),
    occupations: strList(P.occupations),
    skills,
    rating: Number.isFinite(scoreNum) && scoreNum > 0 && reviewCount !== 0 ? scoreNum : null,
    ratingCount: reviewCount,
    employmentType: str(L.employmentType),
    experience: strList(P.recruitment_text).join(", ") || str((P.annual as Record<string, unknown> | undefined)?.text),
    education: str(P.education_level_name),
    address: str(P.location),
    isActive: typeof P.open === "boolean" ? P.open : null,
    description: parts.length ? parts.join("\n\n") : null,
  }
}

/** Today's date in Korea (UTC+9) minus `days`, as YYYY-MM-DD. */
export function kstCutoff(days: number, now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000 - days * 86400 * 1000)
  return kst.toISOString().slice(0, 10)
}
