# 🃏 SCOUT! 온라인 보드게임

스카우트 보드게임의 온라인 멀티플레이어 구현 (React + Firebase Realtime Database)

## 📁 프로젝트 구조

```
scout-game/
├── src/
│   ├── firebase/
│   │   └── config.js          # Firebase 설정 및 DB 함수
│   ├── utils/
│   │   └── gameLogic.js       # 게임 핵심 로직 (순수 함수)
│   ├── components/
│   │   ├── Lobby.jsx          # 메인 로비 (방 만들기/입장)
│   │   ├── GameRoom.jsx       # 대기실 + 게임 진입
│   │   ├── GameBoard.jsx      # 메인 게임 화면
│   │   ├── CardComponent.jsx  # 카드 UI 컴포넌트
│   │   ├── PlayerHand.jsx     # 내 손패
│   │   ├── FieldArea.jsx      # 마당 패 영역
│   │   ├── OtherPlayers.jsx   # 다른 플레이어 패널
│   │   └── ActionPanel.jsx    # 액션 선택 + 점수판
│   ├── styles/
│   │   └── global.css         # 전체 스타일
│   ├── App.jsx
│   └── index.jsx
├── package.json
├── vite.config.js
├── index.html
├── firebase-rules.json        # Firebase 보안 규칙
└── README.md
```

## 🚀 시작하기

### 1. Firebase 프로젝트 설정

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. 새 프로젝트 생성
3. **Realtime Database** 활성화 (테스트 모드로 시작)
4. 프로젝트 설정 > 웹 앱 추가 > SDK 설정 복사

### 2. Firebase 설정 입력

`src/firebase/config.js`의 `firebaseConfig`를 실제 값으로 교체:

```js
const firebaseConfig = {
  apiKey: "실제_API_KEY",
  authDomain: "프로젝트.firebaseapp.com",
  databaseURL: "https://프로젝트-default-rtdb.firebaseio.com",
  projectId: "프로젝트_ID",
  storageBucket: "프로젝트.appspot.com",
  messagingSenderId: "발신자_ID",
  appId: "앱_ID",
};
```

### 3. Firebase 보안 규칙 설정

Firebase Console > Realtime Database > 규칙 탭에 `firebase-rules.json` 내용 붙여넣기

### 4. 설치 및 실행

```bash
cd scout-game
npm install
npm run dev
```

### 5. 배포 (선택)

```bash
npm run build
# dist/ 폴더를 Firebase Hosting, Vercel, Netlify 등에 배포
```

## 🎮 게임 플로우

```
로비 → 방 만들기/입장 → 대기실 (준비) → 게임 시작
          ↑                                    ↓
          └──────────── 다음 라운드 ←── 라운드 종료
```

## 🔧 구현된 기능

- ✅ 방 만들기 / 코드로 입장 / 방 목록 보기
- ✅ 대기실 (준비 상태 표시)
- ✅ 카드 덱 생성 및 배분 (45장, 3~5인)
- ✅ A. 플레이 (조합 유효성 검사, 강도 비교)
- ✅ B. 스카우트 (양끝 카드 가져오기)
- ✅ C. 더블 액션 (스카우트 + 플레이, 라운드당 1회)
- ✅ 손패 위아래 뒤집기 (라운드 시작 시 1회)
- ✅ 라운드 종료 조건 체크
- ✅ 점수 계산 및 누적
- ✅ 실시간 Firebase 동기화
- ✅ 다른 플레이어 손패 뒷면 표시

## 🔨 개선 가능한 부분

- 손패 삽입 위치 선택 UI (스카우트 시 드래그로 위치 지정)
- 더블 액션 UI 흐름 개선
- 연속 스카우트 감지 (라운드 종료 조건 ii)
- 접속 끊김 처리 (onDisconnect 활용)
- 애니메이션 (카드 이동 효과)
- 모바일 터치 최적화
- 방장 재배정 기능
