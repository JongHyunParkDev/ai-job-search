// Offline parser tests. Fixtures are synthetic markup that mirrors Saramin's
// structure (class names and attribute layout as observed 2026-10-20); they
// contain no real posting content.
import { describe, expect, test } from "bun:test"
import {
  parseCardDate,
  parseDeadline,
  parseDescription,
  parseJobCards,
  parseTotalCount,
  parseViewMeta,
  resolveLocation,
} from "../src/helpers"
import { normalizeId } from "../src/commands/detail"
import { buildUrl, filterByAge } from "../src/commands/search"

function card(id: string, title: string, extra: Partial<Record<"company" | "day" | "date", string>> = {}): string {
  return `<div class="item_recruit" value="${id}" data-data_layer="x">
    <div class="area_job">
      <h2 class="job_tit"><a target="_blank" title="${title}" href="/zf_user/jobs/relay/view?view_type=search&amp;rec_idx=${id}&amp;x=1"><span>${title}</span></a></h2>
      <div class="job_date"><span class="date">${extra.date ?? "~ 11/18(수)"}</span><button><span>입사지원</span></button></div>
      <div class="job_condition">
        <span><a href="/a">서울</a>  <a href="/b">강남구</a></span> <span>경력 3~5년</span> <span>대졸↑</span> <span>정규직·계약직</span>
      </div>
      <div class="job_sector"><b><a href="/c">백엔드/서버개발</a></b>, <a href="/d">Java</a> 외 <span class="job_day">${extra.day ?? "등록일 26/10/19"}</span></div>
    </div>
    <div class="area_corp"><strong class="corp_name"><a href="/zf_user/company-info/view?csn=x">${extra.company ?? "(주)테스트컴퍼니"}</a></strong></div>
  </div>`
}

describe("parseJobCards", () => {
  test("parses every field of a card", () => {
    const html = `<span class="cnt_result">총 1,234건</span>` + card("55000001", "백엔드 개발자 &amp; 리드")
    const [c] = parseJobCards(html, "2026-10-20")
    expect(c).toEqual({
      id: "55000001",
      title: "백엔드 개발자 & 리드",
      company: "(주)테스트컴퍼니",
      location: "서울 강남구",
      date: "2026-10-19",
      dateType: "registered",
      deadline: "~ 11/18(수)",
      deadlineDate: "2026-11-18",
      career: "경력 3~5년",
      education: "대졸↑",
      employmentType: "정규직·계약직",
      sectors: ["백엔드/서버개발", "Java"],
      url: "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=55000001",
    })
    expect(parseTotalCount(html)).toBe(1234)
  })

  test("a malformed card does not break the others", () => {
    const html = card("55000001", "A") + `<div class="item_recruit" value="broken"><h2>` + card("55000002", "B")
    const ids = parseJobCards(html).map((c) => c.id)
    expect(ids).toEqual(["55000001", "55000002"])
  })

  test("missing values are null, never omitted", () => {
    const html = `<div class="item_recruit" value="55000003"><h2 class="job_tit"><a title="Only title">x</a></h2></div>`
    const [c] = parseJobCards(html)
    expect(c.company).toBeNull()
    expect(c.location).toBeNull()
    expect(c.date).toBeNull()
    expect(c.deadline).toBeNull()
    expect(c.career).toBeNull()
  })
})

describe("dates", () => {
  test("card date: registered vs modified", () => {
    expect(parseCardDate("수정일 26/09/29")).toEqual({ date: "2026-09-29", type: "modified" })
    expect(parseCardDate("nothing")).toEqual({ date: null, type: null })
  })
  test("deadline resolution", () => {
    expect(parseDeadline("내일마감", "2026-10-20")).toBe("2026-10-21")
    expect(parseDeadline("오늘마감", "2026-10-20")).toBe("2026-10-20")
    expect(parseDeadline("채용시", "2026-10-20")).toBeNull()
    expect(parseDeadline("~ 01/05(화)", "2026-12-20")).toBe("2027-01-05")
    expect(parseDeadline("~ 10/18(일)", "2026-10-20")).toBe("2026-10-18")
  })
  test("filterByAge keeps only recent cards", () => {
    const cards = parseJobCards(card("1000001", "new", { day: "등록일 26/10/19" }) + card("1000002", "old", { day: "등록일 26/09/01" }))
    expect(filterByAge(cards, 7, "2026-10-20").map((c) => c.id)).toEqual(["1000001"])
  })
})

describe("detail parsing", () => {
  test("view meta", () => {
    const html = `<meta name="description" content="(주)테스트, 프론트엔드 개발자, 경력:경력무관, 학력:학력무관, 면접 후 결정, 마감일:2026-11-19, 홈페이지:www.example.com" >
      <meta property="og:title" content="[(주)테스트] 프론트엔드 개발자(D-30) - 사람인" >`
    expect(parseViewMeta(html)).toEqual({
      title: "프론트엔드 개발자",
      company: "(주)테스트",
      career: "경력무관",
      education: "학력무관",
      salary: "면접 후 결정",
      deadlineDate: "2026-11-19",
      homepage: "www.example.com",
    })
    expect(parseViewMeta("<html></html>")).toBeNull()
  })
  test("description keeps line breaks and decodes entities", () => {
    const html = `<div class="user_content"><p>주요업무</p><div>• API 개발 &amp; 운영<br>• 코드 리뷰</div><img src="x.png"></div>`
    const d = parseDescription(html)
    expect(d.text).toBe("주요업무\n• API 개발 & 운영\n• 코드 리뷰")
    expect(d.images).toBe(1)
  })
  test("normalizeId", () => {
    expect(normalizeId("55210151")).toBe("55210151")
    expect(normalizeId("https://www.saramin.co.kr/zf_user/jobs/relay/view?view_type=search&rec_idx=55210151")).toBe("55210151")
    expect(normalizeId("saramin.co.kr/zf_user/jobs/view/rec_idx/55210151")).toBe("55210151")
    expect(normalizeId("https://saramin.co.kr.evil.io/x?rec_idx=55210151")).toBeNull()
    expect(normalizeId("not-an-id")).toBeNull()
  })
})

describe("location + url", () => {
  test("resolveLocation", () => {
    expect(resolveLocation("서울")).toEqual({ mcd: ["101000"], cd: [] })
    expect(resolveLocation("서울특별시")).toEqual({ mcd: ["101000"], cd: [] })
    expect(resolveLocation("Busan")).toEqual({ mcd: ["106000"], cd: [] })
    expect(resolveLocation("판교, 강남구")).toEqual({ mcd: [], cd: ["102180", "101010"] })
    expect(resolveLocation("102190")).toEqual({ mcd: [], cd: ["102190"] })
    expect(resolveLocation("아틀란티스")).toEqual({ unknown: "아틀란티스" })
  })
  test("buildUrl maps flags to Saramin params", () => {
    const url = new URL(buildUrl({ query: "백엔드", locMcd: ["101000"], locCd: ["102180"], jobage: 7, page: 2, format: "json" }))
    expect(url.pathname).toBe("/zf_user/search/recruit")
    expect(url.searchParams.get("searchword")).toBe("백엔드")
    expect(url.searchParams.get("loc_mcd")).toBe("101000")
    expect(url.searchParams.get("loc_cd")).toBe("102180")
    expect(url.searchParams.get("recruitSort")).toBe("reg_dt")
    expect(url.searchParams.get("recruitPage")).toBe("2")
    expect(url.searchParams.get("recruitPageCount")).toBe("40")
  })
})
