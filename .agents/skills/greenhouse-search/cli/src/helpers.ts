// Data source: Greenhouse's PUBLIC Job Board API (boards-api.greenhouse.io).
// The GET job-board endpoints need no API key; the authenticated Harvest API and
// the /embed/ paths (disallowed by robots.txt) are never called. The list
// endpoint returns a board's whole job list in one response, so every filter
// and the pagination are client-side.

export const API_HOST = "boards-api.greenhouse.io"
export const API_BASE = `https://${API_HOST}/v1/boards`

/** Honest UA that names the tool (the repo's portal-CLI convention). */
const UA = "Mozilla/5.0 (compatible; greenhouse-cli/1.0)"
/** Per-request timeout: a large board list is ~500 KB, so allow more than the usual 15 s. */
const TIMEOUT_MS = 20000
/** Max retries on 429/5xx, per the portal-skill contract (~6). */
const MAX_RETRIES = 6

/** Write `{error, code}` as one JSON line to stderr. */
export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Board tokens are URL slugs (e.g. `coupang`, `gitlab`). */
const BOARD_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/** True when `token` looks like a Greenhouse board token. */
export function isValidBoard(token: string): boolean {
  return BOARD_RE.test(token)
}

export interface FetchOptions {
  fetchImpl?: typeof fetch
  /** First backoff delay in ms (tests pass a tiny value). */
  baseDelay?: number
}

/**
 * GET a JSON document from the Greenhouse Job Board API with exponential
 * backoff + jitter on 429/5xx.
 * Input: an absolute URL that must be on boards-api.greenhouse.io and outside /embed/.
 * Output: the parsed JSON, or `null` on 404. Throws on other failures.
 */
export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T | null> {
  const parsed = new URL(url)
  if (parsed.protocol !== "https:" || parsed.hostname !== API_HOST) {
    throw new Error(`refusing to fetch ${parsed.origin}: only https://${API_HOST} is allowed`)
  }
  if (parsed.pathname.startsWith("/embed/")) {
    throw new Error("refusing to fetch /embed/: disallowed by robots.txt")
  }
  const doFetch = opts.fetchImpl ?? fetch
  let delay = opts.baseDelay ?? 500
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await doFetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === MAX_RETRIES) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * delay)
      await new Promise((r) => setTimeout(r, delay + jitter))
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

/** One job as the list endpoint returns it (only the fields the CLI reads). */
export interface GhJob {
  id: number
  title?: string | null
  absolute_url?: string | null
  company_name?: string | null
  location?: { name?: string | null } | null
  updated_at?: string | null
  first_published?: string | null
  requisition_id?: string | null
  language?: string | null
  application_deadline?: string | null
}

/** The single-job endpoint adds content, departments and offices. */
export interface GhJobDetail extends GhJob {
  content?: string | null
  departments?: { name?: string | null }[] | null
  offices?: { name?: string | null; location?: string | null }[] | null
}

export interface GhList {
  jobs?: GhJob[]
  meta?: { total?: number }
}

export interface JobResult {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string | null
  updatedAt: string | null
  firstPublished: string | null
  deadline: string | null
  requisitionId: string | null
  language: string | null
}

export interface JobDetail extends JobResult {
  departments: string[]
  offices: string[]
  description: string | null
}

const orNull = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null)

/**
 * Map a Greenhouse job to the portal contract.
 * `date` is `first_published` when present, else `updated_at` (Greenhouse has no
 * other posting date). `company` is `company_name`, else the board token.
 * The free-form `metadata` array is deliberately dropped: boards can put
 * recruiter or hiring-manager names there.
 */
export function toResult(job: GhJob, board: string): JobResult {
  const firstPublished = orNull(job.first_published)
  const updatedAt = orNull(job.updated_at)
  return {
    id: String(job.id),
    title: orNull(job.title) ?? "(untitled)",
    company: orNull(job.company_name) ?? board,
    location: orNull(job.location?.name),
    date: firstPublished ?? updatedAt,
    url: orNull(job.absolute_url),
    updatedAt,
    firstPublished,
    deadline: orNull(job.application_deadline),
    requisitionId: orNull(job.requisition_id),
    language: orNull(job.language),
  }
}

/** Map the single-job response to the detail shape (description decoded to text). */
export function toDetail(job: GhJobDetail, board: string): JobDetail {
  const names = (xs: { name?: string | null }[] | null | undefined) =>
    (xs ?? []).map((x) => orNull(x.name)).filter((x): x is string => x !== null)
  return {
    ...toResult(job, board),
    departments: names(job.departments),
    offices: (job.offices ?? [])
      .map((o) => orNull(o.location) ?? orNull(o.name))
      .filter((x): x is string => x !== null),
    description: job.content ? htmlToText(job.content) || null : null,
  }
}

