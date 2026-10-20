import { afterEach, describe, expect, test } from "bun:test";
import { join } from "path";
import { runCLI } from "./helpers";
import { runSearch } from "../src/commands/search";

const FIX = join(import.meta.dir, "fixtures");
const originalFetch = globalThis.fetch;
const originalStdout = process.stdout.write;
const originalStderr = process.stderr.write;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdout;
  process.stderr.write = originalStderr;
});

function err(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

function capture(): { out: () => string; errOut: () => string } {
  let out = "";
  let e = "";
  process.stdout.write = ((c: string | Uint8Array) => ((out += c.toString()), true)) as typeof process.stdout.write;
  process.stderr.write = ((c: string | Uint8Array) => ((e += c.toString()), true)) as typeof process.stderr.write;
  return { out: () => out, errOut: () => e };
}

describe("CLI argument validation (no network)", () => {
  test("bogus flag exits 1 with UNKNOWN_FLAG on stderr", async () => {
    const r = await runCLI(["search", "-q", "백엔드", "--bogus", "x"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe("");
    expect(err(r.stderr).code).toBe("UNKNOWN_FLAG");
  });
  test("detail without id exits 1 with NO_ID", async () => {
    const r = await runCLI(["detail"]);
    expect(r.exitCode).toBe(1);
    expect(err(r.stderr).code).toBe("NO_ID");
  });
  test("unknown region exits 1 with BAD_ARG", async () => {
    const r = await runCLI(["search", "-l", "판교"]);
    expect(r.exitCode).toBe(1);
    expect(err(r.stderr).code).toBe("BAD_ARG");
  });
  test("empty --query exits 1", async () => {
    const r = await runCLI(["search", "-q"]);
    expect(r.exitCode).toBe(1);
    expect(err(r.stderr).code).toBe("BAD_ARG");
  });
  for (const name of ["jobage", "page", "limit"]) {
    test(`--${name} 1.5 is rejected, not truncated`, async () => {
      const r = await runCLI(["search", `--${name}`, "1.5"]);
      expect(r.exitCode).toBe(1);
      expect(err(r.stderr).code).toBe("BAD_ARG");
    });
  }
  test("bad --format exits 1", async () => {
    const r = await runCLI(["search", "--format", "xml"]);
    expect(r.exitCode).toBe(1);
    expect(err(r.stderr).code).toBe("BAD_ARG");
  });
  test("foreign detail URL exits 1 with BAD_ID", async () => {
    const r = await runCLI(["detail", "https://www.jobkorea.co.kr/Recruit/GI_Read/1"]);
    expect(r.exitCode).toBe(1);
    expect(err(r.stderr).code).toBe("BAD_ID");
  });
});

describe("runSearch (mocked fetch)", () => {
  test("builds the API URL and emits the contract JSON shape", async () => {
    const body = await Bun.file(join(FIX, "search-postings.json")).text();
    let url = "";
    let ua = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = input.toString();
      ua = new Headers(init?.headers).get("user-agent") ?? "";
      return new Response(body, { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const io = capture();
    const code = await runSearch({ query: "백엔드", cities: [1, 2], page: 2, limit: 2, format: "json" });
    expect(code).toBe(0);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://www.jobplanet.co.kr/api/v3/job/postings");
    expect(u.searchParams.get("occupation_level2")).toContain("11904");
    expect(u.searchParams.get("city")).toBe("1,2");
    expect(u.searchParams.get("page")).toBe("2");
    expect(u.searchParams.get("order_by")).toBe("recent");
    expect(ua).toBe("Mozilla/5.0 (compatible; jobplanet-cli/1.0)");
    const out = JSON.parse(io.out());
    expect(out.meta).toMatchObject({ count: 2, page: 2, total: 745, queryMode: "occupation" });
    expect(out.results[0].id).toBe("1755787");
  });

  test("text-mode query filters client-side", async () => {
    const body = await Bun.file(join(FIX, "search-postings.json")).text();
    globalThis.fetch = (async () => new Response(body)) as unknown as typeof fetch;
    const io = capture();
    const code = await runSearch({ query: "React", page: 1, format: "json" });
    expect(code).toBe(0);
    const out = JSON.parse(io.out());
    expect(out.meta.queryMode).toBe("text");
    expect(out.results.map((r: { id: string }) => r.id)).toEqual(["1753564"]);
  });

  test("a 403 (e.g. bot challenge) is reported on stderr, exit 1", async () => {
    globalThis.fetch = (async () => new Response("Just a moment...", { status: 403, statusText: "Forbidden" })) as unknown as typeof fetch;
    const io = capture();
    const code = await runSearch({ page: 1, format: "json" });
    expect(code).toBe(1);
    expect(io.out()).toBe("");
    expect(JSON.parse(io.errOut()).code).toBe("SEARCH_FAILED");
  });
});
