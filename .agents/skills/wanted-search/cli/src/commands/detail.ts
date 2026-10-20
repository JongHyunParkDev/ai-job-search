import { BASE_URL, DETAIL_PATH, apiGet, normalizeId, toDetail, writeError, type RawJob } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a Wanted job id from "${opts.id}" (expected e.g. 393427 or https://www.wanted.co.kr/wd/393427)`, "BAD_ID")
    return 1
  }
  try {
    const body = await apiGet<{ job?: RawJob }>(`${BASE_URL}${DETAIL_PATH}/${id}`)
    const job = body?.job ? toDetail(body.job) : null
    if (!job) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const exp =
        job.experienceMin === null && job.experienceMax === null
          ? null
          : job.experienceMax === null
            ? `${job.experienceMin ?? 0}+ years`
            : `${job.experienceMin ?? 0}-${job.experienceMax} years`
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.address ? `Address: ${job.address}` : "",
        job.industry ? `Industry: ${job.industry}` : "",
        exp ? `Experience: ${exp}` : "",
        `Deadline: ${job.deadline || "상시채용 (no fixed deadline)"}`,
        job.skills.length ? `Skills: ${job.skills.join(", ")}` : "",
        `Status: ${job.isActive ? "ACTIVE" : `CLOSED / ${job.status ?? "unknown"}`}`,
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l, i, arr) => l !== "" || (arr[i - 1] ?? "") !== "")
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
