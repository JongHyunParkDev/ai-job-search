// Data source: Saramin's public HTML pages (https://www.saramin.co.kr). No
// authentication required. Search returns a server-rendered results page with
// one `<div class="item_recruit" value="<rec_idx>">` card per posting; detail is
// two public pages: the posting's relay view (summary in <meta> tags) and the
// view-detail body (the employer-written description). Both are parsed with
// regex - the markup is shallow and a DOM parser would be a runtime dependency.
//
// robots.txt (checked 2026-10-20) does not disallow /zf_user/search/recruit,
// /zf_user/jobs/relay/view or /zf_user/jobs/relay/view-detail for "*".

export const BASE_URL = "https://www.saramin.co.kr"
export const SEARCH_URL = `${BASE_URL}/zf_user/search/recruit`
export const VIEW_URL = `${BASE_URL}/zf_user/jobs/relay/view`
export const VIEW_DETAIL_URL = `${BASE_URL}/zf_user/jobs/relay/view-detail`

/** Saramin's fixed page size used by this CLI (recruitPageCount). */
export const PAGE_SIZE = 40

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; saramin-cli/1.0)"

/** Request timeout per attempt, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 20000

/** Fetch HTML with exponential backoff + jitter on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  /** ISO date (YYYY-MM-DD) the posting was registered or last modified - see dateType. */
  date: string | null
  /** "registered" (등록일) or "modified" (수정일): which date Saramin shows on the card. */
  dateType: "registered" | "modified" | null
  /** Deadline as shown on the card, e.g. "~ 10/27(화)", "내일마감", "채용시". */
  deadline: string | null
  /** Best-effort ISO deadline (null for rolling "채용시"/"상시채용"). */
  deadlineDate: string | null
  /** Experience requirement (경력), e.g. "신입·경력", "경력 3~15년", "경력무관". */
  career: string | null
  /** Education requirement (학력), e.g. "대졸↑", "학력무관". */
  education: string | null
  /** Employment type (근무형태), e.g. "정규직", "정규직·계약직". */
  employmentType: string | null
  /** Job sector / skill tags shown on the card. */
  sectors: string[]
  url: string
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  career: string | null
  education: string | null
  salary: string | null
  deadlineDate: string | null
  homepage: string | null
  description: string | null
  /** Number of images in the description body (many Saramin postings are image-only). */
  descriptionImageCount: number
}

/** Canonical public URL for a posting. */
export function postingUrl(id: string): string {
  return `${VIEW_URL}?rec_idx=${id}`
}

/**
 * Extract the inner HTML of a <div> identified by a CSS class name, correctly
 * handling nested <div> elements by tracking tag depth.
 */
