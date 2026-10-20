import {
  PAGE_SIZE,
  SEARCH_URL,
  httpFetch,
  kstCutoff,
  matchesTerms,
  parseSearchResponse,
  planQuery,
  writeError,
  type JobCard,
  type QueryPlan,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  cities?: number[]
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildUrl(plan: QueryPlan, opts: SearchOpts): string {
  const params = new URLSearchParams()
  // Comma-joined, exactly as the site's own client serialises its filters.
  params.set("occupation_level1", plan.level1.join(","))
  params.set("occupation_level2", plan.level2.join(","))
  params.set("city", (opts.cities ?? []).join(","))
  params.set("order_by", "recent")
  params.set("page", String(opts.page))
  params.set("page_size", String(PAGE_SIZE))
  return `${SEARCH_URL}?${params.toString()}`
}

function cut(s: string, n: number): string {
  // Hangul renders double-width in most terminals; count it as 2 columns.
  let out = ""
  let w = 0
  for (const ch of s) {
    const cw = /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 2 : 1
    if (w + cw > n) break
    out += ch
    w += cw
  }
  return out + " ".repeat(Math.max(0, n - w))
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const header = `${"ID".padEnd(8)} ${cut("TITLE", 44)} ${cut("COMPANY", 24)} ${cut("LOCATION", 10)} ${"RATING".padEnd(6)} DATE`
  const rows = cards.map(
    (c) =>
      `${c.id.padEnd(8)} ${cut(c.title, 44)} ${cut(c.company || "—", 24)} ${cut(c.location || "—", 10)} ${(
        c.rating !== null ? c.rating.toFixed(1) : "—"
      ).padEnd(6)} ${c.date || "—"}`,
  )
  return [header, "-".repeat(110), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const plan = planQuery(opts.query)
    const body = await httpFetch(buildUrl(plan, opts), "application/json")
    if (!body) {
      writeError("JobPlanet postings API returned 404", "NOT_FOUND")
      return 1
    }
    const { total, cards: all } = parseSearchResponse(body)
    let cards = all
    if (plan.mode === "text") cards = cards.filter((c) => matchesTerms(c, plan.terms))
    if (opts.jobage !== undefined) {
      const cutoff = kstCutoff(opts.jobage)
      cards = cards.filter((c) => c.date !== null && c.date >= cutoff)
    }
    if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (cards.length
          ? cards
              .map(
                (c) =>
                  `${c.title}\n  ${c.company || "—"}${c.rating !== null ? ` (★${c.rating.toFixed(1)})` : ""} · ${
                    c.location || "—"
                  } · ${c.date || "—"}${c.deadline ? ` ~ ${c.deadline}` : ""}\n  id: ${c.id}\n  ${c.url}`,
              )
              .join("\n\n")
          : "No results.") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              page: opts.page,
              total,
              queryMode: plan.mode,
              occupations: plan.labels,
            },
            results: cards,
          },
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
