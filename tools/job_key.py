#!/usr/bin/env python3
"""Canonical dedup key for a job posting, and an audit for existing state.

`/scrape` Step 4 keys every seen_jobs.json entry by company+title. The rule was
prose only ("<url_or_company_title_key>"), so each run slugified in its own way
and the state file accumulated two distinct failures:

  * Keys carrying characters that break things downstream. `/apply` and
    `/outcome` derive an archive folder name from the same company+role pair,
    and documents/README.md's subfolder rule exists because a "/" splits that
    path across directories. Real examples found in a live workspace:
    "deloitte_junior-cybersecurity-analyst-(ot/iot)",
    "neverhack-estonia_penetration-tester-/-red-teamer",
    "ops-consulting,-llc_malware-analyst".

  * The same job stored twice under different keys, because one run truncated
    the title at a different point than the next. "deloitte_cyber-intelligence-
    center-security-analy" and "deloitte_cyber-intelligence-center-security-
    analyst-at" are one posting, one URL, two entries - and dedup is the whole
    point of the file.

Both are fixed by making the key a pure, deterministic function of the posting.
Truncation is length-capped *and* disambiguated by a hash of the full slug, so a
long title always produces the same key and two different long titles never
collide.

A title that slugifies to nothing (a posting written in a non-Latin script) has
no usable key half at all - "securion_" was a real entry, and it would have
collided with every future non-Latin posting from that company. Those fall back
to the portal's numeric id from the URL. A title or company that slugifies to
*less* than it says is the same problem one step on: "Программист 1С" and
"Аналитик 1С" both fold to "1", "Сбер AI" and "Яндекс AI" both fold to "ai",
so whenever the ASCII fold drops letters the surviving fragment is only a
readable prefix and the identity comes from the same fallback.

A Hangul title keys on the portal's job id, so the same Korean posting listed
on several portals (Saramin, JobKorea, Incruit) would get one key per portal.
`--state` gives those the company+title identity Latin titles already have:
when an already-seen entry has the same company (company-form markers such as
"(주)"/"㈜" ignored) and the same title (leading "[회사명]"-style tags and a
trailing 채용/모집/공고 ignored; hiring-track tags such as [경력]/[인턴] still
count), its key is printed instead of a new one. Latin titles are unaffected.

Usage:
  python3 tools/job_key.py --company "Acme Corp" --title "SOC Analyst (L2)"
  python3 tools/job_key.py --company "(주)예시" --title "백엔드 개발자" --url "<url>" --state job_scraper/seen_jobs.json
  python3 tools/job_key.py --audit job_scraper/seen_jobs.json

Exit 0 when a key is produced, or when an audit finds nothing. Exit 1 when an
audit finds violations.
"""

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "job_scraper" / "seen_jobs.json"

COMPANY_MAX = 40
TITLE_MAX = 60
HASH_LEN = 6

# Anything outside this set becomes a separator. Deliberately strict: "/" and
# "," are the characters that actually caused damage, and an allowlist cannot
# be surprised by the next punctuation mark a job board invents.
_NON_SLUG = re.compile(r"[^a-z0-9]+")
_JOB_ID = re.compile(r"(\d{6,})")