export function extractDivContent(html: string, className: string): string | null {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const openRe = new RegExp(`<div[^>]*class="[^"]*${escaped}[^"]*"[^>]*>`, "i")
  const open = openRe.exec(html)
  if (!open) return null

  let i = open.index + open[0].length
  let depth = 1

  while (depth > 0 && i < html.length) {
    const nextOpen = indexOfRe(html, /<div[\s>]/gi, i)
    const nextClose = html.indexOf("</div>", i)

    if (nextClose === -1) return html.slice(open.index + open[0].length)

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

function indexOfRe(text: string, re: RegExp, from: number): number {
  re.lastIndex = from
  const m = re.exec(text)
  return m ? m.index : -1
}

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
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    // &amp; last, so "&amp;lt;" decodes to the literal text "&lt;", not "<".
    .replace(/&amp;/g, "&")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Today's date in Korea (Asia/Seoul) as YYYY-MM-DD - Saramin dates are KST. */
export function todayKST(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** "등록일 26/10/07" / "수정일 26/09/29" -> { date: "2026-10-07", type }. */
export function parseCardDate(text: string): { date: string | null; type: JobCard["dateType"] } {
  const m = text.match(/(등록일|수정일)\s*(\d{2})\/(\d{2})\/(\d{2})/)
  if (!m) return { date: null, type: null }
  return {
    date: `20${m[2]}-${m[3]}-${m[4]}`,
    type: m[1] === "등록일" ? "registered" : "modified",
  }
}

/**
 * Resolve the card's deadline text to an ISO date. "~ 10/27(화)" carries no
 * year: it is the next occurrence of that month/day on or after `today`
 * (a deadline already a few days past is kept in the current year).
 */
export function parseDeadline(text: string, today: string = todayKST()): string | null {
  const t = text.trim()
  if (!t) return null
  if (/오늘\s*마감/.test(t)) return today
  if (/내일\s*마감/.test(t)) return addDays(today, 1)
  const full = t.match(/(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/)
  if (full) return `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`
  const md = t.match(/(\d{1,2})\/(\d{1,2})/)
  if (!md) return null
  const year = parseInt(today.slice(0, 4), 10)
  const mm = md[1].padStart(2, "0")
  const dd = md[2].padStart(2, "0")
  let iso = `${year}-${mm}-${dd}`
  if (iso < addDays(today, -31)) iso = `${year + 1}-${mm}-${dd}`
  return iso
}

const CAREER_RE = /경력|신입/
const EDU_RE = /졸|학력|고교|대학/
const EMP_RE = /정규직|계약직|인턴|파견|아르바이트|프리랜서|위촉|병역특례|교육생|연수생|해외취업|도급|전임/

/**
 * Parse the search response. The page is split on each `class="item_recruit"`
 * card and every chunk is parsed independently, so one malformed card cannot
 * break the rest.
 */
export function parseJobCards(html: string, today: string = todayKST()): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<div class="item_recruit"/).slice(1)

  for (const chunk of chunks) {
    try {
      const idMatch = chunk.match(/^\s*value="(\d+)"/) || chunk.match(/rec_idx=(\d+)/)
      if (!idMatch) continue
      const id = idMatch[1]

      const tit = chunk.match(/<h2 class="job_tit">([\s\S]*?)<\/h2>/i)
      let title: string | null = null
      if (tit) {
        const attr = tit[1].match(/\btitle="([^"]*)"/i)
        title = attr ? clean(attr[1]) : clean(tit[1])
      }
      if (!title) continue

      const corp = chunk.match(/<strong class="corp_name">([\s\S]*?)<\/strong>/i)
      const company = corp ? clean(corp[1]) || null : null

      // job_condition: <span>location</span> <span>career</span> <span>education</span> <span>type</span>
      let location: string | null = null
      let career: string | null = null
      let education: string | null = null
      let employmentType: string | null = null
      const cond = chunk.match(/<div class="job_condition">([\s\S]*?)<\/div>/i)
      if (cond) {
        const spans = [...cond[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => clean(m[1]))
        const [loc, ...rest] = spans
        location = loc ? loc.replace(/\s+,/g, ",") : null
        for (const s of rest) {
          if (!s) continue
          if (!career && CAREER_RE.test(s)) career = s
          else if (!education && EDU_RE.test(s)) education = s
          else if (!employmentType && EMP_RE.test(s)) employmentType = s
          else if (!employmentType) employmentType = s
        }
      }

      const dateSpan = chunk.match(/<div class="job_date">[\s\S]*?<span class="date">([\s\S]*?)<\/span>/i)
      const deadline = dateSpan ? clean(dateSpan[1]) || null : null

      const day = chunk.match(/<span class="job_day">([\s\S]*?)<\/span>/i)
      const { date, type: dateType } = day ? parseCardDate(clean(day[1])) : { date: null, type: null }

      const sectors: string[] = []
      const sector = chunk.match(/<div class="job_sector">([\s\S]*?)<\/div>/i)
      if (sector) {
        for (const a of sector[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)) {
          const s = clean(a[1])
          if (s) sectors.push(s)
        }
      }

      results.push({
        id,
        title,
        company,
        location,
        date,
        dateType,
        deadline,
        deadlineDate: deadline ? parseDeadline(deadline, today) : null,
        career,
        education,
        employmentType,
        sectors,
        url: postingUrl(id),
      })
    } catch {
      // One malformed card must not break the rest.
      continue
    }
  }

  return results
}

/** "총 2,421건" -> 2421 (the total number of matching postings). */
export function parseTotalCount(html: string): number | null {
  const m = html.match(/class="cnt_result"[^>]*>\s*총\s*([\d,]+)\s*건/)
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null
}

function metaContent(html: string, attr: "name" | "property", key: string): string | null {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, "i")
  const m = html.match(re)
  return m ? decodeHtmlEntities(m[1]).trim() : null
}

/**
 * Parse the relay view page. Its summary is server-rendered only into <meta>
 * tags (the visible summary loads via XHR):
 *   og:title    "[<company>] <title>(D-1) - 사람인"
 *   description "<company>, <title>, 경력:..., 학력:..., <salary>, 마감일:YYYY-MM-DD, 홈페이지:..."
 */
export function parseViewMeta(html: string): Omit<JobDetail, "id" | "url" | "description" | "descriptionImageCount" | "location" | "date"> | null {
  const ogTitle = metaContent(html, "property", "og:title")
  const desc = metaContent(html, "name", "description") ?? metaContent(html, "property", "og:description")
  if (!ogTitle && !desc) return null

  let company: string | null = null
  let title: string | null = null
  if (ogTitle) {
    const m = ogTitle.match(/^\[(.+?)\]\s*([\s\S]*?)(?:\(D-\d+\)|\(오늘마감\)|\(마감\))?\s*-\s*사람인\s*$/)
    if (m) {
      company = m[1].trim() || null
      title = m[2].trim() || null
    } else {
      title = ogTitle.replace(/\s*-\s*사람인\s*$/, "").trim() || null
    }
  }

  let career: string | null = null
  let education: string | null = null
  let salary: string | null = null
  let deadlineDate: string | null = null
  let homepage: string | null = null
  if (desc) {
    const parts = desc.split(/,\s*/)
    const free: string[] = []
    for (const p of parts) {
      const kv = p.match(/^(경력|학력|마감일|홈페이지|급여|연봉)\s*:\s*(.*)$/)
      if (!kv) {
        free.push(p)
        continue
      }
      const v = kv[2].trim() || null
      if (kv[1] === "경력") career = v
      else if (kv[1] === "학력") education = v
      else if (kv[1] === "마감일") deadlineDate = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
      else if (kv[1] === "홈페이지") homepage = v
      else salary = v
    }
    // Unlabelled parts: company, title, then (often) the salary text such as
    // "면접 후 결정" or "3,500~4,000만원". Titles may contain commas, so only
    // take a trailing unlabelled part as salary when it looks like pay.
    if (!salary) {
      const pay = free.slice(1).reverse().find((p) => /만원|면접\s*후|회사내규|결정|협의|원$/.test(p))
      if (pay) salary = pay
    }
    if (!company && free[0]) company = free[0]
  }

  return {
    title: title ?? "(untitled)",
    company,
    career,
    education,
    salary,
    deadlineDate,
    homepage,
  }
}

/** Convert the view-detail body to readable text with paragraph breaks kept. */
export function parseDescription(html: string): { text: string | null; images: number } {
  const body = extractDivContent(html, "user_content") ?? html
  const images = (body.match(/<img\b/gi) || []).length
  const withBreaks = body
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr|table|dt|dd)>/gi, "\n")
  const text = withBreaks
    .split("\n")
    .map(clean)
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return { text: text || null, images }
}

