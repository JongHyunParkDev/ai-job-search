import { describe, expect, test } from "bun:test"
import { join } from "path"
import { normalizeId, toDetail, toLocationKey, toResults, cleanText } from "../src/helpers.ts"
import { buildUrl, extractItems } from "../src/commands/search.ts"

const fixture = (name: string) => Bun.file(join(import.meta.dir, "fixtures", name)).json()

describe("toResults", () => {
  test("maps search items to the contract shape and skips malformed ones", async () => {
    const body = await fixture("search-jobs.json")
    const results = toResults(extractItems(body))
    expect(results).toHaveLength(3)
    const r = results[0]
    expect(r).toEqual({
      id: "392770",
      title: "백엔드 개발자 (Junior/1~3년)",
      company: "인딥에이아이",
      location: "서울 강남구",
      date: null,
      url: "https://www.wanted.co.kr/wd/392770",
      deadline: null,
      experienceMin: 1,
      experienceMax: 3,
      industry: expect.any(String),
      categoryIds: [872],
    })
    expect(results[1].deadline).toBe("2026-11-15")
    for (const k of ["id", "title", "company", "location", "date", "url"]) {
      expect(Object.keys(r)).toContain(k)
    }
  })

  test("browse responses (data is an array) are read too", () => {
    expect(extractItems({ data: [{ id: 1, position: "x" }] })).toHaveLength(1)
    expect(toResults(undefined)).toEqual([])
  })
})

describe("toDetail", () => {
  test("assembles the description from the labelled sections", async () => {
    const body = await fixture("detail-393427.json")
    const d = toDetail(body.job)!
    expect(d.id).toBe("393427")
    expect(d.company).toBe("라이나생명보험")
    expect(d.deadline).toBe("2026-11-09")
    expect(d.experienceMin).toBe(10)
    expect(d.experienceMax).toBeNull() // annual_to = 100 means open-ended
    expect(d.isActive).toBe(true)
    expect(d.address).toContain("종로구")
    expect(d.description).toContain("## 주요업무 (Main tasks)")
    expect(d.description).toContain("## 자격요건 (Requirements)")
    expect(d.description).not.toMatch(/​/)
    expect(d.companyTags.length).toBeGreaterThan(0)
  })

  test("cleanText strips zero-width chars and collapses blank runs", () => {
    expect(cleanText("a​\r\n\r\n\r\n\r\nb ")).toBe("a\n\nb")
    expect(cleanText("   ")).toBeNull()
  })
})

describe("toLocationKey", () => {
  test("accepts Korean, English, suffixed names and district keys", () => {
    expect(toLocationKey("서울")).toBe("seoul")
    expect(toLocationKey("서울특별시")).toBe("seoul")
    expect(toLocationKey("부산광역시")).toBe("busan")
    expect(toLocationKey("경기도")).toBe("gyeonggi")
    expect(toLocationKey("Seoul")).toBe("seoul")
    expect(toLocationKey("seoul.gangnam-gu")).toBe("seoul.gangnam-gu")
  })
  test("rejects unknown places", () => {
    expect(toLocationKey("Tokyo")).toBeNull()
    expect(toLocationKey("mars.crater")).toBeNull()
    expect(toLocationKey("")).toBeNull()
  })
})

describe("buildUrl", () => {
  test("keyword search uses /api/v4/search with paging and filters", () => {
    const u = new URL(buildUrl({ query: "백엔드", locations: ["seoul", "busan"], years: 3, page: 2, format: "json" }))
    expect(u.pathname).toBe("/api/v4/search")
    expect(u.searchParams.get("query")).toBe("백엔드")
    expect(u.searchParams.getAll("locations")).toEqual(["seoul", "busan"])
    expect(u.searchParams.get("years")).toBe("3")
    expect(u.searchParams.get("offset")).toBe("20")
    expect(u.searchParams.get("job_sort")).toBe("job.latest_order")
  })
  test("no keyword browses /api/v4/jobs across all locations", () => {
    const u = new URL(buildUrl({ locations: [], page: 1, format: "json" }))
    expect(u.pathname).toBe("/api/v4/jobs")
    expect(u.searchParams.getAll("locations")).toEqual(["all"])
    expect(u.searchParams.get("years")).toBe("-1")
  })
})

describe("normalizeId", () => {
  test("accepts ids and wanted.co.kr URLs only", () => {
    expect(normalizeId("393427")).toBe("393427")
    expect(normalizeId("https://www.wanted.co.kr/wd/393427")).toBe("393427")
    expect(normalizeId("wanted.co.kr/wd/393427/")).toBe("393427")
    expect(normalizeId("https://wanted.co.kr.evil.io/wd/393427")).toBeNull()
    expect(normalizeId("https://wanted.co.kr@evil.io/wd/393427")).toBeNull()
    expect(normalizeId("https://boards.greenhouse.io/x/jobs/393427")).toBeNull()
    expect(normalizeId("abc")).toBeNull()
  })
})