def slugify(text: str) -> str:
    """Lowercase ASCII slug. Non-Latin scripts legitimately reduce to ''."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(text))
    ascii_only = decomposed.encode("ascii", "ignore").decode("ascii")
    return _NON_SLUG.sub("-", ascii_only.lower()).strip("-")


def _lost_letters(text: str) -> bool:
    """True when the ASCII fold dropped non-Latin letters, so the slug under-identifies.

    NFKD turns "ü" into "u" plus a combining mark and "ﬁ" into "fi", so most
    Latin text keeps every letter. A Cyrillic, Greek, CJK or Arabic letter has
    no ASCII decomposition and vanishes; a mixed-script name then keeps only
    its Latin or digit fragment, and two different names can share it.

    Latin letters that also lack a decomposition ("ø", "æ", "ß", "ł") are
    deliberately NOT counted: "Ørsted" has keyed as "rsted" since the rule
    existed, and treating it as lossy would re-key every Danish company in a
    live seen_jobs.json for a collision that does not happen in practice.
    """
    if not text:
        return False
    for ch in unicodedata.normalize("NFKD", str(text)):
        if ord(ch) < 128 or not ch.isalpha():
            continue
        if not unicodedata.name(ch, "LATIN").startswith("LATIN"):
            return True
    return False


def _cap(slug: str, limit: int) -> str:
    """Cap length without making truncation lossy across runs.

    A bare truncation is what produced the duplicate Deloitte entries: two runs
    cut the same title at different points and the file gained a second key for
    one job. Appending a hash of the *full* slug makes the result deterministic
    for a given title and distinct for any other.
    """
    if len(slug) <= limit:
        return slug
    digest = hashlib.sha1(slug.encode("utf-8")).hexdigest()[:HASH_LEN]
    return f"{slug[:limit].rstrip('-')}-{digest}"


def make_key(company: str, title: str, url: str = "") -> str:
    """The canonical seen_jobs.json key for one posting."""
    company_slug = _cap(slugify(company), COMPANY_MAX)
    if not company_slug or _lost_letters(company):
        name = unicodedata.normalize("NFC", str(company or "").strip().casefold())
        # An absent name stays unknown; a non-Latin name still has an identity.
        # A mixed-script name keeps its Latin fragment as a readable prefix, but
        # the identity is the hash: "Сбер AI" and "Яндекс AI" both fold to "ai".
        digest = hashlib.sha1(name.encode("utf-8")).hexdigest()[:HASH_LEN]
        if not name:
            company_slug = "unknown-company"
        else:
            company_slug = f"{company_slug}-{digest}" if company_slug else f"company-{digest}"
    title_slug = _cap(slugify(title), TITLE_MAX)
    if not title_slug or _lost_letters(title):
        # No Latin characters in the title, or not enough of them to identify
        # it: "Программист 1С" and "Аналитик 1С" both fold to "1". The portal's
        # own numeric id is the stable handle; a surviving fragment stays as a
        # readable prefix only. Never emit a bare "company_" prefix.
        fragment = title_slug
        match = _JOB_ID.search(url or "")
        if match:
            title_slug = f"{fragment}-{match.group(1)}" if fragment else match.group(1)
        else:
            basis = slugify(unicodedata.normalize("NFKD", str(title or url or "")))
            # Hash the URL alone when there is one. The URL is the posting's
            # identity; the title is not. Including the title made the key
            # change whenever a portal re-listed the same posting with the
            # title altered, which stores one job twice - the failure this
            # whole helper exists to prevent. Portals whose ids carry no run
            # of six digits never reach the branch above, so for them this
            # hash is the only key half there is: freehire's real slugs look
            # like "inzhener-ooo-chen-hlk3qjfg", and its Cyrillic and Greek
            # titles slugify to nothing. With no URL, the title is all that
            # is left to key on.
            digest_basis = str(url) if url else str(title)
            digest = hashlib.sha1(digest_basis.encode("utf-8")).hexdigest()[:HASH_LEN]
            # A lossy fragment needs the digest to tell two postings apart; an
            # empty title keeps the bare basis (a URL-derived slug, or
            # "untitled-<hash>") exactly as before the fragment rule existed.
            title_slug = f"{fragment}-{digest}" if fragment else (basis or f"untitled-{digest}")
    return f"{company_slug}_{title_slug}"


# A canonical key is "<company-slug>_<title-slug>": lowercase alphanumerics and
# hyphens on either side of exactly one underscore. The underscore is the
# separator, so it is the one character outside the slug alphabet that belongs.
_CANONICAL = re.compile(r"^[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*$")


_HANGUL = re.compile(r"[가-힣]")
# Korean company-form markers that one portal prints and another omits; NFKC
# already turns "㈜" into "(주)", so only the expanded spellings are listed.
_KO_CORP_FORMS = re.compile(r"\((주|유|사|재)\)|주식회사|유한책임회사|유한회사|사단법인|재단법인")
# Leading bracket tags portals prepend to the same posting: "[티빙]", "[서울]".
_LEADING_TAG = re.compile(r"^\s*\[([^\]]*)\]")
# A tag naming the hiring track is kept: "[인턴] X" and "[경력] X" are different jobs.
_TRACK_WORDS = re.compile(r"신입|경력|인턴|계약|정규|파견|전환|시니어|주니어|senior|junior|intern")
# Words portals append to the same title: "백엔드 개발자 채용" vs "백엔드 개발자".
_TRAILING_WORDS = re.compile(r"(채용공고|채용|모집|공고)+$")
_NOT_WORD = re.compile(r"[^0-9a-z가-힣]+")


def _strip_leading_tags(title: str) -> str:
    """Drop leading [..] tags except hiring-track tags, which are kept as plain words."""
    kept = []
    m = _LEADING_TAG.match(title)
    while m:
        if _TRACK_WORDS.search(m.group(1)):
            kept.append(m.group(1))
        title = title[m.end():]
        m = _LEADING_TAG.match(title)
    return " ".join(kept + [title])


def _ko_normal(text: str, company: bool = False) -> str:
    """Spelling-insensitive form of a Korean company or title, for equality checks only.

    Input: the raw string and whether it is a company name. Output: NFKC,
    casefolded text keeping only Hangul syllables, a-z and digits. A company
    loses its company-form markers; a title loses leading bracket tags (hiring
    track tags such as [경력]/[인턴] are kept) and trailing 채용/모집/공고.
    """
    t = unicodedata.normalize("NFKC", str(text or "")).casefold()
    if company:
        return _NOT_WORD.sub("", _KO_CORP_FORMS.sub("", t))
    return _TRAILING_WORDS.sub("", _NOT_WORD.sub("", _strip_leading_tags(t)))


def find_equivalent(seen: dict, company: str, title: str) -> str | None:
    """The key of an already-seen posting that is the same Korean posting, or None.

    A Hangul title keys on the portal's job id (make_key's non-Latin rule), so
    one posting listed on several Korean portals gets one key per portal and
    reappears as new on every run. A Latin title already keys on company+title;
    this gives Hangul titles the same company+title identity without changing
    make_key. Input: the seen_jobs "seen" object, company, title. Output: the
    first existing key whose normalized company and title both match, or None
    when the title has no Hangul or nothing matches. Location is not compared,
    the same as make_key for Latin titles; /scrape Step 2 consolidates
    same-title postings that differ only by city.
    """
    if not _HANGUL.search(str(title or "")):
        return None
    want = (_ko_normal(company, company=True), _ko_normal(title))
    if not all(want):
        return None
    for key, entry in seen.items():
        if isinstance(entry, dict) and (
            _ko_normal(entry.get("company", ""), company=True), _ko_normal(entry.get("title", ""))
        ) == want:
            return key
    return None


def is_canonical(key: str) -> bool:
    """Structurally safe as a dedup key and as an archive folder name."""
    return bool(key) and bool(_CANONICAL.match(key))


def is_legacy_shape(key: str) -> bool:
    """Old three-part "company_title_location" keys.

    Harmless - they carry no path-breaking character - but they are not what
    make_key produces, so a later run would store the same job under a new key
    and reintroduce a duplicate. Reported apart from real damage so the fix
    stays a decision rather than an automatic rename.
    """
    return bool(key) and key.count("_") > 1 and all(
        re.fullmatch(r"[a-z0-9][a-z0-9-]*", part) for part in key.split("_") if part
    )


def audit(path: Path) -> int:
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"cannot read {path}: {exc}", file=sys.stderr)
        return 1
    seen = doc.get("seen", doc) if isinstance(doc, dict) else doc
    if not isinstance(seen, dict):
        print(f"{path}: expected an object of job entries", file=sys.stderr)
        return 1
    not_objects = [k for k, v in seen.items() if not isinstance(v, dict)]
    if not_objects:
        print(f"{path}: entry is not an object: {not_objects[0]}", file=sys.stderr)
        return 1
    bad_url = [k for k, v in seen.items() if v.get("url") is not None and not isinstance(v["url"], str)]
    if bad_url:
        print(f"{path}: entry url is not a string: {bad_url[0]}", file=sys.stderr)
        return 1

    malformed = [k for k in seen if not is_canonical(k) and not is_legacy_shape(k)]
    legacy = [k for k in seen if is_legacy_shape(k)]
    by_url: dict[str, list[str]] = {}
    for key, entry in seen.items():
        url = (entry.get("url") or "").rstrip("/")
        if url:
            by_url.setdefault(url, []).append(key)
    duplicates = {u: ks for u, ks in by_url.items() if len(ks) > 1}
    # A key that does not match what make_key would produce today is drift, not
    # damage: reported separately so a rename is a choice, never automatic.
    drift = [
        k for k, v in seen.items()
        if is_canonical(k) and k != make_key(v.get("company", ""), v.get("title", ""), v.get("url", ""))
    ]

    print(json.dumps({
        "entries": len(seen),
        "malformed_keys": malformed,
        "legacy_three_part_keys": legacy,
        "duplicate_urls": duplicates,
        "keys_not_matching_current_rule": len(drift),
    }, indent=2, ensure_ascii=False))
    return 1 if (malformed or duplicates) else 0


def _force_utf8_output() -> None:
    """Write UTF-8 whatever the host's default encoding is.

    A piped stdout on Windows defaults to the ANSI code page (cp1252 on most
    Western installs), so printing a company, title or file name outside it
    raised UnicodeEncodeError before the workflow saw any output.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)  # absent on a StringIO under test
        if reconfigure:
            reconfigure(encoding="utf-8")


def main() -> int:
    _force_utf8_output()
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--company")
    ap.add_argument("--title")
    ap.add_argument("--url", default="")
    ap.add_argument("--audit", nargs="?", const=str(STATE), metavar="STATE_JSON")
    ap.add_argument("--state", metavar="STATE_JSON",
                    help="reuse the key of an already-seen equivalent posting (Hangul titles only)")
    args = ap.parse_args()

    if args.audit:
        return audit(Path(args.audit))
    if args.company is None or args.title is None:
        ap.error("give --company and --title, or --audit")
    if args.state:
        state = Path(args.state)
        try:
            doc = json.loads(state.read_text(encoding="utf-8")) if state.exists() else {}
        except (OSError, json.JSONDecodeError) as exc:
            print(f"cannot read {state}: {exc}", file=sys.stderr)
            return 1
        seen = doc.get("seen", doc) if isinstance(doc, dict) else {}
        existing = find_equivalent(seen if isinstance(seen, dict) else {}, args.company, args.title)
        if existing:
            print(existing)
            return 0
    print(make_key(args.company, args.title, args.url))
    return 0


if __name__ == "__main__":
    sys.exit(main())