// --- Location ---------------------------------------------------------------
// Saramin region codes (from the area map embedded in the search page, 2026-10).
// Top-level codes (ending in 000) go to loc_mcd, district codes to loc_cd.
const REGIONS: Record<string, string> = {
  서울: "101000", seoul: "101000",
  경기: "102000", gyeonggi: "102000",
  대구: "104000", daegu: "104000",
  대전: "105000", daejeon: "105000",
  부산: "106000", busan: "106000",
  울산: "107000", ulsan: "107000",
  인천: "108000", incheon: "108000",
  강원: "109000", gangwon: "109000",
  경남: "110000", 경상남: "110000", gyeongnam: "110000",
  경북: "111000", 경상북: "111000", gyeongbuk: "111000",
  광주: "112000", gwangju: "112000", 전남: "112000", 전라남: "112000", jeonnam: "112000",
  전북: "113000", 전라북: "113000", jeonbuk: "113000",
  충북: "114000", 충청북: "114000", chungbuk: "114000",
  충남: "115000", 충청남: "115000", chungnam: "115000",
  제주: "116000", jeju: "116000",
  전국: "117000", nationwide: "117000",
  세종: "118000", sejong: "118000",
  // Popular districts / tech hubs.
  판교: "102180", pangyo: "102180", 성남: "102180", seongnam: "102180",
  분당: "102190", bundang: "102190",
  수원: "102220", suwon: "102220",
  용인: "102400", yongin: "102400",
  고양: "102020", goyang: "102020", 일산: "102020", ilsan: "102020",
  화성: "102510", hwaseong: "102510", 동탄: "102520", dongtan: "102520",
  평택: "102480", pyeongtaek: "102480",
  안양: "102320", anyang: "102320",
  부천: "102140", bucheon: "102140",
  하남: "102500", hanam: "102500",
  과천: "102060", gwacheon: "102060",
  강남: "101010", gangnam: "101010",
  서초: "101150", seocho: "101150",
  송파: "101180", songpa: "101180",
  마포: "101130", mapo: "101130",
  영등포: "101200", 여의도: "101200", yeongdeungpo: "101200", yeouido: "101200",
  구로: "101070", guro: "101070",
  금천: "101080", 가산: "101080", geumcheon: "101080", gasan: "101080",
  성동: "101160", 성수: "101160", seongdong: "101160", seongsu: "101160",
  종로: "101230", jongno: "101230",
  해운대: "106160", haeundae: "106160",
  부산진: "106070", 서면: "106070",
  송도: "108080", 연수: "108080", songdo: "108080",
  유성: "105040", yuseong: "105040",
  창원: "110150", changwon: "110150",
  청주: "114110", cheongju: "114110",
  천안: "115130", cheonan: "115130",
  포항: "111230", pohang: "111230",
  구미: "111040", gumi: "111040",
}

