# 🎮 LOL_DB 📑 (League of Legends Database) 

라이엇 게임즈(Riot Games) Data Dragon API와 Meraki Analytics API를 유기적으로 연동하여, 리그 오브 레전드 챔피언들의 기본 스탯 및 스킬 정보(피해량, AD/AP 계수 등)와 아이템 정보를 한눈에 확인할 수 있는 초밀착형 OP.GG 스타일 데이터베이스 웹 서비스입니다.

---

## ✨ 핵심 기능

1. **초밀착형 플랫 디자인 (Compact UI)**
   - 화면 공간을 극대화하기 위해 챔피언 및 아이템 목록을 조밀한 그리드(56px 크기 기반)로 설계하여 한눈에 160명이 넘는 모든 챔피언을 확인하기 용이합니다.
   - 반응형 레이아웃을 통해 좌측에는 촘촘한 리스트가, 우측에는 선택한 대상의 상세 스펙이 고정 패널 형태로 즉각 렌더링됩니다.

2. **Meraki Analytics 기반 정밀 스킬 스펙 분석**
   - 기존의 단순한 텍스트 설명을 넘어, 스킬 설명 하단에 가독성이 높은 점선 테두리 정보 박스를 제공합니다.
   - 각 스킬별 기본 피해량 수치와 함께 **공격력(AD) 계수(황색)**, **주문력(AP) 계수(자색)**, **체력 계수(적색)** 등을 직관적인 시각적 컬러 코드로 완벽 분리하여 표기합니다.

3. **아이템 가격순 정렬 및 필터링**
   - 소지 골드량 및 빌드 상황에 맞춰 빠르게 아이템을 탐색할 수 있도록 전체 아이템 목록이 기본적으로 가격 높은 순으로 자동 정렬됩니다.
   - 챔피언뿐만 아니라 아이템 정보 역시 즉시 매칭되어 상세 능력치와 조합 비용, 조합식 등을 손쉽게 확인할 수 있습니다.

4. **네트워크 장애 및 속도 제한(Rate Limiting) 극복**
   - Meraki API의 2MB에 달하는 대용량 전체 데이터셋을 로컬 디렉토리에 내장하여 단 1회만 고속 로드하도록 설계하였습니다.
   - 무료 CORS 프록시의 불안정성과 429 Rate Limiting 에러를 원천 차단하여 로딩 지연 없는 초고속 반응 속도를 구현하였습니다.
   - 영문 명칭 불일치 챔피언(예: `MonkeyKing` ↔ `Wukong`, `Nunu` ↔ `Nunu & Willump` 등)의 데이터를 고유 숫자 Key 대조 매핑 기술을 적용하여 100% 일치시켰습니다.

5. **자동 깃허브 동기화 파이프라인 (Auto GitHub Sync)**
   - 로컬 작업 공간에서 소스코드를 수정하고 저장하면, 변경 사항을 실시간으로 감지하여 GitHub 원격 저장소(`LOL_DB`)에 자동으로 커밋 및 푸시하는 자동화 파이프라인이 탑재되어 있습니다.

---

## 🚀 시작하기

### 1. 로컬 개발 서버 구동
본 프로젝트는 API 데이터 호출을 위해 로컬 웹 서버 환경이 필요합니다. 아래 명령어로 가볍게 서버를 시작할 수 있습니다.

```bash
# http-server를 이용한 8080 포트 구동
npx -y http-server -p 8080
```

서버 구동 후 브라우저에서 `http://localhost:8080`으로 접속하시면 즉시 웹 앱을 사용하실 수 있습니다.

### 2. 자동 깃허브 동기화 가동
로컬에서 수정하는 소스코드가 실시간으로 GitHub에 자동 업로드되도록 하려면 아래 명령어를 백그라운드 터미널에 실행해 두시면 됩니다.

```bash
node git-watcher.js
```

이 스크립트가 실행 중일 때는 파일 저장 후 약 3초 뒤에 자동으로 `git add`, `git commit`, `git push` 단계가 안전하게 진행됩니다.

---

## 🛠️ 기술 스택

- **Frontend**: HTML5, Vanilla CSS3 (Custom Variables, CSS Grid, Flexbox), Vanilla JavaScript (ES6+)
- **API Data**: Riot Games Data Dragon API, Meraki Analytics API (Local Cached Version)
- **Dev Automation**: Node.js File System Watcher (`git-watcher.js`)
- **Version Control**: Git & GitHub
