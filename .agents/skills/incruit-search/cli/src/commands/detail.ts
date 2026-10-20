import { DETAIL_URL, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const INCRUIT_HOST = /(^|\.)incruit\.com$/i

/**
 * Accept a raw 13-digit posting ID or an incruit.com URL carrying `job=<id>`
 * (e.g. https://job.incruit.com/jobdb_info/jobpost.asp?job=2610110000086).
 * URLs on any other host are rejected; the host is read via real URL parsing
 * so look-alikes (incruit.com.evil.io, incruit.com@evil.io) are rejected too.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{10,16}$/.test(trimmed)) return trimmed

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!INCRUIT_HOST.test(parsed.hostname)) return null
    const job = parsed.searchParams.get("job")
    return job && /^\d{10,16}$/.test(job) ? job : null
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse an Incruit job ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const res = await htmlFetch(`${DETAIL_URL}?job=${id}`)
    // A missing/removed posting answers 302 -> a list page (from=jobpostnone).
    if (!res.body) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(res.body, id)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.employmentType ? `고용형태: ${job.employmentType}` : "",
        job.experience ? `경력: ${job.experience}` : "",
        job.education ? `학력: ${job.education}` : "",
        job.salary ? `급여: ${job.salary}` : "",
        job.date ? `등록일: ${job.date}` : "",
        job.deadline ? `마감: ${job.deadline}` : "",
        `Status: ${job.isActive ? "ACTIVE" : "CLOSED / EXPIRED"}`,
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
      process.stdout.write(lines.join("\n").trim() + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
