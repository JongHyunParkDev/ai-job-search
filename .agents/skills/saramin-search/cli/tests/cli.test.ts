import { afterEach, describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers"
import { htmlFetch } from "../src/helpers"

interface SearchOut {
  meta: { count: number; page: number }
  results: { id: string; title: string; company: string | null; location: string | null; date: string | null; url: string }[]
}

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("argument validation (no network)", () => {
  test("bogus flag exits 1 with JSON error on stderr", async () => {
    const r = await runCLI(["search", "-q", "백엔드", "--bogus", "1"])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    expect(JSON.parse(r.stderr).code).toBe("UNKNOWN_FLAG")
  })
  test("missing --query exits 1", async () => {
    const r = await runCLI(["search", "-l", "서울"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_QUERY")
  })
  test("unknown location exits 1", async () => {
    const r = await runCLI(["search", "-q", "백엔드", "-l", "Atlantis"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_LOCATION")
  })
  test("non-integer --jobage exits 1", async () => {
    const r = await runCLI(["search", "-q", "백엔드", "--jobage", "0.5"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })
  test("detail without id exits 1", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_ID")
  })
  test("detail with a foreign URL exits 1", async () => {
    const r = await runCLI(["detail", "https://example.com/?rec_idx=55210151"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ID")
  })
})

describe("htmlFetch", () => {
  test("retries a 503 and sends the honest User-Agent", async () => {
    let calls = 0
    let ua = ""
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls++
      ua = new Headers(init?.headers).get("User-Agent") ?? ""
      return calls === 1 ? new Response("", { status: 503 }) : new Response("ok")
    }) as typeof fetch
    expect(await htmlFetch("https://www.saramin.co.kr/x")).toBe("ok")
    expect(calls).toBe(2)
    expect(ua).toBe("Mozilla/5.0 (compatible; saramin-cli/1.0)")
  })
  test("404 returns empty string", async () => {
    globalThis.fetch = (async () => new Response("", { status: 404 })) as typeof fetch
    expect(await htmlFetch("https://www.saramin.co.kr/x")).toBe("")
  })
})

describe("live smoke test (1 request)", () => {
  test("search returns real results", async () => {
    const r = await runCLI(["search", "-q", "백엔드", "-l", "서울", "--limit", "3"])
    const out = parseJSON<SearchOut>(r)
    expect(out.meta.page).toBe(1)
    expect(out.results.length).toBeGreaterThanOrEqual(1)
    for (const job of out.results) {
      expect(job.id).toMatch(/^\d+$/)
      expect(job.title.length).toBeGreaterThan(0)
      expect(job.url).toStartWith("https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=")
      expect("company" in job && "location" in job && "date" in job).toBe(true)
    }
  })
})