export interface FilterOpts {
  query?: string
  location?: string
  jobage?: number
}

/**
 * Client-side filters over the whole board list.
 * query: every whitespace-separated word must occur in the title (case-insensitive,
 *   hyphens ignored, so "backend" matches "Back-end" and "full-stack" matches "Fullstack").
 * location: substring of `location.name` (case-insensitive).
 * jobage: `date` (first_published, else updated_at) within the last N days of `now`.
 * Output: matching results, newest first (undated last).
 */
export function filterJobs(rows: JobResult[], opts: FilterOpts, now = Date.now()): JobResult[] {
  const fold = (s: string) => s.toLowerCase().replace(/-/g, "")
  const words = (opts.query ?? "").split(/\s+/).map(fold).filter(Boolean)
  const loc = opts.location?.trim().toLowerCase()
  const cutoff = opts.jobage ? now - opts.jobage * 86400000 : null
  const out = rows.filter((r) => {
    if (words.length) {
      const title = fold(r.title)
      if (!words.every((w) => title.includes(w))) return false
    }
    if (loc && !(r.location ?? "").toLowerCase().includes(loc)) return false
    if (cutoff !== null) {
      const t = r.date ? Date.parse(r.date) : NaN
      if (Number.isNaN(t) || t < cutoff) return false
    }
    return true
  })
  const time = (r: JobResult) => (r.date ? Date.parse(r.date) || 0 : 0)
  return out.sort((a, b) => time(b) - time(a))
}

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", euro: "€",
}

function codePoint(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

/**
 * Decode ONE level of HTML entities in a single pass, so `&amp;lt;` becomes
 * `&lt;` (not `<`). Unknown named entities are left as-is.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, ent: string) => {
    if (ent[0] === "#") {
      return ent[1] === "x" || ent[1] === "X" ? codePoint(parseInt(ent.slice(2), 16)) : codePoint(parseInt(ent.slice(1), 10))
    }
    return NAMED[ent.toLowerCase()] ?? m
  })
}

/**
 * Convert Greenhouse's `content` field to plain text.
 * The API escapes the posting's HTML once more (`&lt;p&gt;`, and text entities
 * arrive as `&amp;amp;`), so: decode once to get real HTML, turn block/list tags
 * into line breaks, strip the remaining tags, then decode the text a second time.
 */
export function htmlToText(content: string): string {
  const html = decodeEntities(content)
  const broken = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/\s+/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h[1-6]|ul|ol|table|tr|blockquote|section)>/gi, "\n\n")
    .replace(/<(p|div|h[1-6]|ul|ol|table|tr|blockquote|section)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
  return broken
    .split("\n")
    .map((line) => decodeEntities(line).replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const BOARD_HOSTS = new Set(["boards.greenhouse.io", "job-boards.greenhouse.io", API_HOST])

/**
 * Resolve a `detail` argument to a numeric Greenhouse job id.
 * Accepts: a bare id; boards.greenhouse.io / job-boards.greenhouse.io
 * `/<token>/jobs/<id>`; boards-api `/v1/boards/<token>/jobs/<id>`; or any URL
 * carrying `gh_jid=<id>` (e.g. a company careers page). A Greenhouse URL whose
 * token differs from `--board` is rejected. Output: `{id}` or `{error}`.
 * Only the id is used; the input URL itself is never fetched.
 */
export function resolveJobId(input: string, board: string): { id: string } | { error: string } {
  const raw = input.trim()
  if (/^\d+$/.test(raw)) return { id: raw }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { error: `"${input}" is neither a numeric Greenhouse job id nor a URL` }
  }
  const jid = url.searchParams.get("gh_jid")
  if (BOARD_HOSTS.has(url.hostname)) {
    const m = url.pathname.match(/^\/(?:v1\/boards\/)?([^/]+)\/jobs\/(\d+)\/?$/)
    if (m) {
      if (m[1].toLowerCase() !== board.toLowerCase()) {
        return { error: `URL is for board "${m[1]}" but --board is "${board}"` }
      }
      return { id: m[2] }
    }
  }
  if (jid && /^\d+$/.test(jid)) return { id: jid }
  return { error: `could not find a Greenhouse job id in "${input}" (want /<board>/jobs/<id> on a greenhouse.io host, or a gh_jid= parameter)` }
}
