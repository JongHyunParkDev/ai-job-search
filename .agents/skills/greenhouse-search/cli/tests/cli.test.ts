// Offline: every case here fails validation before any request is made.
import { describe, expect, test } from "bun:test"
import { runCLI } from "./helpers"

async function expectError(args: string[], code: string) {
  const r = await runCLI(args)
  expect(r.exitCode).toBe(1)
  expect(r.stdout).toBe("")
  const err = JSON.parse(r.stderr) as { error: string; code: string }
  expect(err.code).toBe(code)
  expect(err.error).toBeTruthy()
}

describe("flag validation", () => {
  test("search without --board -> NO_BOARD", () => expectError(["search", "-q", "backend"], "NO_BOARD"))
  test("bare --board -> NO_BOARD", () => expectError(["search", "--board"], "NO_BOARD"))
  test("malformed board token -> BAD_ARG", () => expectError(["search", "--board", "../embed"], "BAD_ARG"))
  test("unknown flag -> UNKNOWN_FLAG", () => expectError(["search", "--board", "coupang", "--bogus", "x"], "UNKNOWN_FLAG"))
  test("bad format -> BAD_ARG", () => expectError(["search", "--board", "coupang", "--format", "xml"], "BAD_ARG"))
  test("jobage 0 -> BAD_ARG", () => expectError(["search", "--board", "coupang", "--jobage", "0"], "BAD_ARG"))
  test("fractional page -> BAD_ARG", () => expectError(["search", "--board", "coupang", "--page", "1.5"], "BAD_ARG"))
  test("empty --query -> BAD_ARG", () => expectError(["search", "--board", "coupang", "-q"], "BAD_ARG"))
  test("empty --location -> BAD_ARG", () => expectError(["search", "--board", "coupang", "-l", "   "], "BAD_ARG"))
  test("unknown command -> BAD_CMD", () => expectError(["list"], "BAD_CMD"))
  test("detail without id -> NO_ID", () => expectError(["detail", "--board", "coupang"], "NO_ID"))
  test("detail without --board -> NO_BOARD", () => expectError(["detail", "8127146"], "NO_BOARD"))
  test("detail table format -> BAD_ARG", () => expectError(["detail", "1", "--board", "coupang", "--format", "table"], "BAD_ARG"))
  test("detail with a non-Greenhouse URL lacking gh_jid -> BAD_ID", () =>
    expectError(["detail", "https://www.coupang.jobs/en/jobs/8127146", "--board", "coupang"], "BAD_ID"))
  test("detail with a URL for another board -> BAD_ID", () =>
    expectError(["detail", "https://boards.greenhouse.io/gitlab/jobs/1", "--board", "coupang"], "BAD_ID"))

  test("search --help prints usage and exits 0", async () => {
    const r = await runCLI(["search", "--help"])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("--board")
  })
})
