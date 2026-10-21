import { describe, expect, test } from "bun:test"
import { join } from "path"
import {
  decodeEntities,
  fetchJson,
  filterJobs,
  htmlToText,
  isValidBoard,
  resolveJobId,
  toDetail,
  toResult,
  type GhJobDetail,
  type GhList,
} from "../src/helpers"

const fixture = async <T>(name: string): Promise<T> => JSON.parse(await Bun.file(join(import.meta.dir, "fixtures", name)).text()) as T

describe("toResult", () => {
  test("maps the contract fields and drops metadata", async () => {
    const list = await fixture<GhList>("list.json")
    const r = toResult(list.jobs![0], "examplecorp")
    expect(r).toMatchObject({
      id: "1000001",
      title: "Staff Backend Engineer (Payments)",
      company: "Examplecorp",
      location: "Seoul, South Korea",
      date: "2026-10-10T09:00:00-04:00",
      url: "https://www.example-careers.test/jobs/?gh_jid=1000001",
      updatedAt: "2026-10-14T19:45:11-04:00",
      requisitionId: "R-1",
    })
    expect("metadata" in r).toBe(false)
  })

  test("falls back to board token and updated_at; missing values are null", async () => {
    const list = await fixture<GhList>("list.json")
    const frontend = toResult(list.jobs![3], "examplecorp")
    expect(frontend.company).toBe("examplecorp")
    expect(frontend.date).toBe("2026-10-19T00:00:00-04:00")
    expect(frontend.firstPublished).toBeNull()
    const bare = toResult(list.jobs![4], "examplecorp")
    expect(bare.location).toBeNull()
    expect(bare.url).toBeNull()
    expect(bare.date).toBeNull()
    expect(bare.deadline).toBeNull()
  })
})

describe("filterJobs", () => {
  const now = Date.parse("2026-10-20T00:00:00Z")
  const rows = async () => (await fixture<GhList>("list.json")).jobs!.map((j) => toResult(j, "examplecorp"))

  test("query needs every word in the title, case-insensitive", async () => {
    const out = filterJobs(await rows(), { query: "BACKEND engineer" }, now)
    expect(out.map((r) => r.id)).toEqual(["1000001", "1000002"])
    expect(filterJobs(await rows(), { query: "백엔드" }, now).map((r) => r.id)).toEqual(["1000003"])
  })

  test("query ignores hyphens, so backend matches Back-end", async () => {
    const base = (await rows())[0]
    const hyphenated = [{ ...base, id: "2000001", title: "Senior Back-end Engineer" }, { ...base, id: "2000002", title: "Fullstack Developer" }]
    expect(filterJobs(hyphenated, { query: "backend" }, now).map((r) => r.id)).toEqual(["2000001"])
    expect(filterJobs(hyphenated, { query: "full-stack" }, now).map((r) => r.id)).toEqual(["2000002"])
  })

  test("location is a case-insensitive substring of location.name", async () => {
    expect(filterJobs(await rows(), { location: "seoul" }, now).map((r) => r.id)).toEqual(["1000003", "1000001"])
    expect(filterJobs(await rows(), { location: "remote" }, now).map((r) => r.id)).toEqual(["1000004"])
  })

  test("jobage keeps dated rows within N days and drops undated ones", async () => {
    expect(filterJobs(await rows(), { jobage: 7 }, now).map((r) => r.id)).toEqual(["1000004", "1000003"])
  })

  test("results are sorted newest first, undated last", async () => {
    expect(filterJobs(await rows(), {}, now).map((r) => r.id)).toEqual(["1000004", "1000003", "1000001", "1000002", "1000005"])
  })
})

