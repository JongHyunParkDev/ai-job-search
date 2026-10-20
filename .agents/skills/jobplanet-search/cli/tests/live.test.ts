// Live smoke test against jobplanet.co.kr. Opt-in only (JOBPLANET_LIVE=1), because
// as of 2026-10-20 Cloudflare answers Bun's fetch with a 403 bot challenge
// (`cf-mitigated: challenge`) even with the honest UA - see url-reference.md.
// The CLI does not try to get around that challenge.
import { describe, expect, test } from "bun:test";
import { parseJSON, runCLI } from "./helpers";

const live = process.env.JOBPLANET_LIVE === "1";

describe.skipIf(!live)("live search", () => {
  test("search -q 백엔드 -l 서울 returns results with id/title/url", async () => {
    const out = parseJSON<{ results: { id: string; title: string; url: string }[] }>(
      await runCLI(["search", "-q", "백엔드", "-l", "서울", "--limit", "3"]),
    );
    expect(out.results.length).toBeGreaterThan(0);
    for (const r of out.results) {
      expect(r.id).toBeTruthy();
      expect(r.title).toBeTruthy();
      expect(r.url).toStartWith("https://www.jobplanet.co.kr/");
    }
  });
});
