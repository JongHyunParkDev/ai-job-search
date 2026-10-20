import {
  VIEW_URL,
  VIEW_DETAIL_URL,
  htmlFetch,
  parseDescription,
  parseViewMeta,
  postingUrl,
  writeError,
  type JobDetail,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const SARAMIN_HOST = /(^|\.)saramin\.co\.kr$/i

/**
 * Accept a raw rec_idx (e.g. 55210151) or a saramin.co.kr URL carrying it as a
 * `rec_idx` query parameter or a `/rec_idx/<n>` path segment. URLs on any
 * other host are rejected (parsed with URL, so look-alike hosts fail too).
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{5,}$/.test(trimmed)) return trimmed

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!SARAMIN_HOST.test(parsed.hostname)) return null
  const q = parsed.searchParams.get("rec_idx")
  if (q && /^\d{5,}$/.test(q)) return q
  const p = parsed.pathname.match(/\/rec_idx\/(\d{5,})(?:\/|$)/)
  return p ? p[1] : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a Saramin rec_idx from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const viewHtml = await htmlFetch(`${VIEW_URL}?rec_idx=${id}`)
    const meta = viewHtml ? parseViewMeta(viewHtml) : null
    if (!meta) {
      writeError(`Job ${id} not found (removed, closed, or not public)`, "NOT_FOUND")
      return 1
    }
    const bodyHtml = await htmlFetch(`${VIEW_DETAIL_URL}?rec_idx=${id}&rec_seq=0`)
    const { text, images } = bodyHtml ? parseDescription(bodyHtml) : { text: null, images: 0 }

    const job: JobDetail = {
      id,
      title: meta.title,
      company: meta.company,
      location: null,
      date: null,
      url: postingUrl(id),
      career: meta.career,
      education: meta.education,
      salary: meta.salary,
      deadlineDate: meta.deadlineDate,
      homepage: meta.homepage,
      description: text,
      descriptionImageCount: images,
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        job.company || "—",
        "",
        job.career ? `경력 (Experience): ${job.career}` : "",
        job.education ? `학력 (Education): ${job.education}` : "",
        job.salary ? `급여 (Salary): ${job.salary}` : "",
        job.deadlineDate ? `마감일 (Deadline): ${job.deadlineDate}` : "",
        job.homepage ? `홈페이지 (Homepage): ${job.homepage}` : "",
        "",
        job.description || "(no text description)",
        images > 0 ? `\n[${images} image(s) in the posting body - open the URL to see them]` : "",
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
