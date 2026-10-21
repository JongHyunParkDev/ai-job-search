import { API_BASE, fetchJson, filterJobs, toResult, writeError, type GhList, type JobResult } from "../helpers.js"

/** Default client-side page size when --limit is not given. */
export const DEFAULT_PAGE_SIZE = 20

export interface SearchOpts {
  board: string
  query?: string
  location?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

const shortDate = (d: string | null) => (d ? d.slice(0, 10) : "—")

function renderTable(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  const cols: { header: string; width: number; cell: (r: JobResult) => string }[] = [
    { header: "ID", width: Math.max(2, ...rows.map((r) => r.id.length)), cell: (r) => r.id },
    { header: "TITLE", width: 50, cell: (r) => r.title },
    { header: "LOCATION", width: 26, cell: (r) => r.location ?? "—" },
    { header: "DATE", width: 10, cell: (r) => shortDate(r.date) },
  ]
  const line = (cells: string[]) => cells.map((c, i) => c.slice(0, cols[i].width).padEnd(cols[i].width)).join("  ")
  const header = line(cols.map((c) => c.header))
  return [header, "-".repeat(header.length), ...rows.map((r) => line(cols.map((c) => c.cell(r))))].join("\n")
}

function renderPlain(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  return rows
    .map((r) => [r.title, `  ${r.company ?? "—"} · ${r.location ?? "—"} · ${shortDate(r.date)}`, `  id: ${r.id}`, `  ${r.url ?? "—"}`].join("\n"))
    .join("\n\n")
}

/**
 * Fetch a board's full job list once, filter and paginate it client-side, and
 * print it. Output (json): `{meta:{count,page,total,board,pageSize,boardTotal},results}`
 * where `total` counts matches after filtering and `boardTotal` is the board's
 * size. Returns the process exit code.
 */
export async function runSearch(opts: SearchOpts): Promise<number> {
  let list: GhList | null
  try {
    list = await fetchJson<GhList>(`${API_BASE}/${encodeURIComponent(opts.board)}/jobs`)
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
  if (!list) {
    writeError(`Greenhouse board "${opts.board}" not found`, "BOARD_NOT_FOUND")
    return 1
  }
  const all = (list.jobs ?? []).map((j) => toResult(j, opts.board))
  const matched = filterJobs(all, opts)
  const pageSize = opts.limit ?? DEFAULT_PAGE_SIZE
  const rows = matched.slice((opts.page - 1) * pageSize, opts.page * pageSize)

  if (opts.format === "table") {
    process.stdout.write(renderTable(rows) + "\n")
  } else if (opts.format === "plain") {
    process.stdout.write(renderPlain(rows) + "\n")
  } else {
    const meta = {
      count: rows.length,
      page: opts.page,
      total: matched.length,
      board: opts.board,
      pageSize,
      boardTotal: list.meta?.total ?? all.length,
    }
    process.stdout.write(JSON.stringify({ meta, results: rows }, null, 2) + "\n")
  }
  return 0
}
