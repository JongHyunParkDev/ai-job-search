"""Tests for tools/ko_char_count.py - Korean application-form character limits.

Korean portals count a 자기소개서 answer in different units (spaces included,
spaces excluded, CP949 bytes) and some count a line break as two characters,
so one number is not enough to know whether an answer fits. These pin each
count, the answer splitting, the blank-line check portals warn about, and the
exit codes the workflow relies on.
"""
import json
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from ko_char_count import measure, split_answers  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
TOOL = REPO / "tools" / "ko_char_count.py"


def run(args, stdin=""):
    return subprocess.run([sys.executable, str(TOOL), *args], input=stdin.encode("utf-8"),
                          capture_output=True, timeout=30)


class Measure(unittest.TestCase):
    def test_counts_each_unit(self):
        m = measure("안녕 하세요\nAB")
        self.assertEqual(m["chars"], 9)        # 5 Hangul + 1 space + 1 break + 2 Latin
        self.assertEqual(m["chars_crlf"], 10)  # the break counted as CR LF
        self.assertEqual(m["nospace"], 7)
        self.assertEqual(m["cp949"], 14)       # Hangul 2 bytes each, others 1
        self.assertEqual(m["cp949_crlf"], 15)  # plus one byte for the CR of the break
        self.assertEqual(m["utf8"], 19)        # Hangul 3 bytes each
        self.assertEqual(m["blank_lines"], 0)

    def test_blank_line_runs(self):
        self.assertEqual(measure("가\n\n나")["blank_lines"], 1)
        self.assertEqual(measure("가\n \n나\n\n\n다")["blank_lines"], 2)
        self.assertEqual(measure("가\n나")["blank_lines"], 0)


class Split(unittest.TestCase):
    def test_titles_and_separators(self):
        text = "# 1. 지원 동기\n첫 답변\n---\n# 2. 강점\n\n둘째 답변\n"
        self.assertEqual(split_answers(text), [("1. 지원 동기", "첫 답변"), ("2. 강점", "둘째 답변")])

    def test_untitled_and_crlf_and_bom(self):
        self.assertEqual(split_answers("﻿답변 하나\r\n둘째 줄\r\n"), [("", "답변 하나\n둘째 줄")])

    def test_empty_chunks_dropped(self):
        self.assertEqual(split_answers("---\n\n---\n내용\n---\n"), [("", "내용")])


class Cli(unittest.TestCase):
    def test_within_limit_exits_0(self):
        r = run(["--limit", "10"], "# Q1\n가나다")
        self.assertEqual(r.returncode, 0)
        self.assertIn("OK #1 Q1", r.stdout.decode("utf-8"))

    def test_over_limit_exits_1(self):
        r = run(["--limit", "2"], "가나다")
        self.assertEqual(r.returncode, 1)
        self.assertIn("FAIL", r.stdout.decode("utf-8"))

    def test_mode_changes_what_is_limited(self):
        self.assertEqual(run(["--limit", "3", "--mode", "nospace"], "가 나 다").returncode, 0)
        self.assertEqual(run(["--limit", "3"], "가 나 다").returncode, 1)
        self.assertEqual(run(["--limit", "5", "--mode", "cp949"], "가나다").returncode, 1)

    def test_blank_line_flag(self):
        self.assertEqual(run([], "가\n\n나").returncode, 0)
        self.assertEqual(run(["--no-blank-lines"], "가\n\n나").returncode, 1)

    def test_json_output(self):
        out = json.loads(run(["--json", "--limit", "100"], "# A\n가\n---\n# B\n나다").stdout.decode("utf-8"))
        self.assertEqual([a["title"] for a in out["answers"]], ["A", "B"])
        self.assertEqual(out["answers"][1]["chars"], 2)

    def test_empty_input_exits_1(self):
        r = run([], "\n---\n")
        self.assertEqual(r.returncode, 1)
        self.assertIn("no answer", r.stderr.decode("utf-8"))

    def test_reads_file(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "a.txt"
            p.write_text("가나", encoding="utf-8")
            self.assertEqual(run(["--in", str(p), "--limit", "2"]).returncode, 0)


if __name__ == "__main__":
    unittest.main()
