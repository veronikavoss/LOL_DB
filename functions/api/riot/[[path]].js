export async function onRequest(context) {
  // context.params.path는 /api/riot/ 이후의 URL 경로 배열입니다.
  // 예: /api/riot/account/Name/Tag -> ['account', 'Name', 'Tag']
  const pathParts = context.params.path || [];
  
  // Riot API 키 (나중에는 Cloudflare Pages 환경 변수에서 가져오는 것이 좋습니다)
  const RIOT_API_KEY = context.env.RIOT_API_KEY || 'RGAPI-c1c92d56-b806-44a5-8a02-dd588b118605';
  
  if (pathParts.length === 0) {
    return new Response(JSON.stringify({ error: 'Invalid API Route' }), { status: 400 });
  }

  const endpoint = pathParts[0];
  let targetUrl = '';

  try {
    if (endpoint === 'account' && pathParts.length >= 3) {
      // /api/riot/account/:gameName/:tagLine
      // Cloudflare context.params.path는 이미 URL 디코딩된 상태로 들어올 수 있으므로, 
      // 이를 원본 상태로 안전하게 인코딩합니다. (단 이중 인코딩을 방지하기 위해 디코딩 후 인코딩)
      const gameName = encodeURIComponent(decodeURIComponent(pathParts[1]));
      const tagLine = encodeURIComponent(decodeURIComponent(pathParts[2]));
      targetUrl = `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${tagLine}`;
    } 
    else if (endpoint === 'summoner' && pathParts.length >= 2) {
      // /api/riot/summoner/:puuid
      const puuid = pathParts[1];
      targetUrl = `https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
    }
    else if (endpoint === 'league' && pathParts.length >= 2) {
      // /api/riot/league/:puuid
      const puuid = pathParts[1];
      targetUrl = `https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
    }
    else if (endpoint === 'matches' && pathParts.length >= 2) {
      // /api/riot/matches/:puuid
      const puuid = pathParts[1];
      targetUrl = `https://asia.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=20`;
    }
    else if (endpoint === 'match' && pathParts.length >= 2) {
      // /api/riot/match/:matchId
      const matchId = pathParts[1];
      targetUrl = `https://asia.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    }
    else {
      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
    }

    // Riot 서버로 패치 요청
    const riotResponse = await fetch(targetUrl, {
      headers: {
        'X-Riot-Token': RIOT_API_KEY
      }
    });

    if (!riotResponse.ok) {
      const errorText = await riotResponse.text();
      return new Response(JSON.stringify({ error: `Riot API 오류: ${riotResponse.status}`, details: errorText }), { 
        status: riotResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await riotResponse.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
