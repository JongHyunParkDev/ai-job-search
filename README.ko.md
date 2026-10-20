# AI Job Search - 한국판 (Korean edition)

[MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search)를 한국 취업 시장에 맞게 고친 포크입니다(`ko-market` 브랜치).
Claude Code로 내 프로필을 만들고, 채용공고를 검색해 적합도를 평가하고, 공고에 맞춘 이력서와 자기소개서를 쓰고, 면접을 준비하는 흐름은 원본과 같습니다.
이 포크는 여기에 **한국 채용 포털 검색 스킬**과 **한글 이력서·자기소개서 템플릿**을 더했습니다.

> 이 프로젝트는 Anthropic이나 각 채용 포털과 관련이 없는 독립 오픈소스입니다.
> 원작자: [Mads Lorentzen](https://github.com/MadsLorentzen) (MIT 라이선스).
> 한국판에 관한 문의는 원본 저장소가 아니라 이 포크로 해 주세요.

<p align="center">
  <a href="https://ko-fi.com/madslorentzen"><img src="https://storage.ko-fi.com/cdn/kofi3.png?v=6" alt="원작자 후원 (Ko-fi)" height="40"></a>
  <br><sub>원작자 후원</sub>
</p>
<p align="center">
  <a href="https://buymeacoffee.com/eomgr886"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-%ED%95%9C%EA%B5%AD%ED%8C%90-FFDD00?logo=buymeacoffee&logoColor=black" alt="한국판 편집자 후원 (Buy Me a Coffee)" height="28"></a>
  <br><sub>한국판 편집자 후원</sub>
</p>

## 한국 포털 지원 현황

| 포털 | 스킬 | 기본 상태 | 검색 방식 | 비고 |
|---|---|---|---|---|
| 사람인 | `saramin-search` | ✅ 켜짐 | 공개 검색 페이지(HTML) | `--location` 지원(서울, 판교, 강남, 부산 등) |
| 인크루트 | `incruit-search` | ✅ 켜짐 | 공개 검색 페이지(HTML, EUC-KR) | 지역은 검색어에 붙여 거릅니다. 상세는 요약(약 200자)만 제공합니다 |
| 잡코리아 | `jobkorea-search` | ⏸ 꺼짐 | 공개 검색 페이지(SSR 데이터) | 이용약관을 확인하지 못했고 크롤링 분쟁 이력이 있어 직접 켜야 합니다. 지역 필터는 없습니다 |
| 원티드 | `wanted-search` | ⏸ 꺼짐 | 공개 JSON API | robots.txt를 읽을 수 없어(모든 클라이언트에 403) 허용 여부가 확인되지 않았습니다. 게시일 정보는 없습니다 |
| 잡플래닛 | `jobplanet-search` | 🧪 실험적·꺼짐 | 공개 JSON API | 현재 Bun의 요청을 Cloudflare가 차단해서 실제 검색이 되지 않습니다. 우회는 하지 않습니다 |
| 링크드인 | `linkedin-search` (원본) | ✅ 켜짐 | 공개 jobs-guest | `-l "Seoul, South Korea"`로 한국 공고를 검색할 수 있습니다 |
| 직행 | - | 미지원 | - | 검색 결과를 robots.txt가 막은 API로만 제공해서 만들지 않았습니다 |

- 모든 포털 스킬은 원본의 규격(`search`/`detail`, `--format json|table|plain`, 오류는 stderr JSON + exit 1, 429/5xx 백오프, 런타임 의존성 0, 자체 테스트)을 따릅니다.
- 요청은 도구 이름을 밝힌 정직한 User-Agent로만 보냅니다. 브라우저 위장이나 봇 차단 우회는 하지 않습니다.
- 꺼진 포털을 쓰려면 해당 `SKILL.md`의 `enabled: false`를 `true`로 바꿉니다. 각 파일의 **⚠️ Personal use only** 안내를 먼저 읽어 주세요.

### ⚠️ 개인 용도로만 사용해 주세요

국내 채용 포털의 이용약관은 대부분 수집한 정보의 복제·제3자 제공·영리 이용을 금지합니다. 이 스킬들은 **본인의 구직 활동을 위해 적은 양을 조회하는 용도**로만 만들었습니다. 대량 수집, 재배포, 상업적 이용은 하지 마세요. 사용에 따른 책임은 사용자 본인에게 있습니다.

## 시작하기

준비물: [Claude Code](https://claude.com/claude-code), [Bun](https://bun.sh), Python 3, (PDF가 필요하면) MiKTeX 또는 TeX Live

```bash
git clone -b ko-market https://github.com/JongHyunParkDev/ai-job-search.git
cd ai-job-search
python tools/install_portal_clis.py
claude
```

Claude Code 안에서 다음 순서로 진행합니다.

1. `/setup`: 이력서·링크드인 내보내기·인터뷰로 프로필을 만듭니다. 시장을 한국으로, 언어를 한국어로 답하면 됩니다.
2. `/scrape`: 켜져 있는 포털을 모두 검색하고 중복을 제거한 뒤 적합도순으로 보여 줍니다.
3. `/apply <공고 URL>`: 공고에 맞춘 이력서와 자기소개서를 만들고, 별도 에이전트가 검토합니다.
4. `/interview`: 면접 준비 자료를 만듭니다.

> [!IMPORTANT]
> `/setup`은 이름, 연락처, 경력, 희망 연봉 같은 **개인정보를 Git이 추적하는 파일에 씁니다.** 공개 포크에 그대로 push하면 개인정보가 공개됩니다.
> 실제 구직용으로 쓰신다면 이 저장소를 `upstream`으로 둔 **비공개 저장소**를 만들어 쓰세요([SETUP.md 8절](SETUP.md#8-pulling-upstream-updates-into-your-fork)).

### 포털 CLI 직접 실행 예시

```bash
bun run .agents/skills/saramin-search/cli/src/cli.ts search -q "백엔드 개발자" -l "서울,판교" --limit 10 --format table
bun run .agents/skills/incruit-search/cli/src/cli.ts search -q "데이터 분석" -l 부산 --jobage 14 --format table
bun run .agents/skills/linkedin-search/cli/src/cli.ts search -q "backend" -l "Seoul, South Korea" --format table
```

## 한글 이력서·자기소개서

| 파일 | 엔진 | 설명 |
|---|---|---|
| `cv/main_example_ko.tex` | lualatex | 원본 moderncv 이력서와 같은 구성에 한글 글꼴 대체(fallback)를 넣은 버전입니다 |
| `cover_letters/cover_example_ko.tex` | xelatex | `\documentclass[korean]{cover}`. xeCJK로 한글을 표시합니다 |

- 설치된 한글 글꼴을 자동으로 고릅니다. 순서는 Noto Sans CJK KR → 나눔고딕 → 맑은 고딕 → Apple SD Gothic Neo → (은돋움) → Noto Sans KR입니다.
  - Windows에 기본으로 들어 있는 `NotoSansKR-VF.ttf`는 가변 글꼴이라 xelatex가 PDF에 넣지 못합니다. 그래서 순서의 맨 뒤에 둡니다.
- 자기소개서는 합니다체, `YYYY년 M월 D일` 날짜, "감사합니다." 맺음말, "[이름] 드림" 서명을 기본으로 합니다.
- 국내 대기업·공기업처럼 회사 양식(성장과정, 지원동기, 직무역량, 입사 후 포부)과 글자수 제한이 있는 경우에는 편지 대신 양식에 맞춰 답변을 작성하도록 안내합니다.

```bash
cd cv && lualatex -interaction=nonstopmode main_example_ko.tex
cd ../cover_letters && xelatex -interaction=nonstopmode cover_example_ko.tex
```

## 원본과의 관계

- 원본 저장소를 주기적으로 병합해서 따라갑니다. 한국판에서 바꾼 내용은 다음과 같습니다.
  - 포털 스킬 폴더 추가
  - 한글 템플릿 2개 추가와 `cover.cls`의 `korean` 옵션
  - 템플릿 지침(`05`, `06`)의 한국어 안내
  - `.claude/settings.json`과 `tools/security_guards.py`에 포털 권한 등록
- 원본의 업데이트 확인 도구(`tools/check_upstream_updates.py`)도 그대로 쓸 수 있습니다.
- 기능 전반에 대한 설명은 원본 [README.md](README.md)를 참고하세요.
