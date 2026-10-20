#!/usr/bin/env bun
// Self-contained CLI for searching job postings on Saramin (사람인,
// https://www.saramin.co.kr), South Korea's large general job board. Reads the
// public, server-rendered search and posting pages - no login, no API key,
// zero runtime dependencies.
//
// Personal use only. Saramin's terms forbid copying/redistributing site
// information without consent and any commercial use of it; keep volume low,
// use it for your own job search, and run it on your own responsibility.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { resolveLocation } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
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

const HELP = `saramin-cli — search job postings on Saramin (사람인, South Korea)

USAGE
  bun run src/cli.ts search --query "<keywords>" [flags]
  bun run src/cli.ts detail <rec_idx|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, company). REQUIRED. Korean or English,
                          e.g. "백엔드", "데이터 엔지니어", "React".
  --location, -l <place>  Region: 서울, 경기, 부산, 대구, 인천, 대전, 광주, 울산, 세종, 제주, ...
                          or a district/hub: 판교, 성남, 분당, 강남, 송파, 수원, 해운대, 송도, ...
                          English romanizations (Seoul, Busan, Pangyo) and raw 6-digit Saramin
                          region codes also work. Comma-separate several: "서울,판교".
  --jobage <days>         Only postings registered/modified within N days (client-side filter
                          on the current page; results are sorted newest-first when set).
  --page <n>              1-indexed page (40 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "백엔드 개발자" -l 서울 --format table
  bun run src/cli.ts search -q "프론트엔드" -l 판교 --jobage 7 --format table
  bun run src/cli.ts search -q "data engineer" -l Busan --limit 10
  bun run src/cli.ts detail 55210151 --format plain

Personal use only — Saramin's terms forbid redistribution and commercial use; keep volume low.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "jobage", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function fail(error: string, code: string): number {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
  return 1
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  // Unknown flags are rejected, never silently dropped: a discarded filter
  // changes what the search returns with no error.
  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      return fail(
        `unknown flag --${key} for '${cmd}' - flags are never silently ignored; see --help for the supported flags`,
        "UNKNOWN_FLAG",
      )
    }
  }

  if (cmd === "search") {
    if (typeof flags.query !== "string" || !flags.query.trim()) {
      return fail('the --query/-q flag is required and needs a non-empty value (e.g. -q "백엔드")', "NO_QUERY")
    }
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "table", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|table|plain, got "${fmt}"`, "BAD_ARG")
    }

    let locMcd: string[] | undefined
    let locCd: string[] | undefined
    if (flags.location !== undefined) {
      if (typeof flags.location !== "string" || !flags.location.trim()) {
        return fail("--location requires a non-empty value", "BAD_ARG")
      }
      const loc = resolveLocation(flags.location)
      if ("unknown" in loc) {
        return fail(
          `unknown location "${loc.unknown}" - use a region (서울, 경기, 부산, ...), a supported district (판교, 강남, 해운대, ...), a 6-digit Saramin region code, or put the place in --query instead`,
          "BAD_LOCATION",
        )
      }
      locMcd = loc.mcd
      locCd = loc.cd
    }

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = typeof raw === "string" ? Number(raw.trim()) : NaN
      if (!Number.isInteger(val) || val < 1) {
        fail(`--${name} must be a whole number of at least 1, got "${raw}"`, "BAD_ARG")
        return null
      }
      return val
    }

    let jobage: number | undefined
    let page = 1
    let limit: number | undefined
    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      jobage = v
    }
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      page = v
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      limit = v
    }

    const opts: SearchOpts = {
      query: flags.query.trim(),
      locMcd,
      locCd,
      jobage,
      page,
      limit,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) return fail("detail requires a <rec_idx|url>", "NO_ID")
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
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
