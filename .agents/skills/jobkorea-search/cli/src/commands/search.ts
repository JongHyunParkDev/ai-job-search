import { SEARCH_URL, htmlFetch, parseSearchPage, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

/**
 * JobKorea has no posted-within URL filter that the server-rendered page
 * honours, so --jobage switches the sort to 등록일순 (ord=RegDtDesc, newest
 * first) and drops postings older than N days client-side.
 */
export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  params.set("stext", opts.query)
  params.set("tabType", "recruit")
  if (opts.jobage !== undefined) params.set("ord", "RegDtDesc")
  params.set("Page_No", String(opts.page))
  return `${SEARCH_URL}?${params.toString()}`
}

export function withinDays(card: JobCard, days: number, now = Date.now()): boolean {
  if (!card.date) return false
  const t = Date.parse(card.date)
  if (Number.isNaN(t)) return false
  return now - t <= days * 86400000
}

function short(date: string | null): string {
  return date ? date.slice(0, 10) : "—"
}

function deadlineText(c: JobCard): string {
  return c.openUntilFilled ? "상시" : short(c.deadline)
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const header = ["ID".padEnd(9), "TITLE".padEnd(40), "COMPANY".padEnd(20), "LOCATION".padEnd(18), "CAREER".padEnd(12), "POSTED".padEnd(10), "DEADLINE"].join(" ")
  const rows = cards.map((c) =>
    [
      c.id.padEnd(9),
      c.title.slice(0, 40).padEnd(40),
      (c.company || "—").slice(0, 20).padEnd(20),
      (c.location || "—").slice(0, 18).padEnd(18),
      (c.career || "—").slice(0, 12).padEnd(12),
      short(c.date).padEnd(10),
      deadlineText(c),
    ].join(" "),
  )
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    if (!html) {
      writeError("Search page not found", "NOT_FOUND")
      return 1
    }
    const page = parseSearchPage(html)
    let cards = page.cards
    if (opts.jobage !== undefined) cards = cards.filter((c) => withinDays(c, opts.jobage as number))
    if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.career || "—"} · ${c.education || "—"}\n  posted ${short(c.date)} · deadline ${deadlineText(c)}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, page: opts.page, total: page.total }, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
