import { describe, expect, test } from "bun:test";
import { join } from "path";
import {
  htmlToText,
  kstCutoff,
  matchesTerms,
  parseJobDetail,
  parseSearchResponse,
  planQuery,
  resolveCities,
} from "../src/helpers";
import { normalizeId } from "../src/commands/detail";

const FIX = join(import.meta.dir, "fixtures");

describe("parseSearchResponse", () => {
  test("maps live API recruits to the contract shape", async () => {
    const body = await Bun.file(join(FIX, "search-postings.json")).text();
    const { total, cards } = parseSearchResponse(body);
    expect(total).toBe(745);
    expect(cards).toHaveLength(3);
    const c = cards[0];
    expect(c.id).toBe("1755787");
    expect(c.title).toBe("[코리아교육그룹] IT지원실 백엔드 개발자 채용");
    expect(c.company).toBe("(주)코리아교육그룹");
    expect(c.location).toBe("서울");
    expect(c.date).toBe("2026-10-20");
    expect(c.url).toBe("https://www.jobplanet.co.kr/job/search?posting_ids[]=1755787");
    expect(c.rating).toBe(2.6);
    expect(c.occupations).toContain("백엔드 개발");
    for (const key of ["id", "title", "company", "location", "date", "url"]) {
      expect(key in c).toBe(true);
    }
  });

  test("a company with no reviews gets rating null, not 0", async () => {
    const body = await Bun.file(join(FIX, "search-postings.json")).text();
    const { cards } = parseSearchResponse(body);
    expect(cards[2].rating).toBeNull();
    expect(cards[2].ratingCount).toBe(0);
  });

  test("one malformed recruit does not break the rest", () => {
    const body = JSON.stringify({
      data: { total_count: 2, recruits: [{ id: "x" }, null, { id: 42, title: "QA 엔지니어", company: null }] },
    });
    const { cards } = parseSearchResponse(body);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("42");
    expect(cards[0].company).toBeNull();
    expect(cards[0].location).toBeNull();
    expect(cards[0].date).toBeNull();
  });

  test("non-JSON (e.g. a challenge page) throws", () => {
    expect(() => parseSearchResponse("<!DOCTYPE html><title>Just a moment...</title>")).toThrow();
  });
});

describe("parseJobDetail", () => {
  test("extracts JSON-LD + hydrated posting from the flight payload", async () => {
    const html = await Bun.file(join(FIX, "detail-posting.html")).text();
    const job = parseJobDetail(html, "1755787")!;
    expect(job).not.toBeNull();
    expect(job.title).toBe("[코리아교육그룹] IT지원실 백엔드 개발자 채용");
    expect(job.company).toBe("(주)코리아교육그룹");
    expect(job.companyId).toBe("311294");
    expect(job.date).toBe("2026-10-20");
    expect(job.deadline).toBe("2026-11-18");
    expect(job.employmentType).toBe("FULL_TIME");
    expect(job.jobType).toBe("정규직");
    expect(job.rating).toBe(2.6);
    expect(job.isActive).toBe(true);
    expect(job.description).toContain("회사위치\n서울특별시 강남구 강남대로 286");
    expect(job.description).toContain("[소개]");
    expect(job.description).toContain("- DB 설계 & 운영");
    expect(job.description).not.toMatch(/<|&lt;|&amp;/);
  });

  test("a page without a posting returns null", () => {
    expect(parseJobDetail("<html><body>not found</body></html>", "1")).toBeNull();
  });
});

describe("planQuery", () => {
  test("level-1 category name maps to occupation_level1", () => {
    const p = planQuery("데이터");
    expect(p.mode).toBe("occupation");
    expect(p.level1.length).toBe(1);
  });
  test("partial level-2 label maps to occupation_level2", () => {
    const p = planQuery("백엔드");
    expect(p.mode).toBe("occupation");
    expect(p.level2).toContain(11904);
    expect(p.labels).toContain("백엔드 개발");
  });
  test("unknown keyword falls back to client-side text filter", () => {
    const p = planQuery("Spring Boot");
    expect(p.mode).toBe("text");
    expect(p.terms).toEqual(["spring", "boot"]);
  });
  test("text filter matches title/company/skills case-insensitively", async () => {
    const { cards } = parseSearchResponse(await Bun.file(join(FIX, "search-postings.json")).text());
    expect(cards.filter((c) => matchesTerms(c, ["backend"])).map((c) => c.id)).toEqual(["1755894"]);
  });
});

describe("resolveCities", () => {
  test("Korean, English and suffixed names", () => {
    expect(resolveCities("서울")).toEqual([1]);
    expect(resolveCities("서울특별시, Busan")).toEqual([1, 4]);
    expect(resolveCities("gyeonggi,경기")).toEqual([2]);
  });
  test("unknown region returns null", () => {
    expect(resolveCities("판교")).toBeNull();
    expect(resolveCities("Copenhagen")).toBeNull();
  });
});

describe("normalizeId", () => {
  test("accepts ids and jobplanet URLs", () => {
    expect(normalizeId("1755787")).toBe("1755787");
    expect(normalizeId("https://www.jobplanet.co.kr/job/search?posting_ids[]=1755787")).toBe("1755787");
    expect(normalizeId("https://www.jobplanet.co.kr/job/search?posting_ids%5B%5D=1755787")).toBe("1755787");
    expect(normalizeId("https://b.jobplanet.co.kr/job-postings-1755787")).toBe("1755787");
    expect(normalizeId("www.jobplanet.co.kr/companies/311294/job_postings/1755787/x")).toBe("1755787");
  });
  test("rejects other hosts and look-alikes", () => {
    expect(normalizeId("https://www.jobkorea.co.kr/Recruit/GI_Read/50201595")).toBeNull();
    expect(normalizeId("https://jobplanet.co.kr.evil.io/job/search?posting_ids[]=1")).toBeNull();
    expect(normalizeId("abc")).toBeNull();
  });
});

describe("text helpers", () => {
  test("htmlToText keeps breaks and decodes entities", () => {
    expect(htmlToText("<p>A&amp;B</p><p>C<br>D</p>")).toBe("A&B\nC\nD");
  });
  test("kstCutoff is a YYYY-MM-DD date in UTC+9", () => {
    expect(kstCutoff(1, new Date("2026-10-20T16:00:00Z"))).toBe("2026-10-20");
  });
});
