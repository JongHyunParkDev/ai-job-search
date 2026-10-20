// Data source: Wanted's (원티드, wanted.co.kr) public JSON API, the same endpoints
// the website's own frontend calls. Reads are unauthenticated. There is no HTML
// to parse: we fetch JSON and reshape it into the portal-skill contract.
//
//   search  GET /api/v4/search?query=...   (keyword search, jobs tab)
//   browse  GET /api/v4/jobs                (no keyword: latest postings)
//   detail  GET /api/v4/jobs/<id>
//
// Both list endpoints return items of the same shape under different keys
// (`data.jobs` for search, `data` for browse); see url-reference.md.

export const BASE_URL = "https://www.wanted.co.kr"
export const SEARCH_PATH = "/api/v4/search"
export const BROWSE_PATH = "/api/v4/jobs"
export const DETAIL_PATH = "/api/v4/jobs"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; wanted-cli/1.0)"
const REQUEST_TIMEOUT_MS = 15000

/**
 * GET a JSON document with exponential backoff (plus jitter) on 429/5xx and
 * network timeouts. Returns null on a 404 rather than throwing.
 */
export async function apiGet<T>(url: string): Promise<T | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
      if (!timedOut || attempt === maxRetries) {
        throw new Error(
          timedOut ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s` : `Request failed: ${String(e)}`,
        )
      }
      await sleep(delay)
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      await sleep(delay)
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as T
  }
  throw new Error("Request failed after max retries")
}

function sleep(base: number): Promise<void> {
  const jitter = Math.floor(Math.random() * 500)
  return new Promise((r) => setTimeout(r, base + jitter))
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

/**
 * Wanted's top-level region keys (the `address.location_key` values the API
 * returns and the `locations` query parameter accepts), keyed by the Korean
 * and English names a user is likely to type.
 */
const REGION_KEYS: Record<string, string> = {
  서울: "seoul", seoul: "seoul",
  부산: "busan", busan: "busan",
  대구: "daegu", daegu: "daegu",
  인천: "incheon", incheon: "incheon",
  광주: "gwangju", gwangju: "gwangju",
  대전: "daejeon", daejeon: "daejeon",
  울산: "ulsan", ulsan: "ulsan",
  세종: "sejong", sejong: "sejong",
  경기: "gyeonggi", gyeonggi: "gyeonggi",
  강원: "gangwon", gangwon: "gangwon",
  충북: "chungbuk", chungbuk: "chungbuk",
  충남: "chungnam", chungnam: "chungnam",
  전북: "jeonbuk", jeonbuk: "jeonbuk",
  전남: "jeonnam", jeonnam: "jeonnam",
  경북: "gyeongbuk", gyeongbuk: "gyeongbuk",
  경남: "gyeongnam", gyeongnam: "gyeongnam",
  제주: "jeju", jeju: "jeju",
}

const REGION_SUFFIX = /(특별자치시|특별자치도|특별시|광역시|도|시)$/

/**
 * Map one user-supplied location to a Wanted location key. Accepts a Korean
 * or English region name ("서울", "서울특별시", "Seoul", "gyeonggi") or a
 * district key in Wanted's own form ("seoul.gangnam-gu"). Returns null for
 * anything else, so an unknown value is rejected instead of silently searching
 * the whole country.
 */
export function toLocationKey(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (REGION_KEYS[lower]) return REGION_KEYS[lower]
  const stripped = raw.replace(REGION_SUFFIX, "")
  if (REGION_KEYS[stripped]) return REGION_KEYS[stripped]
  const district = lower.match(/^([a-z]+)\.([a-z0-9-]+)$/)
  if (district && Object.values(REGION_KEYS).includes(district[1])) return lower
  return null
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

interface RawTag {
  id?: number
  title?: string | null
  text?: string | null
}

export interface RawJob {
  id: number
  position?: string | null
  status?: string | null
  due_time?: string | null
  annual_from?: number | null
  annual_to?: number | null
  company?: { id?: number; name?: string | null; industry_name?: string | null } | null
  address?: {
    location?: string | null
    district?: string | null
    full_location?: string | null
    location_key?: string | null
    district_key?: string | null
  } | null
  category_tags?: RawTag[] | null
  skill_tags?: RawTag[] | null
  company_tags?: RawTag[] | null
  detail?: {
    intro?: string | null
    main_tasks?: string | null
    requirements?: string | null
    preferred_points?: string | null
    benefits?: string | null
  } | null
}

export interface JobResult {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  deadline: string | null
  experienceMin: number | null
  experienceMax: number | null
  industry: string | null
  categoryIds: number[]
}

export interface JobDetail extends JobResult {
  status: string | null
  isActive: boolean
  address: string | null
  skills: string[]
  companyTags: string[]
  description: string | null
  sections: {
    intro: string | null
    mainTasks: string | null
    requirements: string | null
    preferredPoints: string | null
    benefits: string | null
  }
}

export function jobUrl(id: string | number): string {
  return `${BASE_URL}/wd/${id}`
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t ? t : null
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function locationOf(a: RawJob["address"]): string | null {
  if (!a) return null
  const parts = [str(a.location), str(a.district)].filter((p): p is string => p !== null)
  return parts.length ? parts.join(" ") : null
}

/** Wanted reports "no deadline" (상시채용) as a null due_time. */
function deadlineOf(v: unknown): string | null {
  const s = str(v)
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

/**
 * Reshape one list item into a contract result. Items without an id or title
 * return null so one malformed entry cannot break the rest.
 */
export function toResult(raw: RawJob): JobResult | null {
  if (!raw || (typeof raw.id !== "number" && typeof raw.id !== "string")) return null
  const title = str(raw.position)
  if (!title) return null
  const id = String(raw.id)
  return {
    id,
    title,
    company: str(raw.company?.name),
    location: locationOf(raw.address),
    // The Wanted API exposes no posting/publication date on list or detail
    // responses, so `date` is always null (see SKILL.md Notes).
    date: null,
    url: jobUrl(id),
    deadline: deadlineOf(raw.due_time),
    experienceMin: num(raw.annual_from),
    // Wanted encodes "no upper bound" (e.g. "5년 이상") as annual_to = 100.
    experienceMax: (num(raw.annual_to) ?? 0) >= 100 ? null : num(raw.annual_to),
    industry: str(raw.company?.industry_name),
    categoryIds: (raw.category_tags ?? []).map((t) => t?.id).filter((x): x is number => typeof x === "number"),
  }
}

export function toResults(items: unknown): JobResult[] {
  if (!Array.isArray(items)) return []
  const out: JobResult[] = []
  for (const item of items) {
    try {
      const r = toResult(item as RawJob)
      if (r) out.push(r)
    } catch {
      // skip a malformed item
    }
  }
  return out
}

/** Normalise free text from the API: CRLF -> LF, zero-width chars removed, blank runs collapsed. */
export function cleanText(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[​‌‍﻿]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() || null
}

function tagTitles(tags: RawTag[] | null | undefined): string[] {
  return (tags ?? [])
    .map((t) => str(t?.title) ?? str(t?.text))
    .filter((x): x is string => x !== null)
}

export function toDetail(raw: RawJob): JobDetail | null {
  const base = toResult(raw)
  if (!base) return null
  const d = raw.detail ?? {}
  const sections = {
    intro: cleanText(d.intro),
    mainTasks: cleanText(d.main_tasks),
    requirements: cleanText(d.requirements),
    preferredPoints: cleanText(d.preferred_points),
    benefits: cleanText(d.benefits),
  }
  const labelled: [string, string | null][] = [
    ["포지션 소개 (Intro)", sections.intro],
    ["주요업무 (Main tasks)", sections.mainTasks],
    ["자격요건 (Requirements)", sections.requirements],
    ["우대사항 (Preferred)", sections.preferredPoints],
    ["혜택 및 복지 (Benefits)", sections.benefits],
  ]
  const description =
    labelled
      .filter(([, body]) => body)
      .map(([label, body]) => `## ${label}\n${body}`)
      .join("\n\n") || null
  const status = str(raw.status)
  return {
    ...base,
    status,
    isActive: status === "active",
    address: str(raw.address?.full_location),
    skills: tagTitles(raw.skill_tags),
    companyTags: tagTitles(raw.company_tags),
    description,
    sections,
  }
}

/**
 * Accept a numeric id or a wanted.co.kr job URL (`/wd/<id>`). URLs on any
 * other host are rejected (parsed with URL, so look-alike hosts and userinfo
 * tricks fail too).
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{1,12}$/.test(trimmed)) return trimmed
  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!/(^|\.)wanted\.co\.kr$/i.test(parsed.hostname)) return null
  const m = parsed.pathname.match(/^\/(?:wd|api\/v4\/jobs)\/(\d{1,12})\/?$/)
  return m ? m[1] : null
}
