import { DESCRIPTION_URL, DETAIL_URL, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const JOBKOREA_HOST = /(^|\.)jobkorea\.co\.kr$/i

/**
 * Accept a numeric posting id or a jobkorea.co.kr URL carrying one
 * (/Recruit/GI_Read/<id> or ...?Gno=<id>). URLs on any other host are
 * rejected (real URL parsing, so look-alike hosts do not slip through).
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{5,10}$/.test(trimmed)) return trimmed
  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!JOBKOREA_HOST.test(parsed.hostname)) return null
  const path = parsed.pathname.match(/\/Recruit\/GI_Read\/(\d{5,10})\/?$/i)
  if (path) return path[1]
  const gno = parsed.searchParams.get("Gno") ?? parsed.searchParams.get("gno")
  return gno && /^\d{5,10}$/.test(gno) ? gno : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a JobKorea posting id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(`${DETAIL_URL}/${id}`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const descHtml = await htmlFetch(`${DESCRIPTION_URL}?Gno=${id}`)
    const job = parseJobDetail(html, id, descHtml)
    if (!job) {
      writeError("Job not found (no posting data on the page; it may be closed or removed)", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.career ? `경력: ${job.career}` : "",
        job.education ? `학력: ${job.education}` : "",
        job.employmentType ? `고용형태: ${job.employmentType}` : "",
        job.salary ? `급여: ${job.salary}` : "",
        job.workingHours ? `근무시간: ${job.workingHours}` : "",
        job.jobCategory ? `모집분야: ${job.jobCategory}` : "",
        job.date ? `등록일: ${job.date}` : "",
        job.deadline ? `마감일: ${job.deadline}` : job.openUntilFilled ? "마감일: 상시 (채용시 마감)" : "",
        "",
        job.description || "(no description text - the posting body may be an image)",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
