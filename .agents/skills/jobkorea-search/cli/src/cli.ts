#!/usr/bin/env bun
// Self-contained CLI for searching JobKorea (잡코리아, www.jobkorea.co.kr), the
// Korean job board. Zero runtime dependencies: plain bun + fetch + regex.
//
// Personal use only. Keep volume low; do not use it commercially or for bulk
// data collection. Run it on your own responsibility (see SKILL.md).

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-") && a.length > 1) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || (next.startsWith("-") && next.length > 1)) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `jobkorea-cli — search jobs on JobKorea (잡코리아, South Korea)

USAGE
  bun run src/cli.ts search --query "<keywords>" [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>   Keywords (Korean or English). REQUIRED. To narrow by place,
                       put the city/district in the query, e.g. "백엔드 판교".
  --jobage <days>      Posted within N days. Sorts by 등록일 and filters the page
                       client-side (JobKorea has no server-side age filter).
  --page <n>           1-indexed page (20 organic results/page). Default 1.
  --limit, -n <n>      Cap results emitted (client-side).
  --format <fmt>       json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "백엔드 개발자" --format table
  bun run src/cli.ts search -q "data analyst 서울" --jobage 7 --format table
  bun run src/cli.ts detail 50046914 --format plain

Personal use only — keep volume low.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "jobage", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function fail(error: string, code: string): number {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
  return 1
}

function parseIntFlag(name: string, raw: string | boolean | string[]): number | null {
  const val = typeof raw === "string" ? Number(raw.trim()) : NaN
  if (!Number.isInteger(val) || val < 1) {
    fail(`--${name} must be a whole number of at least 1, got "${raw}"`, "BAD_ARG")
    return null
  }
  return val
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      const hint = key === "location" || key === "l" ? " (JobKorea location filtering works through the query: add the city to --query)" : ""
      return fail(
        `unknown flag --${key} for '${cmd}' - flags are never silently ignored${hint}; see --help for the supported flags`,
        "UNKNOWN_FLAG",
      )
    }
  }

  if (cmd === "search") {
    if (typeof flags.query !== "string" || !flags.query.trim()) {
      return fail('the --query/-q flag is required and must be non-empty (e.g. -q "백엔드 개발자")', "NO_QUERY")
    }
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "table", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|table|plain, got "${fmt}"`, "BAD_ARG")
    }
    const opts: SearchOpts = { query: flags.query.trim(), page: 1, format: fmt as SearchOpts["format"] }
    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      opts.jobage = v
    }
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      opts.page = v
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      opts.limit = v
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) return fail("detail requires an <id|url>", "NO_ID")
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|plain, got "${fmt}"`, "BAD_ARG")
    }
    const opts: DetailOpts = { id, format: fmt as DetailOpts["format"] }
    return runDetail(opts)
  }

  return fail(`Unknown command "${cmd}"`, "BAD_CMD")
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n",
    )
    process.exit(1)
  })
