#!/usr/bin/env bun
// Self-contained CLI over Greenhouse's public Job Board API (boards-api.greenhouse.io),
// which many employers use for their career sites. Country-agnostic: you pick the
// employer by its board token. No API key, zero runtime dependencies.
//
// Keep volume low: one search is one request for the whole board.

import { runSearch, DEFAULT_PAGE_SIZE, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { isValidBoard, writeError } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

const ALIAS: Record<string, string> = { q: "query", l: "location", n: "limit", b: "board" }

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-") && a.length > 1) {
      const name = a.replace(/^-+/, "")
      const key = ALIAS[name] ?? name
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

const HELP = `greenhouse-cli — search an employer's jobs via Greenhouse's public Job Board API

USAGE
  bun run src/cli.ts search --board <token> [flags]
  bun run src/cli.ts detail <id|url> --board <token> [--format json|plain]

SEARCH FLAGS
  --board, -b <token>     Required. The employer's Greenhouse board token (e.g. coupang, gitlab):
                          the <token> in boards.greenhouse.io/<token> on its careers page.
  --query, -q <text>      Title filter: every word must appear (case-insensitive).
  --location, -l <text>   Substring of the job's location name (case-insensitive).
  --jobage <days>         Published within N days (first_published, else updated_at).
  --page <n>              1-indexed page over the filtered list. Default 1.
  --limit, -n <n>         Page size. Default ${DEFAULT_PAGE_SIZE}.
  --format <fmt>          json (default) | table | plain.

DETAIL
  <id|url>                Numeric job id, a boards.greenhouse.io / job-boards.greenhouse.io
                          /<token>/jobs/<id> URL, or any careers URL with ?gh_jid=<id>.

EXAMPLES
  bun run src/cli.ts search --board coupang -q backend -l Seoul --format table
  bun run src/cli.ts search --board gitlab -q engineer -l remote --jobage 30
  bun run src/cli.ts detail "https://www.coupang.jobs/en/jobs/?gh_jid=8127146" --board coupang --format plain

All filtering and paging is client-side over one request per search. Keep volume low.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["board", "query", "location", "jobage", "page", "limit", "format", "help", "h"]),
  detail: new Set(["board", "format", "help", "h"]),
}

function fail(error: string, code: string): number {
  writeError(error, code)
  return 1
}

/** Validate --board: present (NO_BOARD) and slug-shaped (BAD_ARG). Returns the token or an exit code. */
function boardFlag(raw: Flags[string] | undefined): string | number {
  if (raw === undefined || raw === true) return fail("--board <token> is required (the employer's Greenhouse board token, e.g. coupang)", "NO_BOARD")
  if (typeof raw !== "string" || !isValidBoard(raw.trim())) {
    return fail(`--board must be a Greenhouse board token (letters, digits, - or _), got "${raw}"`, "BAD_ARG")
  }
  return raw.trim()
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
    return fail(`unknown flag --${key} for '${cmd}' - flags are never silently ignored; see --help for the supported flags`, "UNKNOWN_FLAG")
  }

  if (cmd === "search") {
    for (const name of ["query", "location"]) {
      const v = flags[name]
      if (v !== undefined && (typeof v !== "string" || !v.trim())) return fail(`--${name} requires a non-empty value`, "BAD_ARG")
    }
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "table", "plain"].includes(fmt)) return fail(`--format must be one of json|table|plain, got "${fmt}"`, "BAD_ARG")
    const ints: Record<string, number | undefined> = {}
    for (const name of ["jobage", "page", "limit"]) {
      const raw = flags[name]
      if (raw === undefined) continue
      const val = typeof raw === "string" ? Number(raw.trim()) : NaN
      if (!Number.isInteger(val) || val < 1) return fail(`--${name} must be a whole number of at least 1, got "${raw}"`, "BAD_ARG")
      ints[name] = val
    }
    const board = boardFlag(flags.board)
    if (typeof board === "number") return board
    const opts: SearchOpts = {
      board,
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
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
  if (!["json", "plain"].includes(fmt)) return fail(`--format must be one of json|plain, got "${fmt}"`, "BAD_ARG")
  const board = boardFlag(flags.board)
  if (typeof board === "number") return board
  const opts: DetailOpts = { board, id, format: fmt as DetailOpts["format"] }
  return runDetail(opts)
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    writeError(e instanceof Error ? e.message : String(e), "INTERNAL_ERROR")
    process.exit(1)
  })
