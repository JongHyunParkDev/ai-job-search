# Fixtures

Captured on 2026-10-20 with `curl -A "Mozilla/5.0 (compatible; jobplanet-cli/1.0)"` during
the portal investigation (Bun's fetch was refused by a Cloudflare challenge, see
`../../../url-reference.md`).

- `search-postings.json` — response of
  `GET /api/v3/job/postings?occupation_level1=&occupation_level2=11904&city=1&page=1&page_size=50&order_by=recent`,
  trimmed to the first 3 recruits. **Edited:** the third recruit's `company.grade` /
  `grade_count` were set to `0` to exercise the "no reviews → rating null" path.
- `detail-posting.html` — rebuilt from `GET /job/search?posting_ids[]=1755787`: only the
  JSON-LD part and the hydrated posting object of the Next.js flight payload are kept,
  re-encoded as two `self.__next_f.push` chunks. **Edited:** review snippets and the
  salary/interview sub-scores were removed (`company.reviews.data` emptied), and a synthetic
  `introduction` HTML value was inserted to exercise section rendering (the real posting had
  `introduction: null`).
