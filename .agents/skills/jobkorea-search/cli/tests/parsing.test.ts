import { describe, expect, test } from "bun:test"
import {
  careerLabel,
  decodeFlight,
  educationLabel,
  parseCodeTables,
  parseDescription,
  parseHtmlCards,
  parseJobDetail,
  parseSearchPage,
  sliceBalanced,
} from "../src/helpers"
import { normalizeId } from "../src/commands/detail"
import { buildUrl, withinDays } from "../src/commands/search"

// Synthetic fixtures shaped like the live markup (2026-10). They mirror the
// anchors the parser depends on, not real postings.

function flightScript(payload: string): string {
  return `<script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`
}

const codes =
  '{"area":[{"code":"I000","parentCode":"","originName":"서울특별시","displayName":"서울","items":[],"type":"area","tagDisplayName":"서울"},' +
  '{"code":"I010","parentCode":"I000","originName":"강남구","displayName":"강남구","items":[],"type":"area","tagDisplayName":"서울>강남구"},' +
  '{"code":"B150","parentCode":"B000","originName":"성남시 분당구","displayName":"성남시 분당구","items":[],"type":"area","tagDisplayName":"경기>성남시 분당구"}],' +
  '"employment":[{"code":"1","displayName":"정규직","parentCode":"","items":[],"type":"employment","tagDisplayName":""},' +
  '{"code":"3","displayName":"인턴","parentCode":"","items":[],"type":"employment","tagDisplayName":""}]}'

const jobList = {
  pageSize: 20,
  pageNumber: 0,
  totalElements: 2380,
  totalPages: 119,
  content: [
    {
      id: "50135552",
      title: "[테스트] 백엔드 개발자 채용",
      createdAt: "2026-10-09T10:00:00.953+09:00",
      postingCompanyName: "㈜테스트",
      employmentTypeCodeList: ["1/0", "3/1"],
      areaCodeList: ["I010", "B150"],
      careerType: "2",
      careerRange: 3,
      educationCode: "5",
      applicationPeriod: { start: "2026-10-09T10:00:00+09:00", end: "2026-10-22T16:00:00+09:00" },
      jobClassificationOrIndustry: ",솔루션·SI·CRM·ERP,백엔드개발자,",
    },
    { id: "bad", title: "" },
    { id: "50000001", title: "No extras" },
    { id: "50000002", title: "상시채용", applicationPeriod: { end: "2070-01-01T00:00:00+09:00" } },
  ],
}

const searchHtml =
  "<html><body><div>총 <span class=\"x\">2,380</span>건</div>" +
  flightScript(`5:{"state":{"data":${codes}},"queryKey":["CODES"]}`) +
  flightScript(
    `13:[{"state":{"queries":[{"state":{"data":${JSON.stringify(jobList)},"status":"success"},"queryKey":["JOB_LIST",20,0,"1","DESC","백엔드"]}]}}]`,
  ) +
  "</body></html>"

describe("search parsing (flight JSON)", () => {
  test("decodes flight chunks and extracts JOB_LIST items", () => {
    expect(decodeFlight(searchHtml)).toContain('"queryKey":["JOB_LIST"')
    const page = parseSearchPage(searchHtml)
    expect(page.source).toBe("json")
    expect(page.total).toBe(2380)
    expect(page.cards).toHaveLength(3)
    expect(page.cards[2].deadline).toBeNull()
    expect(page.cards[2].openUntilFilled).toBe(true)
    const c = page.cards[0]
    expect(c).toEqual({
      id: "50135552",
      title: "[테스트] 백엔드 개발자 채용",
      company: "㈜테스트",
      location: "서울 강남구 외 1",
      date: "2026-10-09T10:00:00.953+09:00",
      url: "https://www.jobkorea.co.kr/Recruit/GI_Read/50135552",
      deadline: "2026-10-22T16:00:00+09:00",
      career: "경력3년↑",
      education: "대졸↑",
      employmentType: "정규직, 인턴",
      jobCategory: "솔루션·SI·CRM·ERP, 백엔드개발자",
      openUntilFilled: false,
    })
  })

  test("missing fields are null, never omitted", () => {
    const c = parseSearchPage(searchHtml).cards[1]
    for (const k of ["company", "location", "date", "deadline", "career", "education", "employmentType", "jobCategory", "openUntilFilled"]) {
      expect(c).toHaveProperty(k)
      expect((c as unknown as Record<string, unknown>)[k]).toBeNull()
    }
  })

  test("code tables map area and employment codes", () => {
    const t = parseCodeTables(decodeFlight(searchHtml))
    expect(t.area.get("B150")).toBe("경기 성남시 분당구")
    expect(t.employment.get("1")).toBe("정규직")
  })

  test("sliceBalanced respects braces inside strings", () => {
    const s = 'x{"a":"}{","b":[1,{"c":2}]}tail'
    expect(sliceBalanced(s, 1)).toBe('{"a":"}{","b":[1,{"c":2}]}')
  })
})

