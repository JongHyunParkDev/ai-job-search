import { API_BASE, fetchJson, resolveJobId, toDetail, writeError, type GhJobDetail } from "../helpers.js"

export interface DetailOpts {
  board: string
  id: string // numeric job id, a greenhouse.io job URL, or any URL with gh_jid=
  format: "json" | "plain"
}

/**
 * Fetch one job from `/v1/boards/<board>/jobs/<id>` and print it (json or plain).
 * Returns the process exit code: 1 with BAD_ID for an unparseable reference and
 * NOT_FOUND when Greenhouse answers 404.
 */
export async function runDetail(opts: DetailOpts): Promise<number> {
  const ref = resolveJobId(opts.id, opts.board)
  if ("error" in ref) {
    writeError(ref.error, "BAD_ID")
    return 1
  }
  let job: GhJobDetail | null
  try {
    job = await fetchJson<GhJobDetail>(`${API_BASE}/${encodeURIComponent(opts.board)}/jobs/${ref.id}`)
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
  if (!job) {
    writeError(`job ${ref.id} not found on board "${opts.board}"`, "NOT_FOUND")
    return 1
  }
  const d = toDetail(job, opts.board)

  if (opts.format === "plain") {
    const header = [
      d.title,
      `${d.company ?? "—"} · ${d.location ?? "—"}`,
      d.date ? `Posted: ${d.date.slice(0, 10)}` : "",
      d.deadline ? `Deadline: ${d.deadline.slice(0, 10)}` : "",
      d.departments.length ? `Departments: ${d.departments.join(", ")}` : "",
      d.offices.length ? `Offices: ${d.offices.join(", ")}` : "",
    ].filter((l) => l !== "")
    const lines = [...header, "", d.description ?? "(no description)", "", `URL: ${d.url ?? "—"}`, `id: ${d.id}`]
    process.stdout.write(lines.join("\n") + "\n")
  } else {
    process.stdout.write(JSON.stringify(d, null, 2) + "\n")
  }
  return 0
}
