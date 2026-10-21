import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers"

// Live smoke test against www.jobkorea.co.kr: one search and one detail
// (3 requests total). Keep it this small - see the personal-use note.
// Opt-in (JOBKOREA_LIVE=1) so the default `bun test` run stays offline.
const live = process.env.JOBKOREA_LIVE === "1"

interface SearchOut {
  meta: { count: number; page: number; total: number | null }
  results: Array<Record<string, string | null>>
}

describe.skipIf(!live)("live", () => {
  let firstId: string | null = null

  test("search returns real results", async () => {
    const out = parseJSON<SearchOut>(await runCLI(["search", "-q", "백엔드 개발자", "--limit", "3"]))
    expect(out.meta.page).toBe(1)
    expect(out.results.length).toBeGreaterThanOrEqual(1)
    for (const r of out.results) {
      expect(r.id).toMatch(/^\d+$/)
      expect(r.title).toBeTruthy()
      expect(r.url).toStartWith("https://www.jobkorea.co.kr/Recruit/GI_Read/")
      for (const k of ["company", "location", "date"]) expect(r).toHaveProperty(k)
    }
    firstId = out.results[0].id
  })

  test("detail returns the posting", async () => {
    if (!firstId) throw new Error("search test did not yield an id")
    const d = parseJSON<Record<string, string | null>>(await runCLI(["detail", firstId]))
    expect(d.id).toBe(firstId)
    expect(d.title).toBeTruthy()
    expect(d).toHaveProperty("description")
  })
})