describe("search parsing (HTML fallback)", () => {
  const card = (id: string, title: string) =>
    `<div data-sentry-component="CardJob"><a href="https://www.jobkorea.co.kr/Recruit/GI_Read/${id}?x=1" data-sentry-component="Title"><span>${title}</span></a>` +
    `<span class="truncate text-gray700 text-typo-b2-16">회사 &amp; 파트너스</span>` +
    `<span class="emoji--basicemoji-place2"></span></div><span class="truncate text-gray900 text-typo-b4-14">부산 해운대구</span>` +
    `<span class="flex-shrink-0 text-gray700 text-typo-c1-13">신입</span></div>`

  test("parses each card independently and skips ads before the total header", () => {
    const html =
      card("11111111", "광고 공고") +
      '<span>총 <span class="b">2</span>건</span>' +
      card("22222222", "프론트엔드 개발자") +
      '<div data-sentry-component="CardJob">broken card</div>' +
      card("33333333", "데이터 분석가")
    const page = parseSearchPage(html)
    expect(page.source).toBe("html")
    expect(page.total).toBe(2)
    expect(page.cards.map((c) => c.id)).toEqual(["22222222", "33333333"])
    expect(page.cards[0].company).toBe("회사 & 파트너스")
    expect(page.cards[0].location).toBe("부산 해운대구")
    expect(page.cards[0].career).toBe("신입")
    expect(page.cards[0].date).toBeNull()
    expect(parseHtmlCards("<html></html>")).toEqual([])
  })
})

describe("code labels", () => {
  test("career", () => {
    expect(careerLabel("1", 0)).toBe("신입")
    expect(careerLabel("2", 100)).toBe("경력")
    expect(careerLabel("3", 5)).toBe("신입·경력5년↑")
    expect(careerLabel(undefined, undefined)).toBeNull()
  })
  test("education", () => {
    expect(educationLabel("0")).toBe("학력무관")
    expect(educationLabel("4")).toBe("초대졸↑")
    expect(educationLabel("255")).toBe("학력무관")
    expect(educationLabel(null)).toBeNull()
  })
})

