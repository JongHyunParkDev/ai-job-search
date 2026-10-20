#!/usr/bin/env bun
// Self-contained CLI for searching job postings on JobPlanet (잡플래닛, South Korea).
// No external CLI framework and zero runtime dependencies - runs anywhere `bun` is.
//
// Personal use only. Keep volume low; do not use it commercially or for bulk data
// collection. Run it on your own responsibility.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { CITY_NAMES, resolveCities, writeError } from "./helpers.js"

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

const HELP = `jobplanet-cli — search job postings on JobPlanet (잡플래닛, South Korea)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Role or keyword. If it names a JobPlanet category (e.g. "백엔드",
                          "데이터", "UI/UX") it is applied server-side as a category filter;
                          otherwise it filters the fetched page by title/company/skills.
  --location, -l <city>   Region(s), comma-separated: ${CITY_NAMES.join(", ")}
                          (English also accepted: Seoul, Busan, Gyeonggi, ...).
  --jobage <days>         Posted within N days (client-side, by posting start date).
  --page <n>              1-indexed page (50 postings/page, newest first). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "백엔드" -l 서울 --format table
  bun run src/cli.ts search -q "데이터" -l "서울,경기" --jobage 7
  bun run src/cli.ts search -q "Java" -l 경기 --format table
  bun run src/cli.ts detail 1755787 --format plain

Personal use only — keep volume low.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "jobage", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function fail(error: string, code: string): number {
  writeError(error, code)
  return 1
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  const knownFlags = KNOWN_FLAGS[cmd]
  if (!knownFlags) return fail(`Unknown command "${cmd}"`, "BAD_CMD")
  for (const key of Object.keys(flags)) {
    if (key === "_" || knownFlags.has(key)) continue
    return fail(
      `unknown flag --${key} for '${cmd}' - flags are never silently ignored; see --help for the supported flags`,
      "UNKNOWN_FLAG",
    )
  }

  if (cmd === "search") {
    if (flags.query !== undefined && (typeof flags.query !== "string" || !flags.query.trim())) {
      return fail("--query requires a non-empty value", "BAD_ARG")
    }
    let cities: number[] | undefined
    if (flags.location !== undefined) {
      if (typeof flags.location !== "string" || !flags.location.trim()) {
        return fail("--location requires a non-empty value", "BAD_ARG")
      }
      const resolved = resolveCities(flags.location)
      if (!resolved) {
        return fail(
          `unknown --location "${flags.location}" - JobPlanet filters by region only; use one or more of: ${CITY_NAMES.join(", ")}`,
          "BAD_ARG",
        )
      }
      cities = resolved
    }
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "table", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|table|plain, got "${fmt}"`, "BAD_ARG")
    }
    const ints: Record<string, number | undefined> = {}
    for (const name of ["jobage", "page", "limit"]) {
      const raw = flags[name]
      if (raw === undefined) continue
      const val = typeof raw === "string" ? Number(raw.trim()) : NaN
      if (!Number.isInteger(val) || val < 1) {
        return fail(`--${name} must be a whole number of at least 1, got "${raw}"`, "BAD_ARG")
      }
      ints[name] = val
    }
    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      cities,
      jobage: ints.jobage,
      page: ints.page ?? 1,
      limit: ints.limit,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  // detail
  const id = (flags._ as string[])[1]
  if (!id) return fail("detail requires an <id|url>", "NO_ID")
  const fmt = flags.format !== undefined ? String(flags.format) : "json"
  if (!["json", "plain"].includes(fmt)) {
    return fail(`--format must be one of json|plain, got "${fmt}"`, "BAD_ARG")
  }
  const opts: DetailOpts = { id, format: fmt as DetailOpts["format"] }
  return runDetail(opts)
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    writeError(e instanceof Error ? e.message : String(e), "INTERNAL_ERROR")
    process.exit(1)
  })