describe("HTML decoding", () => {
  test("decodeEntities decodes exactly one level", () => {
    expect(decodeEntities("&amp;lt;p&amp;gt; &#233; &#x1F600; &unknown;")).toBe("&lt;p&gt; é 😀 &unknown;")
  })

  test("htmlToText decodes the double-escaped content and keeps paragraph/list breaks", async () => {
    const d = await fixture<GhJobDetail>("detail.json")
    expect(htmlToText(d.content!)).toBe(
      [
        'We build payments for "everyone" & more.',
        "",
        "What you will do",
        "",
        "- Design APIs",
        "- Run Java & Kotlin services",
        "at scale",
        "",
        "Literal tag text: <b> stays text. Café",
      ].join("\n"),
    )
  })

  test("toDetail adds departments, offices and the description", async () => {
    const d = toDetail(await fixture<GhJobDetail>("detail.json"), "examplecorp")
    expect(d.departments).toEqual(["Engineering"])
    expect(d.offices).toEqual(["Seoul, South Korea"])
    expect(d.deadline).toBe("2026-12-31")
    expect(d.description).toStartWith("We build payments")
  })
})

describe("resolveJobId", () => {
  test("accepts ids and Greenhouse / gh_jid URLs", () => {
    expect(resolveJobId("8127146", "coupang")).toEqual({ id: "8127146" })
    expect(resolveJobId("https://boards.greenhouse.io/coupang/jobs/8127146", "coupang")).toEqual({ id: "8127146" })
    expect(resolveJobId("https://job-boards.greenhouse.io/Coupang/jobs/8127146?utm=x", "coupang")).toEqual({ id: "8127146" })
    expect(resolveJobId("https://boards-api.greenhouse.io/v1/boards/coupang/jobs/8127146", "coupang")).toEqual({ id: "8127146" })
    expect(resolveJobId("https://www.coupang.jobs/en/jobs/?gh_jid=8127146", "coupang")).toEqual({ id: "8127146" })
  })

  test("rejects other hosts without gh_jid, board mismatches, and junk", () => {
    expect("error" in resolveJobId("https://www.coupang.jobs/en/jobs/8127146", "coupang")).toBe(true)
    expect("error" in resolveJobId("https://boards.greenhouse.io/gitlab/jobs/8127146", "coupang")).toBe(true)
    expect("error" in resolveJobId("abc", "coupang")).toBe(true)
    expect("error" in resolveJobId("https://example.test/?gh_jid=abc", "coupang")).toBe(true)
  })

  test("board token validation", () => {
    expect(isValidBoard("coupang")).toBe(true)
    expect(isValidBoard("my_board-2")).toBe(true)
    expect(isValidBoard("../embed")).toBe(false)
    expect(isValidBoard("a/b")).toBe(false)
  })
})

describe("fetchJson", () => {
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

  test("refuses hosts other than boards-api.greenhouse.io and /embed/", async () => {
    await expect(fetchJson("https://boards.greenhouse.io/v1/boards/x/jobs")).rejects.toThrow(/only https:\/\/boards-api/)
    await expect(fetchJson("https://boards-api.greenhouse.io/embed/job_board?for=x")).rejects.toThrow(/embed/)
  })

  test("retries 429/5xx, then returns JSON; 404 is null", async () => {
    const statuses = [429, 503, 200]
    let calls = 0
    const fake = (async () => {
      const s = statuses[calls++]
      return s === 200 ? ok({ jobs: [] }) : new Response("", { status: s })
    }) as unknown as typeof fetch
    expect(await fetchJson("https://boards-api.greenhouse.io/v1/boards/x/jobs", { fetchImpl: fake, baseDelay: 1 })).toEqual({ jobs: [] })
    expect(calls).toBe(3)

    const notFound = (async () => ok({ status: 404, error: "Job not found" }, 404)) as unknown as typeof fetch
    expect(await fetchJson("https://boards-api.greenhouse.io/v1/boards/x/jobs", { fetchImpl: notFound })).toBeNull()
  })

  test("gives up after 6 retries", async () => {
    let calls = 0
    const fake = (async () => {
      calls++
      return new Response("", { status: 500 })
    }) as unknown as typeof fetch
    await expect(fetchJson("https://boards-api.greenhouse.io/v1/boards/x/jobs", { fetchImpl: fake, baseDelay: 1 })).rejects.toThrow(/500/)
    expect(calls).toBe(7)
  })
})
