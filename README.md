# 한량낚시

수정 내용:
- 기압 천 단위 구분 기호 재적용
- Cloudflare Worker에서 기상청 초단기예보(getUltraSrtFcst)를 추가 호출
- 오늘 날짜의 시간대별 자료에 기상청 1시간 단위 예보 반영
- 앱 설치명: 한량낚시

Worker 코드의 `KMA_SERVICE_KEY`에 본인 Decoding 인증키를 넣고 배포하세요.
