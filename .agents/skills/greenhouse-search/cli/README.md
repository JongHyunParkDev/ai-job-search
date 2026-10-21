# greenhouse-cli

Zero-dependency Bun CLI over Greenhouse's public Job Board API
(`boards-api.greenhouse.io`). See `../SKILL.md` for usage and `../url-reference.md`
for the endpoints and field mapping.

```bash
bun install          # dev types only (typescript, @types/bun)
bun run typecheck
bun run test         # offline: fixtures + flag validation, no network
GREENHOUSE_LIVE=1 bun run test   # adds one live search against board "coupang"

bun run src/cli.ts search --board coupang -q backend -l Seoul --format table
bun run src/cli.ts detail 8127146 --board coupang --format plain
```

Layout: `src/cli.ts` (flags, help, dispatch), `src/helpers.ts` (fetch with backoff and
host guard, mapping, client-side filters, HTML decoding, id/URL normalization),
`src/commands/{search,detail}.ts`. Test fixtures in `tests/fixtures/` are synthetic and
contain no personal data.
