# 2026 유럽여행 종합정보 사이트

3인 가족 12박 14일 유럽여행(체코·독일·스위스·오스트리아·리히텐슈타인, 2026.7.29~8.11)을 위한
일정/예약/맛집/쇼핑/체크리스트/메모 통합 웹사이트입니다.

## 폴더 구조
```
europe-trip-site/
├── index.html                  메인 페이지 (홈/일정/예약/맛집·쇼핑/체크리스트/메모/설정)
├── css/style.css                 디자인(티켓 스텁 · 여권 스탬프 컨셉)
├── js/app.js                     화면 렌더링 + 로컬 저장 + 구글시트 동기화 로직
├── Code.gs                        구글 Apps Script 백엔드 코드 (복사해서 사용)
├── GOOGLE_SHEETS_SETUP.md         구글시트 연동 설정 가이드 (4단계)
└── data/
    ├── itinerary.json         요약 일정 (14일)
    ├── itinerary_detail.json  상세 일정 (식사·팁 포함, 13일)
    ├── reservations.json      숙소/렌트/투어/버스 예약 및 비용
    ├── food.json               프라하·드레스덴 맛집/교통 정보
    ├── shopping.json           국가·도시별 쇼핑 리스트
    └── checklist.json          출발 전 준비물 체크리스트
```

## 로컬에서 미리보기
`index.html`을 더블클릭해서 바로 열면 브라우저 보안 정책상 `data/*.json`을 불러오지 못할 수 있습니다.
아래처럼 간단한 로컬 서버로 실행해주세요.

```bash
cd europe-trip-site
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

## GitHub Pages로 배포하기
1. GitHub에서 새 저장소 생성 (예: `europe-trip-2026`)
2. 이 폴더(`europe-trip-site` 안의 파일들)를 저장소 루트에 업로드/푸시
   ```bash
   cd europe-trip-site
   git init
   git add .
   git commit -m "유럽여행 사이트 초기 배포"
   git branch -M main
   git remote add origin https://github.com/<내계정>/europe-trip-2026.git
   git push -u origin main
   ```
3. GitHub 저장소 → **Settings → Pages**
4. **Branch: main / Folder: / (root)** 선택 후 저장
5. 잠시 후 `https://<내계정>.github.io/europe-trip-2026/` 로 접속 가능
6. 이 URL을 가족 3인 모두의 홈 화면에 바로가기로 추가하면 앱처럼 사용할 수 있습니다.

## 현재 동작 방식 (1~4단계 모두 반영됨)
- 일정 / 예약 / 맛집 / 쇼핑 정보: `data/` 폴더의 JSON을 그대로 불러와 표시 (조회 전용)
- 체크리스트 체크 여부, 예약 완료 토글, 현지 메모/지출 기록:
  - 기본값은 **이 기기의 브라우저(localStorage)에만 저장** (구글시트 설정 전)
  - 오른쪽 위 **⚙ 설정** 화면에서 Google Apps Script 웹앱 URL을 등록하면,
    체크/예약 상태/메모가 **구글시트에 실시간으로 저장·공유**됩니다.
  - 설정 방법은 **`GOOGLE_SHEETS_SETUP.md`** 문서를 참고하세요. (약 5분 소요, 가족 3인 모두 같은 URL 입력)

## 데이터가 바뀌면
일정이나 예약 정보가 수정되면 원본 엑셀을 다시 변환해서 `data/*.json`만 교체하면 됩니다.
(변환 스크립트가 필요하면 다시 요청해주세요.)

## 다음 단계 제안
1. 이 폴더를 GitHub 저장소에 올리고 GitHub Pages로 배포
2. `GOOGLE_SHEETS_SETUP.md`대로 구글시트 연동 설정 (5분)
3. 가족 3인 모두 사이트 접속 후 설정 화면에 동일한 웹앱 URL 입력
4. 출발 전까지 체크리스트를 함께 채워나가고, 여행 중에는 메모·가계부를 실시간 공유
