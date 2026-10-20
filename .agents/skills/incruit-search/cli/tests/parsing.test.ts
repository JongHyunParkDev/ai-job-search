import { describe, expect, test } from "bun:test"
import { join } from "path"
import {
  dateFromId,
  decodeEucKr,
  encodeEucKr,
  parseJobCards,
  parseJobDetail,
  todayKst,
} from "../src/helpers.ts"
import { applyFilters, buildUrl } from "../src/commands/search.ts"
import { normalizeId } from "../src/commands/detail.ts"

const fixture = (name: string) => Bun.file(join(import.meta.dir, "fixtures", name)).text()

describe("EUC-KR", () => {
  test("encodes Hangul as two-byte EUC-KR percent escapes", () => {
    expect(encodeEucKr("백엔드 개발자")).toBe("%B9%E9%BF%A3%B5%E5%20%B0%B3%B9%DF%C0%DA")
    expect(encodeEucKr("java")).toBe("java")
  })
  test("round-trips through the decoder", () => {
    const enc = encodeEucKr("부산 데이터분석")
    const bytes = new Uint8Array(enc.match(/%([0-9A-F]{2})/g)!.map((h) => parseInt(h.slice(1), 16)))
    expect(decodeEucKr(bytes)).toBe("부산 데이터분석")
  })
  test("unmappable characters become spaces instead of throwing", () => {
    expect(encodeEucKr("a😀b")).toBe("a%20b")
  })
})

describe("parseJobCards", () => {
  test("parses each card and skips rows without a jobno (ad banners)", async () => {
    const cards = parseJobCards(await fixture("search-cards.html"))
    expect(cards.length).toBe(2)
    const [a, b] = cards
    expect(a).toEqual({
      id: "2610110000086",
      title: "JAVA 개발",
      company: "IT SEARCH(아이티서치)",
      companyUrl: "https://www.incruit.com/company/1239867",
      location: "서울 강남구 외",
      date: "2026-10-11",
      url: "https://job.incruit.com/jobdb_info/jobpost.asp?job=2610110000086",
      experience: "경력 3~8년",
      education: "학력무관",
      employmentType: "정규직",
      jobCategory: "응용개발자",
      deadline: "~11.10 (화)",
      postedText: "9일전 등록",
    })
    expect(b.id).toBe("2610080002048")
    expect(b.company).toBe("연우정보기술(주)")
    expect(b.employmentType).toBe("프리랜서")
  })

  test("a malformed card does not break the others", () => {
    const html =
      '<ul class="c_row" jobno="2610110000001"><li>broken' +
      '<ul class="c_row" jobno="2610110000002"><li><a href="https://job.incruit.com/jobdb_info/jobpost.asp?job=2610110000002">Ok</a></li></ul>'
    const cards = parseJobCards(html)
    expect(cards.map((c) => c.id)).toEqual(["2610110000002"])
    expect(cards[0].company).toBeNull()
    expect(cards[0].location).toBeNull()
  })
})

describe("parseJobDetail", () => {
  test("reads JSON-LD and labelled fields", async () => {
    const job = parseJobDetail(await fixture("detail-excerpt.html"), "2610110000086", new Date("2026-10-20T00:00:00Z"))
    expect(job.title).toBe("JAVA 개발")
    expect(job.company).toBe("IT SEARCH(아이티서치)")
    expect(job.date).toBe("2026-10-11")
    expect(job.employmentType).toBe("정규직")
    expect(job.experience).toBe("경력 3~8년")
    expect(job.salary).toBe("연봉 4,000 ~ 6,000만원")
    expect(job.location).toContain("강남구")
    expect(job.deadline).toContain("2026.11.10")
    expect(job.description).toContain("[담당업무]")
    expect(job.isActive).toBe(true)
  })
  test("past validThrough marks the posting closed", async () => {
    const job = parseJobDetail(await fixture("detail-excerpt.html"), "2610110000086", new Date("2027-01-01T00:00:00Z"))
    expect(job.isActive).toBe(false)
  })
})

describe("helpers", () => {
  test("dateFromId reads the YYMMDD prefix", () => {
    expect(dateFromId("2610110000086")).toBe("2026-10-11")
    expect(dateFromId("123")).toBeNull()
    expect(dateFromId("2613990000000")).toBeNull()
  })
  test("todayKst shifts to UTC+9", () => {
    expect(todayKst(new Date("2026-10-20T16:00:00Z"))).toBe("2026-10-21")
  })
  test("buildUrl encodes query+location in EUC-KR and pages by 30", () => {
    const url = buildUrl({ query: "개발자", location: "부산", page: 2, jobage: 7, format: "json" })
    expect(url).toBe(
      "https://search.incruit.com/list/search.asp?col=job&kw=%B0%B3%B9%DF%C0%DA%20%BA%CE%BB%EA&psize=30&startno=30",
    )
  })
  test("applyFilters: location (whitespace-insensitive) and jobage", async () => {
    const cards = parseJobCards(await fixture("search-cards.html"))
    const base = { query: "x", page: 1, format: "json" as const }
    expect(applyFilters(cards, { ...base, location: "서울 강남구" }, "2026-10-20").map((c) => c.id)).toEqual([
      "2610110000086",
    ])
    expect(applyFilters(cards, { ...base, jobage: 10 }, "2026-10-20").map((c) => c.id)).toEqual(["2610110000086"])
  })
  test("normalizeId accepts ids and incruit URLs only", () => {
    expect(normalizeId("2610110000086")).toBe("2610110000086")
    expect(normalizeId("https://job.incruit.com/jobdb_info/jobpost.asp?job=2610110000086&src=etc*search")).toBe(
      "2610110000086",
    )
    expect(normalizeId("https://incruit.com.evil.io/jobpost.asp?job=2610110000086")).toBeNull()
    expect(normalizeId("https://incruit.com@evil.io/?job=2610110000086")).toBeNull()
    expect(normalizeId("not-an-id")).toBeNull()
  })
})
