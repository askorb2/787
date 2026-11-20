# B787 RATING

B787 Type Rating FCOM 문제 은행을 바탕으로 한 모바일 퀴즈 PWA입니다. 빌드 도구 없이 정적 파일
(`index.html`, `app.js`, `logic.js`, `style.css`, `data/questions.json`, `data/img/*.jpg`)만으로
동작하며, 서비스 워커로 오프라인에서도 열립니다.

## ⚠️ 배포 전 꼭 확인하세요 — GitHub Pages는 "비공개"가 아닙니다

레포지토리를 private로 만들어도 **GitHub Pages로 배포한 사이트 자체는 (무료 요금제 기준) URL을 아는
누구나 볼 수 있습니다.** private 레포는 "소스 코드 저장소"만 비공개로 만들 뿐, Pages 사이트의 접근을
제한하지 않습니다 (GitHub Enterprise 등 유료 요금제의 "private Pages" 기능이 있어야 접근 제한이 가능).

`data/questions.json`과 `data/img/`에는 FCOM 문제·해설·원문 이미지가 그대로 들어 있으므로, Pages로
배포하면 이 내용이 사실상 공개된다는 뜻입니다. 저작권이 걱정된다면:

- GitHub Pages 대신 **비공개로 유지되는 방법**(예: 로컬에서만 `python3 -m http.server`로 열어 쓰기,
  또는 접근 제어가 되는 사설 호스팅)을 쓰거나,
- Pages로 배포하되 **URL을 공유하지 않고 개인 용도로만 사용**하거나,
- 유료 GitHub 요금제의 private Pages 기능을 사용하세요.

이 저장소의 `.gitignore`는 원본 PDF(`source/`)는 커밋하지 않도록 이미 제외해 두었지만, 추출된
`data/questions.json`과 `data/img/`는 앱 동작에 필요하므로 커밋 대상입니다.

## 로컬에서 실행

```bash
python3 -m http.server 8000
# 이후 http://localhost:8000 접속
```

## 테스트

```bash
npm test                 # 로직 단위 테스트 (Node 내장 테스트 러너)
npx playwright install chromium   # 최초 1회만
npm run test:ui          # 화면 스크린샷/레이아웃 테스트 (Playwright)
node scripts/audit-data.js        # data/questions.json 데이터 감사
```

## GitHub Pages로 배포하기

1. GitHub에서 새 레포지토리를 만듭니다 (위 경고를 읽었다면 private/public은 자유).
2. 이 폴더에서:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<사용자명>/<레포이름>.git
   git push -u origin main
   ```
3. GitHub 레포 페이지 → **Settings → Pages** → Source를 "Deploy from a branch"로,
   Branch는 `main` / `/ (root)`로 설정 후 저장합니다.
4. 1~2분 후 `https://<사용자명>.github.io/<레포이름>/`에서 접속할 수 있습니다.
5. `manifest.webmanifest`의 `start_url`과 `scope`는 상대경로(`./`)로 되어 있어 레포 이름이 바뀐
   서브경로(`/<레포이름>/`)에 배포되어도 그대로 동작합니다.

### 업데이트할 때

문제 데이터나 코드를 바꾼 뒤 다시 `git add . && git commit && git push`만 하면 Pages가 자동으로
재배포됩니다. 서비스 워커 캐시 때문에 기존 사용자 화면에 즉시 반영되지 않을 수 있으니, 파일을 바꿀
때마다 `sw.js`의 `CACHE_VERSION` 값을 올려주세요 (예: `b787quiz-v1` → `b787quiz-v2`).

## 폰 홈 화면에 추가하기 (Android Chrome 기준)

1. 배포된 주소(또는 로컬 서버 주소)를 Chrome으로 엽니다.
2. 우측 상단 **⋮ (메뉴)** → **"홈 화면에 추가"** (또는 "앱 설치") 선택.
3. 이름 확인 후 추가하면 홈 화면에 아이콘이 생기고, 이후에는 일반 앱처럼 전체화면으로 실행됩니다.
4. 처음 한 번 온라인 상태로 열어야 서비스 워커가 모든 문제·이미지를 캐시합니다. 그 이후에는
   비행기 모드 등 오프라인 상태에서도 정상적으로 열립니다.

