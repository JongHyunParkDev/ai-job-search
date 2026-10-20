import {
  PAGE_SIZE,
  SEARCH_URL,
  daysBetween,
  encodeEucKr,
  htmlFetch,
  parseJobCards,
  todayKst,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  location?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

/**
 * Incruit has no separate location or posting-age parameter on its keyword
 * search; its own search box says "회사명, 직종, 지역 등" (company, job, region...)
 * go into the keyword. So --location is appended to kw (and also applied as a
 * client-side filter on the card's location), and --jobage filters the page
 * client-side by registration date. Results keep Incruit's default relevance
 * order: its newest-first sort (SortCd=reg) matches multi-word queries so
 * loosely that most results were off-topic in testing.
 */
export function buildUrl(opts: SearchOpts): string {
  const kw = [opts.query, opts.location].filter((s) => s && s.trim()).join(" ")
  const parts = [
    "col=job",
    `kw=${encodeEucKr(kw)}`,
    `psize=${PAGE_SIZE}`,
    `startno=${(opts.page - 1) * PAGE_SIZE}`,
  ]
  return `${SEARCH_URL}?${parts.join("&")}`
}

const squash = (s: string) => s.replace(/\s+/g, "")

export function applyFilters(cards: JobCard[], opts: SearchOpts, today = todayKst()): JobCard[] {
  let out = cards
  if (opts.location && opts.location.trim()) {
    // Card locations are written "서울 강남구 외"; compare whitespace-free so
    // "서울 강남구" and "서울강남구" both match.
    const want = squash(opts.location)
    out = out.filter((c) => c.location !== null && squash(c.location).includes(want))
  }
  if (opts.jobage !== undefined) {
    const max = opts.jobage
    out = out.filter((c) => c.date !== null && daysBetween(c.date, today) <= max)
  }
  return out
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  // Hangul is double-width in most terminals; slice conservatively.
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 34).padEnd(34)
    const company = (c.company || "—").slice(0, 16).padEnd(16)
    const loc = (c.location || "—").slice(0, 12).padEnd(12)
    const date = c.date || "—"
    return `${c.id.padEnd(13)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(13) + " " + "TITLE".padEnd(34) + " " + "COMPANY".padEnd(16) + " " + "LOCATION".padEnd(12) + " DATE"
  return [header, "-".repeat(header.length + 6), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const res = await htmlFetch(buildUrl(opts))
    if (!res.body) {
      writeError(`Unexpected response from search (HTTP ${res.status})`, "SEARCH_FAILED")
      return 1
    }
    let cards = applyFilters(parseJobCards(res.body), opts)
    if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (cards.length === 0
          ? "No results."
          : cards
              .map(
                (c) =>
                  `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}` +
                  `${c.deadline ? ` · 마감 ${c.deadline}` : ""}\n  id: ${c.id}\n  ${c.url}`,
              )
              .join("\n\n")) + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, page: opts.page }, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
