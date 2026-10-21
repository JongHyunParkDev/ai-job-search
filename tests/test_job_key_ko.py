"""Tests for job_key.py's Korean cross-portal equivalence (ko-market).

A Hangul title keys on the portal's job id, so one posting listed on Saramin,
JobKorea and Incruit got three keys and resurfaced as new on every /scrape.
`--state` reuses the key of an already-seen entry with the same normalized
company and title. These pin the normalization, the Hangul-only scope (Latin
titles and make_key itself are unchanged), and the CLI behaviour.
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from job_key import _ko_normal, find_equivalent, make_key  # noqa: E402

TOOL = Path(__file__).resolve().parent.parent / "tools" / "job_key.py"

SEEN = {
    "company-442783_55100001": {"company": "(주)예시소프트", "title": "웹/앱 백엔드 개발자 채용", "url": "https://www.saramin.co.kr/x?rec_idx=55100001"},
    "acme_backend-engineer": {"company": "Acme", "title": "Backend Engineer", "url": "https://example.test/1"},
}


class Normal(unittest.TestCase):
    def test_company_form_markers_are_ignored(self):
        same = {_ko_normal(c, company=True) for c in ["(주)예시소프트", "㈜예시소프트", "주식회사 예시소프트", "예시소프트"]}
        self.assertEqual(same, {"예시소프트"})

    def test_title_tags_spacing_and_punctuation_are_ignored(self):
        self.assertEqual(_ko_normal("[예시소프트] 웹/앱 백엔드 개발자 채용"), _ko_normal("웹·앱  백엔드 개발자 채용"))

    def test_hiring_track_tags_are_kept(self):
        # "[인턴] X" and "[경력] X" are different jobs; merging them would lose one.
        self.assertNotEqual(_ko_normal("[인턴] 백엔드 개발자"), _ko_normal("[경력] 백엔드 개발자"))
        self.assertEqual(_ko_normal("[예시소프트][경력] 백엔드 개발자"), _ko_normal("[경력] 백엔드 개발자"))

    def test_trailing_recruiting_words_are_ignored(self):
        same = {_ko_normal(t) for t in ["백엔드 개발자", "백엔드 개발자 채용", "백엔드 개발자 모집", "백엔드 개발자 채용공고"]}
        self.assertEqual(len(same), 1)

    def test_different_titles_stay_different(self):
        self.assertNotEqual(_ko_normal("백엔드 개발자"), _ko_normal("프론트엔드 개발자"))


class Equivalent(unittest.TestCase):
    def test_same_posting_on_another_portal_reuses_the_key(self):
        self.assertEqual(find_equivalent(SEEN, "㈜예시소프트", "[예시소프트] 웹/앱 백엔드 개발자"), "company-442783_55100001")

    def test_other_company_title_or_track_does_not_match(self):
        self.assertIsNone(find_equivalent(SEEN, "㈜다른회사", "웹/앱 백엔드 개발자 채용"))
        self.assertIsNone(find_equivalent(SEEN, "㈜예시소프트", "데이터 엔지니어 채용"))
        self.assertIsNone(find_equivalent(SEEN, "㈜예시소프트", "[인턴] 웹/앱 백엔드 개발자 채용"))

    def test_mixed_hangul_latin_title_is_in_scope(self):
        seen = {"k1": {"company": "예시소프트", "title": "백엔드 Developer (Java)"}}
        self.assertEqual(find_equivalent(seen, "(주)예시소프트", "백엔드 developer java"), "k1")

    def test_latin_titles_are_out_of_scope(self):
        self.assertIsNone(find_equivalent(SEEN, "Acme", "Backend Engineer"))

    def test_make_key_itself_is_unchanged(self):
        self.assertEqual(make_key("SecuriON", "안드로이드 앱(악성코드) 분석가 채용",
                                  url="https://kr.linkedin.com/jobs/view/x-4461771225"), "securion_4461771225")


class Cli(unittest.TestCase):
    def run_tool(self, state_doc, *args):
        with tempfile.TemporaryDirectory() as d:
            state = Path(d) / "seen_jobs.json"
            if state_doc is not None:
                state.write_text(json.dumps(state_doc, ensure_ascii=False), encoding="utf-8")
            r = subprocess.run([sys.executable, str(TOOL), *args, "--state", str(state)],
                               capture_output=True, timeout=30)
            return r.returncode, r.stdout.decode("utf-8").strip()

    def test_reuses_existing_key(self):
        rc, out = self.run_tool({"seen": SEEN}, "--company", "㈜예시소프트", "--title", "웹/앱 백엔드 개발자 채용",
                                "--url", "https://www.jobkorea.co.kr/Recruit/GI_Read/50191524")
        self.assertEqual((rc, out), (0, "company-442783_55100001"))

    def test_falls_back_to_make_key_when_nothing_matches(self):
        url = "https://www.jobkorea.co.kr/Recruit/GI_Read/50191524"
        rc, out = self.run_tool({"seen": SEEN}, "--company", "㈜새회사", "--title", "백엔드 개발자", "--url", url)
        self.assertEqual((rc, out), (0, make_key("㈜새회사", "백엔드 개발자", url)))

    def test_missing_state_file_is_an_empty_state(self):
        rc, out = self.run_tool(None, "--company", "㈜새회사", "--title", "백엔드 개발자")
        self.assertEqual((rc, out), (0, make_key("㈜새회사", "백엔드 개발자")))

    def test_corrupt_state_file_exits_1(self):
        with tempfile.TemporaryDirectory() as d:
            state = Path(d) / "seen_jobs.json"
            state.write_text("{not json", encoding="utf-8")
            r = subprocess.run([sys.executable, str(TOOL), "--company", "가", "--title", "나", "--state", str(state)],
                               capture_output=True, timeout=30)
            self.assertEqual(r.returncode, 1)


if __name__ == "__main__":
    unittest.main()
