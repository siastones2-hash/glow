# ✨ GLOW SMM Panel

## 로컬 실행

```bash
npm install
npm start
```

브라우저에서 http://localhost:3000 접속

---

## Render.com 배포 (무료)

1. **GitHub에 업로드**
   - github.com 가입
   - New Repository → `glow-panel`
   - 이 폴더 파일들 전부 업로드

2. **Render.com 배포**
   - render.com 가입
   - New → Web Service
   - GitHub 저장소 연결
   - 설정:
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Plan:** Free
   - Deploy 클릭

3. **환경변수 설정 (Render)**
   - Environment → Add Environment Variable
   - `NODE_ENV` = `production`

---

## 관리자 계정

- 이메일: `leestones@naver.com`
- 비밀번호: `6933`

---

## 배포 후 설정

1. 관리자 로그인
2. 설정 → Peakerr API 키 입력 → 저장 → 서비스 동기화
3. 설정 → 텔레그램 알림 설정
4. 설정 → 카카오톡 링크 및 계좌 확인

---

## 기술 스택

- Node.js + Express
- SQLite (better-sqlite3)
- bcryptjs (비밀번호 암호화)
- express-session (로그인 세션)
- node-fetch (Peakerr API 호출)
