#!/usr/bin/env python3
"""Character-limit check for Korean application form answers (자기소개서).

Korean employer portals cap every 자기소개서 question at a number of characters
(typically 500-1,500), and they do not agree on what a "character" is:

  * most count every character including spaces and line breaks (공백 포함),
  * some count only non-whitespace characters (공백 제외),
  * older ASP/EUC-KR systems count bytes, where one Hangul syllable is 2 bytes
    (CP949) while UTF-8 would make it 3.

A line break is counted as one character by most counters but as two (CR LF)
by forms that measure what the browser submits. Several portals also warn that
consecutive line breaks (a blank line) hide the end of the answer in the
printed application, e.g. "한 번에 2칸 이상 줄바꿈은 자제".

This tool reports all of those numbers per answer so the limit is checked the
way the target portal counts, and it fails on a blank line when asked to.

Input: a UTF-8 text file (or stdin) holding one or more answers separated by a
line that is exactly `---` (so an answer itself must not contain such a line).
A first line starting with `#` is the answer's title and is not counted.

Usage:
  python3 tools/ko_char_count.py --in answers.txt --limit 1000
  python3 tools/ko_char_count.py --in answers.txt --limit 1000 --mode nospace --no-blank-lines
  python3 tools/ko_char_count.py --in answers.txt --json

Exit 0 when every answer is within the limit (and has no blank line, with
--no-blank-lines). Exit 1 otherwise, or when no answer is found.
"""

import argparse
import json
import re
import sys
from pathlib import Path

SEPARATOR = "---"  # an answer boundary; a Markdown-style rule, rarely part of an answer
MODES = ("chars", "chars_crlf", "nospace", "cp949", "cp949_crlf", "utf8")


def _force_utf8_output() -> None:
    """Write UTF-8 whatever the host's default encoding is (Windows pipes default to the ANSI code page)."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)  # absent on a StringIO under test
        if reconfigure:
            reconfigure(encoding="utf-8")


def split_answers(text: str) -> list[tuple[str, str]]:
    """Split the input into (title, body) pairs on lines that are exactly `---`.

    Input: the whole file as text. Output: a list of (title, body); the title is
    the text of a leading `#` line (empty when absent) and is excluded from body.
    Leading and trailing blank lines of each body are dropped, inner ones kept.
    """
    text = text.replace("\r\n", "\n").replace("\r", "\n").lstrip("﻿")
    answers = []
    for chunk in re.split(r"(?m)^---[ \t]*$", text):
        lines = chunk.split("\n")
        while lines and not lines[0].strip():
            lines.pop(0)
        title = ""
        if lines and lines[0].lstrip().startswith("#"):
            title = re.sub(r"^\s*#+\s*", "", lines.pop(0)).strip()
        body = "\n".join(lines).strip("\n")
        if body.strip():
            answers.append((title, body))
    return answers


def measure(body: str) -> dict:
    """Count one answer the ways Korean portals do.

    Input: the answer text with "\\n" line breaks. Output: a dict with
    chars (line break = 1), chars_crlf (line break = 2), nospace (no whitespace),
    cp949 / cp949_crlf / utf8 byte counts, and blank_lines (runs of 2+ line breaks).
    """
    breaks = body.count("\n")
    cp949 = sum(len(ch.encode("cp949", errors="replace")) for ch in body)
    return {
        "chars": len(body),
        "chars_crlf": len(body) + breaks,
        "nospace": len(re.sub(r"\s", "", body)),
        "cp949": cp949,
        "cp949_crlf": cp949 + breaks,  # CP949 bytes as submitted with CR LF breaks
        "utf8": len(body.encode("utf-8")),
        "blank_lines": len(re.findall(r"\n[ \t]*\n", body)),
    }


def main(argv=None) -> int:
    """CLI entry point. Input: argv (see module docstring). Output: exit code 0 (all within limit) or 1."""
    _force_utf8_output()
    parser = argparse.ArgumentParser(prog="ko_char_count.py",
                                     description="Check Korean application answers against a character limit.")
    parser.add_argument("--in", dest="infile", type=Path, default=None, help="UTF-8 text file (default: stdin)")
    parser.add_argument("--limit", type=int, default=None, help="maximum allowed in --mode units")
    parser.add_argument("--mode", choices=MODES, default="chars",
                        help="what the portal counts (default: chars, spaces and line breaks included)")
    parser.add_argument("--no-blank-lines", action="store_true", help="fail when an answer contains a blank line")
    parser.add_argument("--json", action="store_true", help="print results as JSON")
    args = parser.parse_args(argv)

    # stdin as UTF-8 bytes: a Windows pipe would otherwise be decoded with the ANSI code page.
    text = args.infile.read_text(encoding="utf-8") if args.infile else sys.stdin.buffer.read().decode("utf-8")
    answers = split_answers(text)
    if not answers:
        print("ko_char_count: no answer found in the input", file=sys.stderr)
        return 1

    results, failed = [], False
    for i, (title, body) in enumerate(answers, 1):
        m = measure(body)
        over = args.limit is not None and m[args.mode] > args.limit
        blank = args.no_blank_lines and m["blank_lines"] > 0
        failed = failed or over or blank
        results.append({"index": i, "title": title, **m, "over_limit": over, "blank_line_violation": blank})

    if args.json:
        print(json.dumps({"mode": args.mode, "limit": args.limit, "answers": results}, ensure_ascii=False, indent=2))
    else:
        for r in results:
            status = "FAIL" if r["over_limit"] or r["blank_line_violation"] else "OK"
            limit = f"/{args.limit}" if args.limit is not None else ""
            print(f"{status} #{r['index']} {r['title'] or '(untitled)'}")
            print(f"    {args.mode}: {r[args.mode]}{limit} | 공백 포함 {r['chars']} (CRLF {r['chars_crlf']}) | "
                  f"공백 제외 {r['nospace']} | CP949 {r['cp949']}B | UTF-8 {r['utf8']}B | 빈 줄 {r['blank_lines']}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
