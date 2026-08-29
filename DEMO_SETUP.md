# 완판e Portable Demo Setup

이 ZIP에는 실제 `.env`, API key, secret이 들어 있지 않습니다. 새 노트북에서 아래 순서대로 설정합니다.

## 0. 준비 사항

- Node.js `20.19.4+`, `22.13.0+`, 또는 `24.3.0+` (`22 LTS` 권장)
- npm 및 인터넷 연결
- 배포되어 있는 Supabase 프로젝트의 URL과 anon key
- Kakao Maps JavaScript key

Kakao Developers의 해당 앱에서 Web 사이트 도메인에 `http://localhost:8081`을 등록해야 지도가 표시됩니다.

## 1. 의존성 설치

ZIP을 푼 폴더에서 실행합니다.

```powershell
npm install
```

## 2. `.env` 설정

예시 파일을 복사합니다.

```powershell
Copy-Item .env.example .env
```

macOS/Linux에서는 다음 명령을 사용합니다.

```bash
cp .env.example .env
```

생성된 `.env`에 아래 세 변수의 값을 입력합니다. 변수 이름은 그대로 두고 `=` 뒤에 각 값을 넣습니다.

```dotenv
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY=
```

`EXPO_PUBLIC_*` 값은 웹 클라이언트 번들에 포함될 수 있는 공개 클라이언트 설정만 사용합니다. `.env`를 커밋하거나 공유하지 마세요.

## 3. 웹 데모 실행

```powershell
npx expo start --web --port 8081
```

브라우저가 자동으로 열리지 않으면 `http://localhost:8081`에 접속합니다. 환경변수를 바꾼 경우 Expo를 종료한 뒤 같은 명령으로 다시 시작합니다.

## Supabase Edge Function용 서버 변수

아래 변수는 현재 소스에서 Edge Function이 참조하지만, 새 노트북의 Expo `.env`에는 넣지 않습니다. 이미 배포된 Supabase 함수를 사용하는 데모라면 노트북에서 별도 설정할 필요가 없습니다.

```dotenv
GEMINI_API_KEY=
NAVER_NEWS_CLIENT_ID=
NAVER_NEWS_CLIENT_SECRET=
DATA_GO_KR_SERVICE_KEY=
KAKAO_REST_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`GEMINI_API_KEY`, `NAVER_NEWS_CLIENT_ID`, `NAVER_NEWS_CLIENT_SECRET`, `DATA_GO_KR_SERVICE_KEY`, `KAKAO_REST_API_KEY`는 Supabase 프로젝트의 Edge Function secret으로만 설정합니다. 배포된 Edge Function에서는 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`가 Supabase에 의해 제공됩니다.
