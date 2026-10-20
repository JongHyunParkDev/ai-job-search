import {
  SEARCH_URL,
  PAGE_SIZE,
  htmlFetch,
  parseJobCards,
  parseTotalCount,
  todayKST,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  /** Resolved Saramin region codes (see resolveLocation). */
  locMcd?: string[]
  locCd?: string[]
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  params.set("searchType", "search")
  params.set("searchword", opts.query)
  if (opts.locMcd && opts.locMcd.length) params.set("loc_mcd", opts.locMcd.join(","))
  if (opts.locCd && opts.locCd.length) params.set("loc_cd", opts.locCd.join(","))
  // Saramin has no posted-within parameter; when --jobage is set we sort by
  // registration date so the freshest postings come first, then filter
  // client-side on the card date.
  if (opts.jobage !== undefined) params.set("recruitSort", "reg_dt")
  params.set("recruitPage", String(opts.page))
  params.set("recruitPageCount", String(PAGE_SIZE))
  return `${SEARCH_URL}?${params.toString()}`
}

/** Keep cards whose (registration or modification) date is within `days` days of today (KST). */
export function filterByAge(cards: JobCard[], days: number, today: string = todayKST()): JobCard[] {
  const cutoff = new Date(`${today}T00:00:00Z`)
  cutoff.setUTCDate(cutoff.getUTCDate() - days)
  const iso = cutoff.toISOString().slice(0, 10)
  return cards.filter((c) => c.date !== null && c.date >= iso)
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  // Korean characters render double-width in most terminals; keep columns short.
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 36)
    const company = (c.company || "—").slice(0, 18)
    const loc = (c.location || "—").slice(0, 14)
    const career = (c.career || "—").slice(0, 12)
    return [c.id, c.date || "—", c.deadline || "—", loc, career, company, title].join(" | ")
  })
  const header = ["ID", "DATE", "DEADLINE", "LOCATION", "CAREER", "COMPANY", "TITLE"].join(" | ")
  return [header, "-".repeat(header.length + 20), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    let cards = parseJobCards(html)
    if (opts.jobage !== undefined) cards = filterByAge(cards, opts.jobage)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (cards.length === 0
          ? "No results."
          : cards
              .map(
                (c) =>
                  `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.career || "—"} · ${c.education || "—"} · ${c.employmentType || "—"}\n  date: ${c.date || "—"} · deadline: ${c.deadline || "—"}\n  id: ${c.id}\n  ${c.url}`,
              )
              .join("\n\n")) + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: opts.page, total: parseTotalCount(html) }, results: cards },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
