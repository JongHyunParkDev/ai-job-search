# Fixtures

Small excerpts of live Incruit pages, captured 2026-10-20 with the CLI's User-Agent and decoded
from EUC-KR to UTF-8.

- `search-cards.html` — two result cards plus one ad-banner row (no `jobno`) from
  `https://search.incruit.com/list/search.asp?col=job&kw=java`. Per-member/company hash
  attributes (`f_mem`, `f_comp`) were stripped.
- `detail-excerpt.html` — the meta description, JSON-LD block, company input, `<h1>`,
  `ul.jc_list` and the deadline block from
  `https://job.incruit.com/jobdb_info/jobpost.asp?job=2610110000086`.

Used only by the offline parser tests in `../parsing.test.ts`.
