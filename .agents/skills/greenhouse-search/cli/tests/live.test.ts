// Live smoke test against boards-api.greenhouse.io. Opt-in only (GREENHOUSE_LIVE=1)
// so a plain `bun test` stays offline and makes no requests.
import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers"

const live = process.env.GREENHOUSE_LIVE === "1"

describe.skipIf(!live)("live search", () => {
  test("search --board coupang -l Seoul returns results with id/title/url", async () => {
    const out = parseJSON<{
      meta: { count: number; total: number; board: string }
      results: { id: string; title: string; url: string; location: string; company: string }[]
    }>(await runCLI(["search", "--board", "coupang", "-l", "Seoul", "--limit", "5"]))
    expect(out.meta.board).toBe("coupang")
    expect(out.results.length).toBeGreaterThan(0)
    for (const r of out.results) {
      expect(r.id).toMatch(/^\d+$/)
      expect(r.title).toBeTruthy()
      expect(r.url).toStartWith("https://")
      expect(r.location.toLowerCase()).toContain("seoul")
      expect(r.company).toBeTruthy()
    }
  })
})
