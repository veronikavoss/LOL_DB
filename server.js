const express = require('express');
const path = require('path');
const app = express();
const PORT = 8080;

// Riot API 키 (개발용 - 24시간마다 갱신 필요)
const RIOT_API_KEY = 'RGAPI-c1c92d56-b806-44a5-8a02-dd588b118605';

// 정적 파일 서빙 (index.html, app.js, index.css, champions.json 등)
app.use(express.static(path.join(__dirname)));

// ========================
// Riot API 프록시 엔드포인트
// ========================

// 공통 Riot API 요청 함수
async function riotApiRequest(url) {
  const response = await fetch(url, {
    headers: {
      'X-Riot-Token': RIOT_API_KEY
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const error = new Error(`Riot API 오류: ${response.status}`);
    error.status = response.status;
    error.body = errorBody;
    throw error;
  }

  return response.json();
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

// 3. PUUID → 랭크 정보 (League-V4)
app.get('/api/riot/league/:puuid', async (req, res) => {
  try {
    const { puuid } = req.params;
    const url = `https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
    const data = await riotApiRequest(url);
    res.json(data);
  } catch (error) {
    console.error('League API 오류:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 4. PUUID → 최근 매치 ID 목록 (Match-V5)
app.get('/api/riot/matches/:puuid', async (req, res) => {
  try {
    const { puuid } = req.params;
    const count = req.query.count || 20;
    const url = `https://asia.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
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
