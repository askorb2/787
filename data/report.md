# B787 FCOM 추출 리포트
- 총 문항 수: **213**
- 보기 수 분포: {4: 213}
- 정답 인덱스 누락 문제: 0개
- 해설 없는 문제 (15개): ['p74', 'p183', 'p188', 'p198', 'p236', 'p266', 'p283', 'p284', 'p291', 'p305', 'p312', 'p323', 'p364', 'p369', 'p392']

## 추출 중 발견된 이상 항목 (anomalies)
없음.

## 메모
- 변형 출제 메모(96, 196, 238쪽)는 직전 문제(각각 8-1, 14-3, 15-9)의 해설 끝에 "변형 출제:" 문단으로 추가되었다.
- 128쪽: 다·라 보기가 한 줄에 붙어 있던 것을 "라." 기준으로 분리했다.
- 370쪽(14-10-a)은 정답 박스가 존재하여 정상 문제로 처리했다.
- 426쪽 New 섹션의 2문제는 스크립트에 직접 하드코딩했다. 429쪽은 보기가 없어 제외했다.
- 144쪽처럼 보기 라벨이 "나," (마침표 대신 쉼표)로 찍힌 경우도 마커로 인식하도록 정규식을 `[.,]`로 완화했다.
- 39쪽 보기 4 아래에 남아있던 외톨이 숫자 "0" 조각은 페이지 잔여 아티팩트로 보고 버렸다 (순수 숫자만 있는 꼬리 블록은 폐기).

## 무작위 15문항 수기 검증 (정답 박스 vs 추출된 ans, 렌더링 PNG 육안 대조)
seed=20261112, 샘플: p116, p408, p269, p114, p205, p422, p378, p136, p315, p65, p392, p134, p234, p191, p98

| id | code | ans(추출) | 보기 텍스트 | 육안 대조 |
|---|---|---|---|---|
| p116 | 14-1 | 1 | The entry of the correct emergency acces | 일치 |
| p408 | 10-2 | 2 | Mini-map | 일치 |
| p269 | 14-10 | 0 | The forward and side windows are equippe | 일치 |
| p114 | 8-a | 2 | North of 70°N or south of 70°S | 일치 |
| p205 | 14-7 | 3 | Hard alternate mode로 전환 전 Thrust lever를  | 일치 |
| p422 | 10-9 | 2 | Above approximately 20,000 feet altitude | 일치 |
| p378 | 14-14 | 2 | Load relief retraction is limited to fla | 일치 |
| p136 | 14-11 | 3 | Destination airfield altitude +1500 feet | 일치 |
| p315 | 13-8 | 0 | the left engine thrust reverser | 일치 |
| p65 | 14-1 | 2 | To use center tank fuel before wing tank | 일치 |
| p392 | 8-2 | 2 | New frequencies are entered into the scr | 일치 |
| p134 | 14-10 | 2 | Discharge too close to fire as the disch | 일치 |
| p234 | 15-7 | 1 | Between 4° C and 27° C. | 일치 |
| p191 | 14-1 | 2 | That the common core system(CCS) applica | 일치 |
| p98 | 8-2 | 1 | The current date not in data base range  | 일치 |

15/15 모두 렌더링된 페이지 이미지의 빨간 테두리 박스 위치와 추출된 `ans` 인덱스가 일치함을 육안으로 확인했다.

## 한글 띄어쓰기 샘플 5개 대조 (rawdict 재구성 vs pdftotext -enc UTF-8)
| id | 일치 여부 |
|---|---|
| p2 | 일치 (단어/띄어쓰기 동일) |
| p79 | 일치 (단어/띄어쓰기 동일) |
| p205 | 일치 (단어/띄어쓰기 동일) |
| p234 | 일치 (단어/띄어쓰기 동일) |
| p315 | 일치 (단어/띄어쓰기 동일) |