## 기록 저장에 대한 주의

**풀이 기록(통계, 오답 여부, 진행 상황)은 이 폰의 이 브라우저(또는 홈 화면 앱)에만 저장됩니다.**
Chrome 앱 데이터를 지우거나, 브라우저를 바꾸거나, 다른 기기에서 열면 기록이 보이지 않습니다.

백업하려면 홈 화면 → **기록 내보내기**를 눌러 나온 텍스트를 메모 앱 등에 복사해두고, 나중에
**기록 가져오기**에 붙여넣어 복원하세요.

## 데이터 추출 (1단계)

`source/`에 원본 PDF를 두고 `python scripts/extract.py`를 실행하면 `data/questions.json`,
`data/img/*.jpg`, `data/report.md`가 생성됩니다. 자세한 내용은 `CLAUDE.md`를 참고하세요.

## 새 문제집 만들기 (다른 PDF로 재사용)

앱(`index.html`, `app.js`, `logic.js`, `style.css`, `sw.js`)은 문제 내용과 무관하게 `data/questions.json`만
읽습니다. 다른 문제집으로 쓰려면 **앱 코드는 그대로 두고** 아래만 바꾸면 됩니다.

1. **폴더 복사** — 이 저장소를 새 폴더(새 레포)로 복사합니다.
2. **`config.js` 수정** — `title`(앱 제목), `storageKey`·`cachePrefix`(문제집마다 다르게! 같은 도메인에
   여러 문제집을 올리면 이 값이 같을 때 기록이 섞입니다), `optionLabels`(보기 표시), `versions`(이력 초기화).
3. **`manifest.webmanifest`** 의 `name`/`short_name`/`description`, **아이콘**(`icon.svg`, `icon-192.png`,
   `icon-512.png`) 교체.
4. **문제 데이터 만들기** — 새 PDF를 `source/`에 넣고 추출 스크립트를 작성해 `data/questions.json`
   (+ 해설 이미지가 있으면 `data/img/`)을 생성합니다. `scripts/extract.py`는 **B787 PDF 양식 전용**이므로
   양식이 다르면 새로 만들어야 합니다 (예: `scripts/extract_<이름>.py`). 출력 형식만 지키면 됩니다:

   ```json
   [{ "id": "q1", "ch": "단원명", "code": "1-1", "q": "문제",
      "ref": "출처 (선택)", "opts": ["보기1", "보기2", "보기3", "보기4"], "ans": 0,
      "exp": [{"t": "html", "v": "<p>해설</p>"}, {"t": "img", "v": "img/p5.jpg"}] }]
   ```
   - `id`: 고유, 영문/숫자/`-`/`_`만. 배열 순서 = 앱의 "번호순".
   - `opts`: 2개 ~ `optionLabels` 개수. `ans`: 정답 보기의 0부터 시작하는 번호.
   - `exp`: 해설 없으면 `[]`. 이미지 경로는 `data/` 기준.
5. **검사** — `node scripts/validate-questions.js` 가 오류 0이면 앱에서 그대로 동작합니다.
   이어서 `npm test && npm run test:ui` (UI 테스트는 문항 수·ID를 데이터에서 읽으므로 수정 불필요).
6. **정답 검수** — 추출이 정답 표시(색 박스·밑줄 등)를 제대로 잡았는지 원본과 일부 대조해 보세요.
   B787 때는 `scripts/audit-answers.js`, `data/fcom-crosscheck-report.md` 같은 검수를 거쳤습니다.

> Claude Code로 진행할 때: 새 PDF를 `source/`에 넣고 "이 PDF로 questions.json 추출 스크립트 만들어줘,
> `scripts/validate-questions.js` 통과하게" 라고 요청하면 됩니다. 어떤 표시가 정답인지(빨간 박스, 별도
> 정답표 페이지 등) 미리 알려주면 빠릅니다.
