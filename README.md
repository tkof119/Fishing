# 솔루나 실전낚시 PRO

월령, 기상, 수온 추정, 시간대별 피딩 확률을 보여주는 낚시 출조 예측 웹앱입니다.

## 파일 구성

- `index.html` : 앱 전체 코드
- `icon.svg` : 앱 아이콘
- `manifest.json` : PWA 설정
- `README.md` : 설명 파일

## GitHub Pages 게시 방법

1. 새 GitHub 저장소를 만듭니다.
2. 이 폴더 안의 파일을 모두 업로드합니다.
3. 저장소의 **Settings → Pages**로 이동합니다.
4. Source를 `Deploy from a branch`로 설정합니다.
5. Branch는 `main`, Folder는 `/root`로 선택합니다.
6. 잠시 후 제공되는 Pages 주소로 접속합니다.

## 참고

- 날씨 데이터는 Open-Meteo API를 사용합니다.
- 실제 수온/수위 API는 공공데이터 키 또는 자체 서버가 필요합니다.
- API 연결이 없으면 기온 기반 추정값으로 표시됩니다.

작성자 : 노론리 한량
