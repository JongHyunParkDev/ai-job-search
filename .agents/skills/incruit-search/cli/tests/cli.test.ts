import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers.ts"

interface SearchOut {
  meta: { count: number; page: number }
  results: { id: string; title: string; company: string | null; location: string | null; date: string | null; url: string }[]
}

describe("argument validation (offline)", () => {
  test("unknown flag exits 1 with JSON error on stderr", async () => {
    const r = await runCLI(["search", "-q", "java", "--bogus", "1"])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    expect(JSON.parse(r.stderr).code).toBe("UNKNOWN_FLAG")
  })
  test("missing --query exits 1", async () => {
    const r = await runCLI(["search"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_QUERY")
  })
  test("bad --page exits 1", async () => {
    const r = await runCLI(["search", "-q", "java", "--page", "0"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })
  test("detail without id / with foreign URL exits 1", async () => {
    const a = await runCLI(["detail"])
    expect(a.exitCode).toBe(1)
    expect(JSON.parse(a.stderr).code).toBe("NO_ID")
    const b = await runCLI(["detail", "https://example.com/?job=2610110000086"])
    expect(b.exitCode).toBe(1)
    expect(JSON.parse(b.stderr).code).toBe("BAD_ID")
  })
})

// One live search + one live detail: keep request volume low.
// Opt-in (INCRUIT_LIVE=1) so the default `bun test` run stays offline.
const live = process.env.INCRUIT_LIVE === "1"

describe.skipIf(!live)("live smoke test", () => {
  test("search returns real results and detail parses one of them", async () => {
    const out = parseJSON<SearchOut>(await runCLI(["search", "-q", "백엔드 개발자", "--limit", "3"]))
    expect(out.meta.page).toBe(1)
    expect(out.results.length).toBeGreaterThanOrEqual(1)
    for (const r of out.results) {
      expect(r.id).toMatch(/^\d{13}$/)
      expect(r.title.length).toBeGreaterThan(0)
      expect(r.url).toStartWith("https://job.incruit.com/jobdb_info/jobpost.asp?job=")
      expect(r).toHaveProperty("company")
      expect(r).toHaveProperty("location")
      expect(r).toHaveProperty("date")
    }
    const detail = parseJSON<{ id: string; title: string }>(await runCLI(["detail", out.results[0].id]))
    expect(detail.id).toBe(out.results[0].id)
    expect(detail.title.length).toBeGreaterThan(0)
  })
})
