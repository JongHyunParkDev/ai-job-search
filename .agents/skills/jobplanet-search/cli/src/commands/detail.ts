import { httpFetch, parseJobDetail, postingUrl, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const JOBPLANET_HOST = /(^|\.)jobplanet\.co\.kr$/i

/**
 * Accept a numeric posting id, or a jobplanet.co.kr URL carrying it:
 *   https://www.jobplanet.co.kr/job/search?posting_ids[]=1755787  (also %5B%5D-encoded)
 *   https://www.jobplanet.co.kr/companies/311294/job_postings/1755787/...
 *   https://b.jobplanet.co.kr/job-postings-1755787                 (share link)
 * URLs on any other host are rejected.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{3,}$/.test(trimmed)) return trimmed
  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return null
  let u: URL
  try {
    u = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!JOBPLANET_HOST.test(u.hostname)) return null
  const qp = u.searchParams.get("posting_ids[]") ?? u.searchParams.get("posting_id")
  if (qp && /^\d+$/.test(qp)) return qp
  const m =
    u.pathname.match(/\/job_postings\/(\d+)/) ??
    u.pathname.match(/\/job-postings-(\d+)\/?$/) ??
    u.pathname.match(/\/job\/(\d+)\/?$/)
  return m ? m[1] : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a JobPlanet posting id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await httpFetch(postingUrl(id), "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
    const job = html ? parseJobDetail(html, id) : null
    if (!job) {
      writeError(`Posting ${id} not found (expired, removed, or page markup changed)`, "NOT_FOUND")
      return 1
    }
    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"}${job.rating !== null ? ` · 기업평점 ★${job.rating.toFixed(1)} (${job.ratingCount ?? 0} reviews)` : ""}`,
        `${job.location || "—"}${job.address ? ` · ${job.address}` : ""}`,
        "",
        job.jobType ? `Employment: ${job.jobType}` : "",
        job.experience ? `Experience: ${job.experience}` : "",
        job.education ? `Education: ${job.education}` : "",
        job.occupations.length ? `Occupations: ${job.occupations.join(", ")}` : "",
        job.skills.length ? `Skills: ${job.skills.join(", ")}` : "",
        `Posted: ${job.date || "—"}  Deadline: ${job.deadline || "—"}`,
        `Status: ${job.isActive === false ? "CLOSED / EXPIRED" : job.isActive ? "ACTIVE" : "UNKNOWN"}`,
        "",
        job.description || "(no description on JobPlanet - the posting body may only be on the apply page)",
        "",
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
        `URL: ${job.url}`,
      ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
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
