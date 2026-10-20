import { afterEach, describe, expect, test } from "bun:test"
import { htmlFetch } from "../src/helpers"
import { runCLI } from "./helpers"

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout

afterEach(() => {
  globalThis.fetch = originalFetch
  globalThis.setTimeout = originalSetTimeout
})

function instantTimers() {
  globalThis.setTimeout = ((fn: () => void) => originalSetTimeout(fn, 0)) as unknown as typeof setTimeout
}

function stubFetch(responses: Array<() => Response>): { calls: number; init: RequestInit[] } {
  const state = { calls: 0, init: [] as RequestInit[] }
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const i = Math.min(state.calls, responses.length - 1)
    state.calls++
    state.init.push(init)
    return responses[i]()
  }) as unknown as typeof fetch
  return state
}

describe("htmlFetch", () => {
  test("sends the honest UA and a timeout signal", async () => {
    const state = stubFetch([() => new Response("ok")])
    await htmlFetch("https://www.jobkorea.co.kr/x")
    const headers = state.init[0].headers as Record<string, string>
    expect(headers["User-Agent"]).toBe("Mozilla/5.0 (compatible; jobkorea-cli/1.0)")
    expect(state.init[0].signal).toBeDefined()
  })

  test("retries 429 then succeeds", async () => {
    instantTimers()
    const state = stubFetch([() => new Response("", { status: 429 }), () => new Response("ok")])
    expect(await htmlFetch("https://www.jobkorea.co.kr/x")).toBe("ok")
    expect(state.calls).toBe(2)
  })

  test("404 returns empty string without retrying", async () => {
    const state = stubFetch([() => new Response("", { status: 404 })])
    expect(await htmlFetch("https://www.jobkorea.co.kr/x")).toBe("")
    expect(state.calls).toBe(1)
  })

  test("gives up after 1 + 6 attempts on persistent 5xx", async () => {
    instantTimers()
    const state = stubFetch([() => new Response("", { status: 503 })])
    await expect(htmlFetch("https://www.jobkorea.co.kr/x")).rejects.toThrow(/503/)
    expect(state.calls).toBe(7)
  })
})

describe("CLI argument validation (no network)", () => {
  const expectJsonError = (r: { exitCode: number; stdout: string; stderr: string }, code: string) => {
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    const err = JSON.parse(r.stderr)
    expect(err.code).toBe(code)
    expect(typeof err.error).toBe("string")
  }

  test("missing --query", async () => expectJsonError(await runCLI(["search"]), "NO_QUERY"))
  test("empty --query", async () => expectJsonError(await runCLI(["search", "-q", ""]), "NO_QUERY"))
  test("bogus flag", async () => expectJsonError(await runCLI(["search", "-q", "x", "--bogus", "1"]), "UNKNOWN_FLAG"))
  test("--location is rejected with a hint", async () => {
    const r = await runCLI(["search", "-q", "x", "--location", "서울"])
    expectJsonError(r, "UNKNOWN_FLAG")
    expect(r.stderr).toContain("--query")
  })
  test("bad --jobage", async () => expectJsonError(await runCLI(["search", "-q", "x", "--jobage", "0.5"]), "BAD_ARG"))
  test("bad --page", async () => expectJsonError(await runCLI(["search", "-q", "x", "--page", "0"]), "BAD_ARG"))
  test("bad --format", async () => expectJsonError(await runCLI(["search", "-q", "x", "--format", "xml"]), "BAD_ARG"))
  test("detail without id", async () => expectJsonError(await runCLI(["detail"]), "NO_ID"))
  test("detail with foreign url", async () =>
    expectJsonError(await runCLI(["detail", "https://example.com/Recruit/GI_Read/50046914"]), "BAD_ID"))
  test("unknown command", async () => expectJsonError(await runCLI(["frobnicate"]), "BAD_CMD"))
})