describe("detail parsing", () => {
  const ld = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "풀스택 개발자 채용",
    datePosted: "2026-09-23",
    validThrough: "2026-10-23T23:59",
    employmentType: "FULL_TIME",
    experienceRequirements: "신입·경력",
    educationRequirements: "대졸 이상",
    hiringOrganization: { "@type": "Organization", name: "㈜예시" },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", streetAddress: "경기 과천시 과천대로 1" } },
  }
  const page =
    `<head><meta property="og:title" content="㈜예시 채용 - 풀스택 개발자 채용 | 잡코리아"/></head>` +
    `<script type="application/ld+json">${JSON.stringify(ld)}</script>` +
    `<div><span class="min-w-[80px]">고용형태</span><div><span class="font-bold">정규직</span><span></span></div></div>` +
    `<div><div class="flex"><div class="min-w-[80px]"><span>모집분야</span></div><div class="flex"><span class="flex-1">백엔드, 풀스택</span></div></div></div>` +
    `<div><span class="min-w-[80px]">급여</span><span class="t">회사 내규에 따름 (면접 후 결정)</span></div>` +
    `<div><span class="min-w-[80px]">학력</span><div><span class="b">대졸이상</span><span>(졸업예정자 가능)</span></div></div>`
  const iframe =
    `<div id="details-section"><div data-security-mode="restricted" id="detail-content" class="html-viewer-content-reset">` +
    `<style>.x{}</style><p>담당업무</p><ul><li>API 개발 &amp; 운영</li><li>성능 개선</li></ul><div>자격요건<br>Java 3년 이상</div></div></div>`

  test("reads JSON-LD, labelled rows and the description iframe", () => {
    const d = parseJobDetail(page, "50046914", iframe)
    expect(d).not.toBeNull()
    expect(d!.title).toBe("풀스택 개발자 채용")
    expect(d!.company).toBe("㈜예시")
    expect(d!.location).toBe("경기 과천시 과천대로 1")
    expect(d!.date).toBe("2026-09-23")
    expect(d!.deadline).toBe("2026-10-23T23:59")
    expect(d!.employmentType).toBe("정규직")
    expect(d!.salary).toBe("회사 내규에 따름 (면접 후 결정)")
    expect(d!.education).toBe("대졸이상 (졸업예정자 가능)")
    expect(d!.career).toBe("신입·경력")
    expect(d!.jobCategory).toBe("백엔드, 풀스택")
    expect(d!.description).toBe("담당업무\nAPI 개발 & 운영\n성능 개선\n\n자격요건\nJava 3년 이상")
  })

  test("returns null for a page without posting data", () => {
    expect(parseJobDetail("<html>gone</html>", "1", "")).toBeNull()
    expect(parseDescription("<html></html>")).toBeNull()
  })
})

describe("ids and urls", () => {
  test("normalizeId", () => {
    expect(normalizeId("50046914")).toBe("50046914")
    expect(normalizeId("https://www.jobkorea.co.kr/Recruit/GI_Read/50046914?Oem_Code=C1")).toBe("50046914")
    expect(normalizeId("www.jobkorea.co.kr/Recruit/GI_Read/50046914")).toBe("50046914")
    expect(normalizeId("https://m.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=50046914")).toBe("50046914")
    expect(normalizeId("https://jobkorea.co.kr.evil.io/Recruit/GI_Read/50046914")).toBeNull()
    expect(normalizeId("https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=50046914")).toBeNull()
    expect(normalizeId("abc")).toBeNull()
  })

  test("buildUrl encodes the query as UTF-8 and maps page/jobage", () => {
    const u = new URL(buildUrl({ query: "백엔드 개발자", page: 2, format: "json" }))
    expect(u.pathname).toBe("/Search/")
    expect(u.searchParams.get("stext")).toBe("백엔드 개발자")
    expect(u.searchParams.get("tabType")).toBe("recruit")
    expect(u.searchParams.get("Page_No")).toBe("2")
    expect(u.searchParams.get("ord")).toBeNull()
    expect(buildUrl({ query: "x", page: 1, jobage: 7, format: "json" })).toContain("ord=RegDtDesc")
    expect(buildUrl({ query: "백엔드", page: 1, format: "json" })).toContain("stext=%EB%B0%B1%EC%97%94%EB%93%9C")
  })

  test("withinDays", () => {
    const now = Date.parse("2026-10-20T12:00:00+09:00")
    const card = (date: string | null) => ({ date }) as Parameters<typeof withinDays>[0]
    expect(withinDays(card("2026-10-18T12:00:00+09:00"), 7, now)).toBe(true)
    expect(withinDays(card("2026-10-01T12:00:00+09:00"), 7, now)).toBe(false)
    expect(withinDays(card(null), 7, now)).toBe(false)
  })
})
