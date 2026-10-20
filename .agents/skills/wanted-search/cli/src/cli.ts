#!/usr/bin/env bun
// Self-contained CLI for searching job postings on Wanted (원티드, wanted.co.kr),
// South Korea, through the public JSON API its website uses. No external CLI
// framework and zero runtime dependencies: it runs anywhere `bun` is available.
//
// Personal use only. Keep volume low; do not use it commercially or for bulk
// data collection. Run it on your own responsibility (see SKILL.md).

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { toLocationKey } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
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

const HELP = `wanted-cli — search job postings on Wanted (원티드, wanted.co.kr), South Korea

USAGE
  bun run src/cli.ts search [-q "<keywords>"] [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, company), Korean or English.
                          Omit to browse the latest postings.
  --location, -l <list>   Region(s), comma-separated: 서울, 경기, 부산, 대전, ...
                          or Wanted keys such as "seoul" or district keys such as
                          "seoul.gangnam-gu". Default: all of Korea.
  --years <n>             Experience in years (0 = 신입/new grad). Keeps postings
                          whose required-experience range includes n.
  --page <n>              1-indexed page (20 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side, max 20 per page).
  --format <fmt>          json (default) | table | plain.

  --jobage is NOT supported: Wanted's API exposes no posting date. Results are
  sorted newest first; use --page / --limit to bound recency.

EXAMPLES
  bun run src/cli.ts search -q "백엔드 개발자" -l 서울 --format table
  bun run src/cli.ts search -q "데이터 엔지니어" -l seoul.gangnam-gu --years 3 --format table
  bun run src/cli.ts search -q "프론트엔드" -l 경기,서울 --limit 10
  bun run src/cli.ts detail 393427 --format plain

Personal use only — keep volume low.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "years", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function fail(error: string, code: string): number {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
  return 1
}

/** Whole number >= min, or null (after writing the error). */
function intFlag(name: string, raw: string | boolean | string[], min: number): number | null {
  const val = typeof raw === "string" ? Number(raw.trim()) : NaN
  if (!Number.isInteger(val) || val < min) {
    fail(`--${name} must be a whole number of at least ${min}, got "${raw}"`, "BAD_ARG")
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
      if (key === "jobage" && cmd === "search") {
        return fail(
          "--jobage is not supported: the Wanted API exposes no posting date. Results are sorted newest first; bound them with --page/--limit instead",
          "UNSUPPORTED_FLAG",
        )
      }
      return fail(
        `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
        "UNKNOWN_FLAG",
      )
    }
  }

  if (cmd === "search") {
    if (flags.query !== undefined && (typeof flags.query !== "string" || !flags.query.trim())) {
      return fail("--query requires a non-empty value", "BAD_ARG")
    }
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "table", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|table|plain, got "${fmt}"`, "BAD_ARG")
    }

    const locations: string[] = []
    if (flags.location !== undefined) {
      if (typeof flags.location !== "string" || !flags.location.trim()) {
        return fail("--location requires a value (e.g. 서울, 경기, seoul.gangnam-gu)", "BAD_ARG")
      }
      for (const part of flags.location.split(",")) {
        if (!part.trim()) continue
        const key = toLocationKey(part)
        if (!key) {
          return fail(
            `unknown location "${part.trim()}" - use a region name (서울, 경기, 부산, 대전, ...) or a Wanted key such as "seoul" or "seoul.gangnam-gu"`,
            "BAD_LOCATION",
          )
        }
        if (!locations.includes(key)) locations.push(key)
      }
    }

    let years: number | undefined
    if (flags.years !== undefined) {
      const v = intFlag("years", flags.years, 0)
      if (v === null) return 1
      years = v
    }
    let page = 1
    if (flags.page !== undefined) {
      const v = intFlag("page", flags.page, 1)
      if (v === null) return 1
      page = v
    }
    let limit: number | undefined
    if (flags.limit !== undefined) {
      const v = intFlag("limit", flags.limit, 1)
      if (v === null) return 1
      limit = v
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query.trim() : undefined,
      locations,
      years,
      page,
      limit,
      format: fmt as SearchOpts["format"],
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
