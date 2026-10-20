import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers.ts"

interface SearchOut {
  meta: { count: number; page: number }
  results: { id: string; title: string; company: string | null; location: string | null; date: string | null; url: string }[]
}

describe("flag validation (offline)", () => {
  const cases: [string, string[], string][] = [
    ["unknown flag", ["search", "-q", "x", "--bogus", "1"], "UNKNOWN_FLAG"],
    ["unsupported --jobage", ["search", "-q", "x", "--jobage", "7"], "UNSUPPORTED_FLAG"],
    ["bare --query", ["search", "--query"], "BAD_ARG"],
    ["bad format", ["search", "-q", "x", "--format", "xml"], "BAD_ARG"],
    ["bad page", ["search", "-q", "x", "--page", "0"], "BAD_ARG"],
    ["bad location", ["search", "-q", "x", "-l", "Tokyo"], "BAD_LOCATION"],
    ["detail without id", ["detail"], "NO_ID"],
    ["detail foreign url", ["detail", "https://example.com/wd/1"], "BAD_ID"],
    ["unknown command", ["frobnicate"], "BAD_CMD"],
  ]
  for (const [name, args, code] of cases) {
    test(`${name} exits 1 with a JSON error on stderr`, async () => {
      const r = await runCLI(args)
      expect(r.exitCode).toBe(1)
      expect(r.stdout).toBe("")
      expect(JSON.parse(r.stderr).code).toBe(code)
    })
  }
})

// Live smoke test: one search request against wanted.co.kr.
describe("live search", () => {
  test("search returns real results in the contract shape", async () => {
    const out = parseJSON<SearchOut>(await runCLI(["search", "-q", "백엔드 개발자", "-l", "서울", "--limit", "3"]))
    expect(out.meta.page).toBe(1)
    expect(out.results.length).toBeGreaterThanOrEqual(1)
    expect(out.meta.count).toBe(out.results.length)
    for (const r of out.results) {
      expect(r.id).toMatch(/^\d+$/)
      expect(r.title.length).toBeGreaterThan(0)
      expect(r.url).toBe(`https://www.wanted.co.kr/wd/${r.id}`)
      expect(r.date).toBeNull()
      expect(r.location ?? "").toContain("서울")
    }
  })
})
