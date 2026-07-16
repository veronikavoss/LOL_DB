const express = require('express');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const app = express();
const PORT = 8080;

// 로컬 캐시 디렉터리 보장
const CACHE_DIR = path.join(__dirname, 'cache', 'tiers');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Riot API 키 (개발용 - 24시간마다 갱신 필요)
const RIOT_API_KEY = 'RGAPI-c1c92d56-b806-44a5-8a02-dd588b118605';

// 정적 파일 서빙 (index.html, app.js, index.css, champions.json 등)
app.use(express.static(path.join(__dirname)));

// ========================
// Riot API 프록시 엔드포인트
// ========================

// 공통 Riot API 요청 함수 (429 Rate Limit 자동 재시도 포함)
async function riotApiRequest(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      headers: {
        'X-Riot-Token': RIOT_API_KEY
      }
    });

    if (response.status === 429) {
      // Rate Limit 도달 — Retry-After 헤더 기반 대기 후 재시도
      const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
      console.log(`Rate limit 도달, ${retryAfter}초 후 재시도... (${attempt + 1}/${retries})`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      const error = new Error(`Riot API 오류: ${response.status}`);
      error.status = response.status;
      error.body = errorBody;
      throw error;
    }

    return response.json();
  }

  // 모든 재시도 소진
  const error = new Error('Riot API Rate Limit 초과 — 재시도 횟수 소진');
  error.status = 429;
  throw error;
}

// 1. 소환사명#태그 → PUUID 조회 (Account-V1)
app.get('/api/riot/account/:gameName/:tagLine', async (req, res) => {
  try {
    const { gameName, tagLine } = req.params;
    const encodedName = encodeURIComponent(gameName);
    const encodedTag = encodeURIComponent(tagLine);
    const url = `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodedName}/${encodedTag}`;
    const data = await riotApiRequest(url);
    res.json(data);
  } catch (error) {
    console.error('Account API 오류:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 2. PUUID → 소환사 프로필 (Summoner-V4)
app.get('/api/riot/summoner/:puuid', async (req, res) => {
  try {
    const { puuid } = req.params;
    const url = `https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
    const data = await riotApiRequest(url);
    res.json(data);
  } catch (error) {
    console.error('Summoner API 오류:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 3. PUUID → 랭크 정보 (League-V4) 및 티어 히스토리 누적
app.get('/api/riot/league/:puuid', async (req, res) => {
  try {
    const { puuid } = req.params;
    const url = `https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
    const data = await riotApiRequest(url);
    
    // 로컬 티어 이력에 저장 (RANKED_SOLO_5x5 기준)
    const soloQueueData = data.find(entry => entry.queueType === 'RANKED_SOLO_5x5');
    if (soloQueueData) {
      const filePath = path.join(CACHE_DIR, `${puuid}.json`);
      let historyData = {};
      
      if (fs.existsSync(filePath)) {
        const fileContent = await fsPromises.readFile(filePath, 'utf-8');
        try {
          historyData = JSON.parse(fileContent);
        } catch (e) {
          console.error('티어 캐시 파일 파싱 오류:', e);
        }
      }
      
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      historyData[today] = {
        tier: soloQueueData.tier,
        rank: soloQueueData.rank,
        leaguePoints: soloQueueData.leaguePoints
      };
      
      await fsPromises.writeFile(filePath, JSON.stringify(historyData, null, 2), 'utf-8');
    }

    res.json(data);
  } catch (error) {
    console.error('League API 오류:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 3-1. PUUID → 누적 티어 히스토리 반환
app.get('/api/tiers/history/:puuid', async (req, res) => {
  try {
    const { puuid } = req.params;
    const filePath = path.join(CACHE_DIR, `${puuid}.json`);
    
    if (fs.existsSync(filePath)) {
      const fileContent = await fsPromises.readFile(filePath, 'utf-8');
      const historyData = JSON.parse(fileContent);
      res.json(historyData);
    } else {
      res.json({}); // 기록이 없으면 빈 객체 반환
    }
  } catch (error) {
    console.error('Tier History API 오류:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 4. PUUID → 최근 매치 ID 목록 (Match-V5)
app.get('/api/riot/matches/:puuid', async (req, res) => {
  try {
    const { puuid } = req.params;
    const start = req.query.start || 0;
    const count = req.query.count || 20;
    const startTime = req.query.startTime || '';
    let url = `https://asia.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}`;
    if (startTime) {
      url += `&startTime=${startTime}`;
    }
    const data = await riotApiRequest(url);
    res.json(data);
  } catch (error) {
    console.error('Match List API 오류:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 5. 매치ID → 상세 데이터 (Match-V5)
app.get('/api/riot/match/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    const url = `https://asia.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    const data = await riotApiRequest(url);
    res.json(data);
  } catch (error) {
    console.error('Match Detail API 오류:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`LOL DB 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log('Riot API 프록시 준비 완료');
});

// 전역 에러 핸들러 추가
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception thrown:', err);
});