function normalizePlace(raw: string): string {
  // "서울특별시" -> "서울", "경기도" -> "경기", "성남시" -> "성남", "강남구" -> "강남".
  let s = raw.trim().toLowerCase().replace(/\s+/g, "")
  s = s.replace(/(특별자치시|특별자치도|특별시|광역시)$/, "")
  if (s.length > 2) s = s.replace(/(시|도|구|군)$/, "")
  return s
}

/**
 * Resolve --location ("서울", "판교", "Busan", "101010", "서울,판교") to
 * Saramin's loc_mcd (province) and loc_cd (district) values. Returns null and
 * the offending part when a place is unknown.
 */
export function resolveLocation(input: string): { mcd: string[]; cd: string[] } | { unknown: string } {
  const mcd: string[] = []
  const cd: string[] = []
  for (const part of input.split(/[,，]/).map((p) => p.trim()).filter(Boolean)) {
    const code = /^\d{6}$/.test(part) ? part : REGIONS[normalizePlace(part)] ?? REGIONS[part.trim().toLowerCase()]
    if (!code) return { unknown: part }
    const bucket = code.endsWith("000") ? mcd : cd
    if (!bucket.includes(code)) bucket.push(code)
  }
  if (mcd.length === 0 && cd.length === 0) return { unknown: input }
  return { mcd, cd }
}

export const KNOWN_PLACES = Object.keys(REGIONS).filter((k) => /[가-힣]/.test(k))
