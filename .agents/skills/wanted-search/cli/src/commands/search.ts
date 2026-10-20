import {
  BASE_URL,
  BROWSE_PATH,
  SEARCH_PATH,
  apiGet,
  toResults,
  writeError,
  type JobResult,
} from "../helpers.js"

/** Results per API page. Fixed so that --page N always means the same slice. */
export const PAGE_SIZE = 20

export interface SearchOpts {
  query?: string
  locations: string[] // Wanted location keys, already validated
  years?: number // experience in years; postings whose range covers it
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  params.set("country", "kr")
  if (opts.query) {
    params.set("query", opts.query)
    params.set("tab", "position")
    params.set("result_items", "jobs")
  }
  if (opts.locations.length === 0) params.append("locations", "all")
  for (const loc of opts.locations) params.append("locations", loc)
  params.set("years", opts.years === undefined ? "-1" : String(opts.years))
  params.set("job_sort", "job.latest_order")
  params.set("limit", String(PAGE_SIZE))
  params.set("offset", String((opts.page - 1) * PAGE_SIZE))
  return `${BASE_URL}${opts.query ? SEARCH_PATH : BROWSE_PATH}?${params.toString()}`
}

/** The search endpoint nests items under data.jobs; the browse endpoint returns them as data. */
export function extractItems(body: unknown): unknown {
  const data = (body as { data?: unknown } | null)?.data
  if (Array.isArray(data)) return data
  return (data as { jobs?: unknown } | undefined)?.jobs
}

function experience(r: JobResult): string {
  if (r.experienceMin === null && r.experienceMax === null) return "—"
  if (r.experienceMin === 0 && r.experienceMax === 0) return "신입"
  if (r.experienceMax === null) return `${r.experienceMin ?? 0}y+`
  return `${r.experienceMin ?? 0}-${r.experienceMax}y`
}

/** Display width: Hangul and other wide glyphs take two terminal columns. */
function width(s: string): number {
  let w = 0
  for (const ch of s) w += /[ᄀ-ᇿ⺀-꓏가-힣豈-﫿＀-￦]/.test(ch) ? 2 : 1
  return w
}

function fit(s: string, cols: number): string {
  let out = ""
  for (const ch of s) {
    if (width(out + ch) > cols) break
    out += ch
  }
  return out + " ".repeat(cols - width(out))
}

function renderTable(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  const header = `${fit("ID", 7)} ${fit("TITLE", 44)} ${fit("COMPANY", 22)} ${fit("LOCATION", 14)} ${fit("EXP", 7)} DEADLINE`
  const lines = rows.map(
    (r) =>
      `${fit(r.id, 7)} ${fit(r.title, 44)} ${fit(r.company || "—", 22)} ${fit(r.location || "—", 14)} ${fit(experience(r), 7)} ${r.deadline || "상시"}`,
  )
  return [header, "-".repeat(width(header)), ...lines].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const body = await apiGet<unknown>(buildUrl(opts))
    let results = body === null ? [] : toResults(extractItems(body))
    if (opts.limit !== undefined) results = results.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(results) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (results.length === 0
          ? "No results."
          : results
              .map(
                (r) =>
                  `${r.title}\n  ${r.company || "—"} · ${r.location || "—"} · 경력 ${experience(r)} · 마감 ${r.deadline || "상시"}\n  id: ${r.id}\n  ${r.url}`,
              )
              .join("\n\n")) + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: results.length, page: opts.page }, results }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
