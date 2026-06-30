console.log('DEX app.js v3.0.0 loaded');

const API_BASE = '/api/riot';

// 글로벌 상태 객체
const state = {
  version: '14.3.1', // 초기값, api 통신 후 동적으로 갱신됨
  champions: [],
  items: [],
  currentTab: 'champions', // 'champions' | 'items' | 'match'
  searchQuery: '',
  activeFilter: 'ALL',
  selectedId: null,
  // 챔피언 상세 정보 캐시
  championDetails: {},
  // 로컬 로드된 챔피언 상세 스펙 캐시
  merakiChampions: null,
  // 전적 검색 관련
  summonerProfile: null,   // { puuid, gameName, tagLine, summonerLevel, profileIconId, summonerId, ranks[] }
  matchIds: [],            // 매치 ID 배열
  matchDetails: {},        // { matchId: matchData } 캐시
  selectedMatchId: null,   // 선택된 매치 ID
  matchSearching: false    // 검색 진행 중 플래그
};

// 역할군 영문 -> 국문 매핑
const CHAMPION_TAG_MAP = {
  'ALL': '전체',
  'Fighter': '전사',
  'Tank': '탱커',
  'Mage': '마법사',
  'Assassin': '암살자',
  'Marksman': '원거리 딜러',
  'Support': '서포터'
};

// 리소스 종류 영문 -> 국문 매핑 및 변환 함수
const RESOURCE_MAP = {
  "Mana": "마나",
  "Energy": "기력",
  "Rage": "분노",
  "Fury": "분노",
  "Flow": "기류",
  "Heat": "열기",
  "Ferocity": "야성",
  "Blood Well": "피의 샘",
  "Shield": "보호막",
  "None": "없음",
  "Crimson Rush": "핏빛 격분"
};
function translateResource(resourceStr) {
  if (!resourceStr) return '없음';
  const trimmed = resourceStr.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'none') return '없음';
  return RESOURCE_MAP[trimmed] || trimmed;
}

// 아이템 태그 영문 -> 국문 매핑 및 필터
const ITEM_TAG_MAP = {
  'ALL': '전체',
  'Damage': '공격력',
  'SpellDamage': '주문력',
  'Armor': '방어력',
  'SpellBlock': '마법 저항력',
  'Health': '체력',
  'Mana': '마나',
  'CriticalStrike': '치명타',
  'AttackSpeed': '공격 속도',
  'LifeSteal': '생명력 흡수',
  'Haste': '스킬 가속',
  'Boots': '장화'
};

// DOM 요소 참조
const elements = {
  loadingOverlay: document.getElementById('loading-overlay'),
  patchVersion: document.getElementById('patch-version'),
  tabChampions: document.getElementById('tab-champions'),
  tabItems: document.getElementById('tab-items'),
  tabMatch: document.getElementById('tab-match'),
  searchInput: document.getElementById('search-input'),
  clearSearchBtn: document.getElementById('clear-search-btn'),
  filterGroup: document.getElementById('filter-group'),
  listGrid: document.getElementById('list-grid'),
  emptyDetailState: document.getElementById('empty-detail-state'),
  detailContentArea: document.getElementById('detail-content-area'),
  // 도감 섹션 (탭 전환 시 숨기기/보이기)
  listSection: document.querySelector('.list-section'),
  detailPanel: document.getElementById('detail-panel'),
  // 전적 검색 섹션
  matchSection: document.getElementById('match-section'),
  matchSearchInput: document.getElementById('match-search-input'),
  matchSearchBtn: document.getElementById('match-search-btn'),
  matchAutocompleteList: document.getElementById('match-autocomplete-list'),
  summonerProfileHeader: document.getElementById('summoner-profile-header'),
  matchDashboard: document.getElementById('match-dashboard'),
  rankInfo: document.getElementById('rank-info'),
  matchSummaryWidget: document.getElementById('match-summary-widget'),
  matchList: document.getElementById('match-list')
};

// 초기화
async function init() {
  showLoading(true);
  try {
    // 1. 최신 패치 버전 정보 가져오기
    const versionsResponse = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    if (!versionsResponse.ok) throw new Error('버전 정보를 가져올 수 없습니다.');
    const versions = await versionsResponse.json();
    state.version = versions[0]; // 가장 최근 패치 버전
    elements.patchVersion.textContent = `Ver. ${state.version}`;

    // 2. 챔피언, 아이템 및 Meraki 정밀 스펙 데이터 일괄 사전 로드 (로딩 단계에서 완벽 동기화)
    await Promise.all([
      loadChampions(),
      loadItems(),
      loadMerakiData()
    ]);

    // 3. 이벤트 리스너 바인딩
    setupEventListeners();

    // 4. 초기 뷰 렌더링
    renderFilters();
    renderList();
  } catch (error) {
    console.error('초기화 에러:', error);
    alert('데이터를 로드하는 중 문제가 발생했습니다. 페이지를 새로고침 해주세요.');
  } finally {
    showLoading(false);
  }
}

// 로딩 토글
function showLoading(show) {
  if (show) {
    elements.loadingOverlay.classList.remove('fade-out');
  } else {
    elements.loadingOverlay.classList.add('fade-out');
  }
}

// 챔피언 목록 API 호출
async function loadChampions() {
  const url = `https://ddragon.leagueoflegends.com/cdn/${state.version}/data/ko_KR/champion.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('챔피언 목록 로드 실패');
  const data = await response.json();
  // 정렬된 배열 형태로 저장
  state.champions = Object.values(data.data).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

// 아이템 목록 API 호출
async function loadItems() {
  const url = `https://ddragon.leagueoflegends.com/cdn/${state.version}/data/ko_KR/item.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('아이템 목록 로드 실패');
  const data = await response.json();
  
  // 유효한 아이템만 정제 (이름이 존재하고, 맵 제한이 일반 매치(소환사의 협곡)에 포함되거나 구매 가능한 아이템 위주)
  const filteredItems = Object.entries(data.data)
    .map(([id, item]) => ({ id, ...item }))
    .filter(item => {
      // 이름이 있고, 숨겨진 더미 아이템이나 토큰 아이템이 아닌 것들 위주로 필터링
      const hasName = item.name && item.name.trim() !== '';
      const isPurchasable = item.gold && item.gold.purchasable;
      const isNotRequiredChampion = !item.requiredChampion; // 특정 챔피언 전용 아이템(예: 빅토르 코어 등 예전 아이템) 제외
      const hasDescription = item.description && item.description.trim() !== '';
      
      // 맵이 소환사의 협곡(11)에서 사용 가능한 아이템인지 체크
      const isSummonersRift = item.maps && item.maps['11'] === true;

      return hasName && isPurchasable && isNotRequiredChampion && hasDescription && isSummonersRift;
    });

  // 이름 기준 중복 제거 (아레나 등 특수 모드 변형 아이템 방지 - ID가 짧은 순정 아이템 우선)
  const uniqueItemsMap = new Map();
  filteredItems.forEach(item => {
    const existing = uniqueItemsMap.get(item.name);
    if (!existing || parseInt(item.id) < parseInt(existing.id)) {
      uniqueItemsMap.set(item.name, item);
    }
  });

  state.items = Array.from(uniqueItemsMap.values())
    .sort((a, b) => a.gold.total - b.gold.total);
}

// 이벤트 리스너 등록
function setupEventListeners() {
  // 탭 클릭
  elements.tabChampions.addEventListener('click', () => switchTab('champions'));
  elements.tabItems.addEventListener('click', () => switchTab('items'));
  elements.tabMatch.addEventListener('click', () => switchTab('match'));

  // 검색 입력
  elements.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    if (state.searchQuery) {
      elements.clearSearchBtn.style.display = 'block';
    } else {
      elements.clearSearchBtn.style.display = 'none';
    }
    renderList();
  });

  // 검색 초기화 버튼
  elements.clearSearchBtn.addEventListener('click', () => {
    elements.searchInput.value = '';
    state.searchQuery = '';
    elements.clearSearchBtn.style.display = 'none';
    renderList();
    elements.searchInput.focus();
  });

  // 전적 검색 이벤트
  elements.matchSearchBtn.addEventListener('click', () => {
    hideAutocomplete();
    handleMatchSearch();
  });
  elements.matchSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      hideAutocomplete();
      handleMatchSearch();
    }
  });

  // 자동완성 드롭다운 이벤트
  elements.matchSearchInput.addEventListener('focus', () => {
    showAutocomplete();
  });
  elements.matchSearchInput.addEventListener('input', () => {
    showAutocomplete();
  });

  // 외부 클릭 시 자동완성 닫기
  document.addEventListener('click', (e) => {
    if (!elements.matchSearchInput.contains(e.target) && !elements.matchAutocompleteList.contains(e.target)) {
      hideAutocomplete();
    }
  });
}

// 탭 전환
function switchTab(tab) {
  if (state.currentTab === tab) return;
  state.currentTab = tab;
  state.searchQuery = '';
  state.activeFilter = 'ALL';
  state.selectedId = null;

  elements.searchInput.value = '';
  elements.clearSearchBtn.style.display = 'none';

  // 모든 탭 버튼 비활성화
  elements.tabChampions.classList.remove('active');
  elements.tabItems.classList.remove('active');
  elements.tabMatch.classList.remove('active');

  if (tab === 'match') {
    // 전적 검색 탭: 도감 영역 숨기고 전적 영역 표시
    elements.tabMatch.classList.add('active');
    elements.listSection.classList.add('hidden');
    elements.detailPanel.classList.add('hidden');
    elements.matchSection.classList.remove('hidden');
  } else {
    // 챔피언/아이템 탭: 전적 영역 숨기고 도감 영역 표시
    elements.matchSection.classList.add('hidden');
    elements.listSection.classList.remove('hidden');
    elements.detailPanel.classList.remove('hidden');

    if (tab === 'champions') {
      elements.tabChampions.classList.add('active');
      elements.searchInput.placeholder = '챔피언 이름을 입력하여 검색...';
    } else {
      elements.tabItems.classList.add('active');
      elements.searchInput.placeholder = '아이템 이름을 입력하여 검색...';
    }

    // 뷰 초기화
    elements.emptyDetailState.classList.remove('hidden');
    elements.detailContentArea.classList.add('hidden');

    renderFilters();
    renderList();
  }
}

// 필터 영역 렌더링
function renderFilters() {
  elements.filterGroup.innerHTML = '';
  const map = state.currentTab === 'champions' ? CHAMPION_TAG_MAP : ITEM_TAG_MAP;

  Object.entries(map).forEach(([key, value]) => {
    const btn = document.createElement('button');
    btn.className = `filter-btn ${state.activeFilter === key ? 'active' : ''}`;
    btn.textContent = value;
    btn.addEventListener('click', () => {
      // 기존 활성화 클래스 해제 및 새로운 필터 적용
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeFilter = key;
      renderList();
    });
    elements.filterGroup.appendChild(btn);
  });
}

// 리스트 영역 렌더링
function renderList() {
  elements.listGrid.innerHTML = '';

  const isChamp = state.currentTab === 'champions';
  const list = isChamp ? state.champions : state.items;

  // 필터링 적용
  const filteredList = list.filter(item => {
    // 1. 검색어 필터링 (한글 자음 검색 대신 부분 일치 제공)
    const matchesSearch = item.name.toLowerCase().includes(state.searchQuery.toLowerCase());
    
    // 2. 태그 필터링
    let matchesTag = true;
    if (state.activeFilter !== 'ALL') {
      if (isChamp) {
        matchesTag = item.tags && item.tags.includes(state.activeFilter);
      } else {
        // 아이템의 경우 tags 배열에 해당 키워드가 포함되는지 체크
        matchesTag = item.tags && item.tags.includes(state.activeFilter);
      }
    }

    return matchesSearch && matchesTag;
  });

  if (filteredList.length === 0) {
    elements.listGrid.innerHTML = `<div class="no-results">검색 결과가 없습니다.</div>`;
    return;
  }

  // 카드 그리기
  filteredList.forEach(item => {
    const card = document.createElement('div');
    card.className = `card-item ${state.selectedId === item.id ? 'selected' : ''}`;
    card.setAttribute('data-id', item.id);

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'card-img-wrapper';

    const img = document.createElement('img');
    img.className = 'card-img';
    img.loading = 'lazy';
    
    if (isChamp) {
      img.src = `https://ddragon.leagueoflegends.com/cdn/${state.version}/img/champion/${item.id}.png`;
      img.alt = item.name;
    } else {
      img.src = `https://ddragon.leagueoflegends.com/cdn/${state.version}/img/item/${item.id}.png`;
      img.alt = item.name;
    }

    const name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = item.name;

    imgWrapper.appendChild(img);
    card.appendChild(imgWrapper);
    card.appendChild(name);

    card.addEventListener('click', () => {
      // 선택 하이라이트 전환
      document.querySelectorAll('.card-item').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      
      state.selectedId = item.id;
      showDetail(item.id);
    });

    elements.listGrid.appendChild(card);
  });
}

// 상세 정보 표시 로직
async function showDetail(id) {
  showLoading(true);
  try {
    elements.emptyDetailState.classList.add('hidden');
    elements.detailContentArea.classList.remove('hidden');

    if (state.currentTab === 'champions') {
      await showChampionDetail(id);
    } else {
      showItemDetail(id);
    }
  } catch (error) {
    console.error('상세 조회 실패:', error);
    elements.detailContentArea.innerHTML = `<p class="error-msg">상세 정보를 불러올 수 없습니다.</p>`;
  } finally {
    showLoading(false);
  }
}

// 챔피언 상세 표시
async function showChampionDetail(championId) {
  let detailData = state.championDetails[championId];

  // 캐시가 없으면 API 호출
  if (!detailData) {
    const url = `https://ddragon.leagueoflegends.com/cdn/${state.version}/data/ko_KR/champion/${championId}.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('챔피언 상세 정보 로드 실패');
    const data = await response.json();
    detailData = data.data[championId];
    state.championDetails[championId] = detailData; // 캐시에 보관
  }

  // ID 불일치(오공, 누누 등)를 보정하여 100% 완벽 매핑
  const merakiChamp = findMerakiChampion(championId, detailData);

  // 스탯 맵핑
  const stats = detailData.stats;
  const statLabels = [
    { label: '체력', value: `${stats.hp} (+${stats.hpperlevel})` },
    { label: '마나', value: `${stats.mp} (+${stats.mpperlevel})` },
    { label: '공격력', value: `${stats.attackdamage} (+${stats.attackdamageperlevel})` },
    { label: '방어력', value: `${stats.armor} (+${stats.armorperlevel})` },
    { label: '마법 저항력', value: `${stats.spellblock} (+${stats.spellblockperlevel})` },
    { label: '공격 속도', value: `${stats.attackspeed} (+${stats.attackspeedperlevel}%)` },
    { label: '이동 속도', value: stats.movespeed },
    { label: '사정거리', value: stats.attackrange }
  ];

  // 스탯 그리드 HTML 생성
  const statsHtml = statLabels.map(s => `
    <div class="stat-item">
      <span class="stat-label">${s.label}</span>
      <span class="stat-value">${s.value}</span>
    </div>
  `).join('');

  // 스킬 및 패시브 HTML 구성
  const passive = detailData.passive;
  const spells = detailData.spells;
  const skillKeys = ['Q', 'W', 'E', 'R'];

  // 패시브 수치 획득
  const merakiPassive = merakiChamp && merakiChamp.abilities ? merakiChamp.abilities.P[0] : null;
  const passiveSpecsHtml = getSkillSpecsHtml(merakiPassive);

  let skillsHtml = `
    <!-- 패시브 -->
    <div class="skill-row">
      <div class="skill-icon-wrapper">
        <img class="skill-icon" src="https://ddragon.leagueoflegends.com/cdn/${state.version}/img/passive/${passive.image.full}" alt="${passive.name}">
        <span class="skill-key" style="background-color: #4a5568; border-color: #4a5568; color: #fff;">P</span>
      </div>
      <div class="skill-info">
        <div class="skill-name-row">
          <span class="skill-name">${passive.name}</span>
          <span class="skill-meta">패시브</span>
        </div>
        <div class="skill-desc">${cleanHtml(passive.description)}</div>
        ${passiveSpecsHtml}
      </div>
    </div>
  `;

  spells.forEach((spell, index) => {
    const key = skillKeys[index] || '';
    const cooldown = spell.cooldownBurn ? `${spell.cooldownBurn}초` : '없음';
    const cost = spell.costBurn ? `${spell.costBurn} ${translateResource(detailData.partype)}` : '없음';

    // Meraki 스펙으로부터 스킬 계수 및 데미지 데이터 획득
    const merakiSpell = merakiChamp && merakiChamp.abilities ? merakiChamp.abilities[key][0] : null;
    const skillSpecsHtml = getSkillSpecsHtml(merakiSpell);

    skillsHtml += `
      <div class="skill-row">
        <div class="skill-icon-wrapper">
          <img class="skill-icon" src="https://ddragon.leagueoflegends.com/cdn/${state.version}/img/spell/${spell.image.full}" alt="${spell.name}">
          <span class="skill-key">${key}</span>
        </div>
        <div class="skill-info">
          <div class="skill-name-row">
            <span class="skill-name">${spell.name}</span>
            <span class="skill-meta">재사용 대기시간: ${cooldown}</span>
          </div>
          <div class="skill-meta" style="margin-top: -2px; opacity: 0.85;">소모: ${cost}</div>
          <div class="skill-desc">${cleanHtml(spell.description)}</div>
          ${skillSpecsHtml}
        </div>
      </div>
    `;
  });

  // 역할군 국문 맵핑
  const tagsText = detailData.tags.map(t => CHAMPION_TAG_MAP[t] || t).join(', ');

  elements.detailContentArea.innerHTML = `
    <div class="detail-header">
      <img class="detail-portrait" src="https://ddragon.leagueoflegends.com/cdn/${state.version}/img/champion/${championId}.png" alt="${detailData.name}">
      <div class="detail-title-group">
        <span class="detail-sub">${detailData.title}</span>
        <h2 class="detail-title">${detailData.name}</h2>
        <div class="detail-tags">
          <span class="detail-tag">${tagsText}</span>
          <span class="detail-tag">리소스: ${translateResource(detailData.partype)}</span>
        </div>
      </div>
    </div>

    <!-- 챔피언 스토리 요약 -->
    <div class="section-title">스토리</div>
    <p class="item-description" style="margin-bottom: 20px;">${detailData.lore || detailData.blurb}</p>

    <div class="detail-divider"></div>

    <!-- 기본 능력치 -->
    <div class="section-title">기본 능력치 (레벨업 당 상승치)</div>
    <div class="stats-grid" style="margin-bottom: 24px;">
      ${statsHtml}
    </div>

    <div class="detail-divider"></div>

    <!-- 스킬 정보 -->
    <div class="section-title">스킬 정보</div>
    <div class="skills-container">
      ${skillsHtml}
    </div>
  `;
}

// 아이템 상세 표시
function showItemDetail(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  const buyPrice = item.gold.total;
  const sellPrice = item.gold.sell;
  const tagsText = item.tags && item.tags.length > 0
    ? item.tags.map(t => ITEM_TAG_MAP[t] || t).join(', ')
    : '기타';

  // 조합법 하위/상위 아이템 관계 분석
  // 하위 아이템 (from)
  let buildFromHtml = '';
  if (item.from && item.from.length > 0) {
    buildFromHtml = `
      <div class="section-title">하위 아이템</div>
      <div class="filter-group" style="margin-bottom: 16px; gap: 6px;">
        ${item.from.map(subId => {
          const subItem = state.items.find(i => i.id === subId) || { name: '비공개 아이템', id: subId };
          return `
            <div class="card-item" data-id="${subId}" style="width: 54px; padding: 4px; border-radius: 4px;" onclick="selectById('${subId}')">
              <div class="card-img-wrapper" style="margin-bottom: 2px;">
                <img class="card-img" src="https://ddragon.leagueoflegends.com/cdn/${state.version}/img/item/${subId}.png" alt="${subItem.name}">
              </div>
              <div class="card-name" style="font-size: 8px; width: 100%;">${subItem.name}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // 상위 조합 아이템 (into)
  let buildIntoHtml = '';
  if (item.into && item.into.length > 0) {
    buildIntoHtml = `
      <div class="section-title">상위 조합 아이템</div>
      <div class="filter-group" style="margin-bottom: 16px; gap: 6px;">
        ${item.into.map(upId => {
          const upItem = state.items.find(i => i.id === upId) || { name: '비공개 아이템', id: upId };
          return `
            <div class="card-item" data-id="${upId}" style="width: 54px; padding: 4px; border-radius: 4px;" onclick="selectById('${upId}')">
              <div class="card-img-wrapper" style="margin-bottom: 2px;">
                <img class="card-img" src="https://ddragon.leagueoflegends.com/cdn/${state.version}/img/item/${upId}.png" alt="${upItem.name}">
              </div>
              <div class="card-name" style="font-size: 8px; width: 100%;">${upItem.name}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  elements.detailContentArea.innerHTML = `
    <div class="detail-header">
      <img class="detail-portrait" src="https://ddragon.leagueoflegends.com/cdn/${state.version}/img/item/${itemId}.png" alt="${item.name}">
      <div class="detail-title-group">
        <span class="detail-sub">${item.colloq || '아이템'}</span>
        <h2 class="detail-title">${item.name}</h2>
        <div class="detail-tags">
          <span class="detail-tag">${tagsText}</span>
          <span class="detail-tag">아이템 ID: ${itemId}</span>
        </div>
      </div>
    </div>

    <!-- 가격 정보 -->
    <div class="section-title">골드 정보</div>
    <div class="item-price-box">
      <div class="price-row">
        <span>구매 가격</span>
        <span class="gold-icon">${buyPrice.toLocaleString()} G</span>
      </div>
      <div class="price-row" style="opacity: 0.85;">
        <span>판매 가격</span>
        <span class="gold-icon">${sellPrice.toLocaleString()} G</span>
      </div>
    </div>

    <div class="detail-divider"></div>

    <!-- 능력치 및 효과 설명 -->
    <div class="section-title">아이템 효과</div>
    <div class="item-description" style="margin-bottom: 24px;">
      ${item.description}
    </div>

    ${buildFromHtml ? `<div class="detail-divider"></div> ${buildFromHtml}` : ''}
    ${buildIntoHtml ? `<div class="detail-divider"></div> ${buildIntoHtml}` : ''}
  `;
}

// 조합법 내 아이템 클릭 시 바로가기용 전역 함수 바인딩
window.selectById = function(id) {
  // 아이템 리스트 중에 있는 경우에만 선택 가능
  const itemExists = state.items.some(i => i.id === id);
  if (!itemExists) return;

  state.selectedId = id;
  
  // 목록 렌더링을 다시 돌려서 활성화를 유지하거나, 스크롤을 이동
  renderList();
  
  const targetCard = document.querySelector(`.card-item[data-id="${id}"]`);
  if (targetCard) {
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    targetCard.classList.add('selected');
  }
  
  showDetail(id);
};

// HTML 태그 정제 (스킬 설명 내 깨진 툴팁 또는 원시 태그 정리)
function cleanHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '<br>')
    .replace(/<font color='#([a-fA-F0-9]+)'>(.*?)<\/font>/gi, '<span style="color:#$1">$2</span>')
    .replace(/<attention>(.*?)<\/attention>/gi, '<span style="color:#f1cc7b; font-weight:600;">$1</span>')
    .replace(/<status>(.*?)<\/status>/gi, '<span style="color:#00e5ff;">$1</span>')
    .replace(/<physicalDamage>(.*?)<\/physicalDamage>/gi, '<span style="color:#ffaa00; font-weight:600;">$1</span>')
    .replace(/<magicDamage>(.*?)<\/magicDamage>/gi, '<span style="color:#3b82f6; font-weight:600;">$1</span>');
}

// 초기화 시작
document.addEventListener('DOMContentLoaded', init);

// --- Meraki Analytics 스킬 수치 및 계수 연동 모듈 ---

// 한글 맵핑 딕셔너리
// 전체 챔피언의 모든 고유 속성 100% 집대성 + 패턴 기반 폴백 번역
const ATTRIBUTE_MAP = {
  "Damage": "피해량",
  "Bonus Physical Damage": "추가 물리 피해",
  "Physical Damage": "물리 피해",
  "Magic Damage": "마법 피해",
  "Bonus Magic Damage": "추가 마법 피해",
  "True Damage": "고정 피해",
  "Cooldown": "재사용 대기시간",
  "Movement Speed": "이동 속도 증가",
  "Movement Speed Duration": "이동 속도 지속시간",
  "Silence Duration": "침묵 지속시간",
  "Shield": "보호막 흡수량",
  "Armor": "방어력 증가",
  "Magic Resist": "마법 저항력 증가",
  "Duration": "지속시간",
  "Range": "사정거리",
  "Slow": "둔화 비율",
  "Healing": "회복량",
  "Mana": "마나 회복",
  "Cost": "소모값",
  "Base Damage": "기본 피해량",
  
  // 오른(Ornn) W 및 추가 세부 번역 데이터
  "Total Magic Damage": "총 마법 피해량",
  "Magic Damage Per Tick": "틱당 마법 피해량",
  "Total Minimum/Minion Damage": "미니언 대상 총 최소 피해량",
  "Minimum/Minion Damage Per Tick": "미니언 대상 틱당 최소 피해량",
  "Total Monster Damage Cap": "몬스터 대상 최대 피해량 제한",
  "Monster Damage Cap Per Tick": "몬스터 대상 틱당 최대 피해량 제한",
  "Percent Health Damage": "체력 백분율 피해량",
  "Total Physical Damage": "총 물리 피해량",
  "Physical Damage Per Tick": "틱당 물리 피해량",
  "Total True Damage": "총 고정 피해량",
  "True Damage Per Tick": "틱당 고정 피해량",

  // 기존 한글화 확장 용어
  "Damage Reduction": "피해량 감소",
  "Shield Strength": "보호막 흡수량",
  "Physical Damage Per Spin": "회전당 물리 피해",
  "Increased Damage Per Spin": "회전당 증가 피해",
  "Damage Per Pass": "관통당 피해",
  "Total Mixed Damage": "총 혼합 피해",
  "Initial Flame Magic Damage": "첫 여우불 마법 피해",
  "Subsequent Flame Magic Damage": "이후 여우불 마법 피해",
  "Total Single-Target Damage": "단일 대상 총 피해",
  "Increased Initial Flame Minion Damage": "미니언 대상 첫 여우불 증가 피해",
  "Increased Subsequent Flame Minion Damage": "미니언 대상 이후 여우불 증가 피해",
  "Disable Duration": "군중제어 지속시간",
  "Wall Width": "장막 너비",
  "Bonus Damage per Stack": "중첩당 추가 피해",
  "Maximum Bonus Damage": "최대 추가 피해",
  "Total Combined Damage": "총 결합 피해",
  "Total Damage": "총 피해량",
  "Active Damage": "활성화 피해량",
  "Passive Damage": "지속 효과 피해량",
  "Minimum Damage": "최소 피해량",
  "Maximum Damage": "최대 피해량",
  "Attack Speed": "공격 속도",
  "Bonus Attack Speed": "추가 공격 속도",
  "Armor Penetration": "방어구 관통력",
  "Magic Penetration": "마법 관통력",
  "Stun Duration": "기절 지속시간",
  "Root Duration": "속박 지속시간",
  "Knockup Duration": "에어본 지속시간",
  "Slow Duration": "둔화 지속시간",
  "Heal": "회복량",
  "Attack Range": "공격 사거리",

  // --- 전 챔피언 데이터 고유 속성 일괄 한글 매핑 ---
  "Active Damage Per Second": "활성화 초당 피해량",
  "Additional Magic Damage": "추가 마법 피해량",
  "Apex Physical Damage": "최대 물리 피해량",
  "Area Magic Damage": "범위 마법 피해량",
  "Base Physical Damage": "기본 물리 피해량",
  "Blade Magic Damage": "검刃 마법 피해량",
  "Bonus Armor": "추가 방어력",
  "Bonus Damage": "추가 피해량",
  "Bonus Damage Per Missile": "미사일당 추가 피해량",
  "Bonus Magic Resistance": "추가 마법 저항력",
  "Bonus Movement Speed": "추가 이동 속도",
  "Bonus Physical Damage Per Spin": "회전당 추가 물리 피해량",
  "Bonus Physical Damage per Spin": "회전당 추가 물리 피해량",
  "Bonus True Damage": "추가 고정 피해량",
  "Bonus damage": "추가 피해량",
  "Bouncing Magic Damage": "바운싱 마법 피해량",
  "Center Physical Damage": "중앙 영역 물리 피해량",
  "Detonation Magic Damage": "폭발 마법 피해량",
  "Empowered Magic Damage": "강화 마법 피해량",
  "Empowered Physical Damage": "강화 물리 피해량",
  "Explosion Magic Damage": "폭발 마법 피해량",
  "Explosion Physical Damage": "폭발 물리 피해량",
  "Extra Physical Damage": "추가 물리 피해량",
  "Final Magic Damage": "최종 마법 피해량",
  "Final Physical Damage": "최종 물리 피해량",
  "Flame Magic Damage": "화염 마법 피해량",
  "Frost Magic Damage": "냉기 마법 피해량",
  "Health Regained": "체력 회복량",
  "Ice Magic Damage": "얼음 마법 피해량",
  "Impact Magic Damage": "충격 마법 피해량",
  "Impact Physical Damage": "충격 물리 피해량",
  "Improved Magic Damage": "향상된 마법 피해량",
  "Increase Shield": "보호막 증가량",
  "Increased Damage": "증가된 피해량",
  "Initial Magic Damage": "첫 마법 피해량",
  "Initial Physical Damage": "첫 물리 피해량",
  "Initial Flame Magic Damage": "첫 여우불 마법 피해량",
  "Initial True Damage": "첫 고정 피해량",
  "Max Mixed Damage": "최대 혼합 피해량",
  "Max Physical Damage": "최대 물리 피해량",
  "Max Physical Damage Vs Monsters": "몬스터 대상 최대 물리 피해량",
  "Maximum Shield": "최대 보호막량",
  "Minion Bonus Damage": "미니언 대상 추가 피해량",
  "Minion Damage": "미니언 대상 피해량",
  "Minion Magic Damage": "미니언 대상 마법 피해량",
  "Minion Physical Damage": "미니언 대상 물리 피해량",
  "Minimum Magic Damage": "최소 마법 피해량",
  "Minimum Physical Damage": "최소 물리 피해량",
  "Missile Magic Damage": "투사체 마법 피해량",
  "Missile Physical Damage": "투사체 물리 피해량",
  "Mixed Damage": "혼합 피해량",
  "Monster Bonus Damage": "몬스터 대상 추가 피해량",
  "Monster Damage": "몬스터 대상 피해량",
  "Outer Physical Damage": "외곽 영역 물리 피해량",
  "Outer Magic Damage": "외곽 영역 마법 피해량",
  "Outer True Damage": "외곽 영역 고정 피해량",
  "Percent Armor Penetration": "방어구 관통력 (%)",
  "Percent Magic Penetration": "마법 관통력 (%)",
  "Physical Damage per Packmate": "무리 사냥개당 물리 피해량",
  "Physical Damage per Shot": "발당 물리 피해량",
  "Primary Bonus Monster Damage": "몬스터 대상 기본 추가 피해량",
  "Primary Physical Damage": "기본 대상 물리 피해량",
  "Prowl-Enhanced Maximum Damage": "야수 사냥 강화 최대 피해량",
  "Prowl-Enhanced Minimum Damage": "야수 사냥 강화 최소 피해량",
  "Reduced Bonus Damage": "감소된 추가 피해량",
  "Reduced Cooldown": "감소된 재사용 대기시간",
  "Reduced Damage (Handle)": "감소된 피해량 (자루 타격)",
  "Reduced Damage Per Missile": "미사일당 감소된 피해량",
  "Reduced Damage per Hit": "타격당 감소된 피해량",
  "Reduced Damage per Mine": "지뢰당 감소된 피해량",
  "Reduced Damage per Tick": "틱당 감소된 피해량",
  "Reduced Damage per hit": "타격당 감소된 피해량",
  "Reduced Heal": "감소된 회복량",
  "Reduced Heal per Tick": "틱당 감소된 회복량",
  "Reduced Health Cost": "감소된 체력 소모량",
  "Reduced Minion Damage": "미니언 대상 감소된 피해량",
  "Reduced Monster Damage": "몬스터 대상 감소된 피해량",
  "Reduced Monster Damage per hit": "몬스터 대상 타격당 감소된 피해량",
  "Reduced Slow": "감소된 둔화 비율",
  "Replicated Projectile Damage Modifier": "복제 투사체 피해 보정율",
  "Resistances Reduction": "저항력 감소량",
  "Resistances Reduction Per Stack": "중첩당 저항력 감소량",
  "Rift Duration": "균열 지속시간",
  "Rockets 2:5 Magic Damage": "2~5차 로켓 마법 피해량",
  "Rockets 6:20 Magic Damage": "6~20차 로켓 마법 피해량",
  "Root Duration Increase": "속박 지속시간 증가량",
  "Second Cast Damage": "2차 사용 피해량",
  "Second Cast Total Damage": "2차 사용 총 피해량",
  "Second Sweetspot Damage": "2타 끝자락 피해량",
  "Secondary Target Shield": "보조 대상 보호막 흡수량",
  "Self Bonus Armor": "자가 추가 방어력",
  "Self Bonus Magic Resistance": "자가 추가 마법 저항력",
  "Self Heal": "자가 회복량",
  "Shield to Healing": "보호막의 회복 변환량",
  "Shroud Duration": "장막 지속시간",
  "Silver Serpent Plunder": "바다뱀 주화 획득량",
  "Size Increase": "크기 증가량",
  "Slash Physical Damage": "베기 물리 피해량",
  "Spider Effects Increase": "새끼 거미 효과 증가량",
  "Spiderling Bonus Attack Speed": "새끼 거미 추가 공격 속도",
  "Stealth Duration": "은신 지속시간",
  "Stored Damage Increase per Stack": "중첩당 저장된 피해 증가량",
  "Strike Physical Damage": "타격 물리 피해량",
  "Structure Bonus Damage": "포탑/구조물 추가 피해량",
  "Subsequent Bolt Maximum Magic Damage": "이후 번개 최대 마법 피해량",
  "Subsequent Bolt Minimum Magic Damage": "이후 번개 최소 마법 피해량",
  "Subsequent Flame Magic Damage": "이후 여우불 마법 피해량",
  "Subsequent Increased Damage": "이후 증가된 피해량",
  "Subsequent Rocket Magic Damage": "이후 로켓 마법 피해량",
  "Subsequent Rocket Minion Damage": "미니언 대상 이후 로켓 피해량",
  "Third Cast Damage": "3차 사용 피해량",
  "Third Cast Total Damage": "3차 사용 총 피해량",
  "Third Sweetspot Damage": "3타 끝자락 피해량",
  "Thrust Physical Damage": "찌르기 물리 피해량",
  "Total Bleed Physical Damage": "총 출혈 물리 피해량",
  "Total Bonus Damage": "총 추가 피해량",
  "Total Bonus Magic Damage": "총 추가 마법 피해량",
  "Total Bonus Physical Damage": "총 추가 물리 피해량",
  "Total Capped Monster Damage": "몬스터 대상 최대 제한 피해량",
  "Total Damage Per Flurry": "연타당 총 피해량",
  "Total Damage Vs. 5 Champions": "5인 대상 총 피해량",
  "Total Enhanced Damage": "총 강화 피해량",
  "Total Enhanced MR Reduction": "총 강화 마법 저항력 감소량",
  "Total Enhanced Minion Damage": "미니언 대상 총 강화 피해량",
  "Total Enhanced Slow": "총 강화 둔화 비율",
  "Total Evolved Single-Target Damage": "진화 단일 대상 총 피해량",
  "Total Expanded Damage": "총 확장 피해량",
  "Total Fissure Magic Damage": "균열 총 마법 피해량",
  "Total HP/Mana Regeneration (per 5 Seconds)": "5초당 총 체력/마나 재생량",
  "Total Heal per Champion": "챔피언당 총 회복량",
  "Total Heal per Minion": "미니언당 총 회복량",
  "Total Heal per Monster": "몬스터당 총 회복량",
  "Total Health Regenerated": "총 회복된 체력량",
  "Total Increased Damage": "총 증가된 피해량",
  "Total MR Reduction": "총 마법 저항력 감소량",
  "Total Magic Damage with Fire at Will": "포격 개시 포함 총 마법 피해량",
  "Total Mana Restore": "총 마나 회복량",
  "Total Maximum Champion Damage": "챔피언 대상 총 최대 피해량",
  "Total Maximum Detonation Damage": "총 최대 폭발 피해량",
  "Total Maximum Magic Damage": "총 최대 마법 피해량",
  "Total Maximum Minion/Monster Damage": "미니언/몬스터 대상 총 최대 피해량",
  "Total Maximum Mixed Damage": "총 최대 혼합 피해량",
  "Total Maximum Shield": "총 최대 보호막량",
  "Total Minion Damage": "미니언 대상 총 피해량",
  "Total Mixed Damage with Death's Daughter": "죽음의 여신 포함 총 혼합 피해량",
  "Total Monster Damage": "몬스터 대상 총 피해량",
  "Total Monster Poison Damage": "몬스터 대상 총 독 피해량",
  "Total Movement Speed Increase": "총 이동 속도 증가량",
  "Total Non-Champion Damage": "챔피언 제외 대상 총 피해량",
  "Total Physical Damage On Champion Hit": "챔피언 적중 시 총 물리 피해량",
  "Total Poison Damage": "총 독 피해량",
  "Total Primary Target Shield": "기본 대상 총 보호막 흡수량",
  "Total Reduced Damage": "총 감소된 피해량",
  "Total Resistances Reduction": "총 저항력 감소량",
  "Total Root Duration": "총 속박 지속시간",
  "Total Subsequent Minion Damage": "미니언 대상 총 이후 피해량",
  "Total Subsequent Non-Minion Damage": "미니언 제외 대상 총 이후 피해량",
  "Trap Duration": "함정 지속시간",
  "True Damage with Death's Daughter": "죽음의 여신 포함 총 고정 피해량",
  "Tumble Cooldown Reduction": "구르기 재사용 대기시간 감소량",
  "Turret Disable Duration": "포탑 정지 지속시간",
  "Turret Modified Damage Reduction": "포탑 대상 보정된 피해량 감소율",
  "Untouchable Shadow Dash Speed": "그림자 돌진 속도",
  "Voidling Duration": "공허충 지속시간",
  "Wall Health": "장막 체력",
  "Wall Length": "장막 길이",
  "Wave Interval Time": "웨이브 시간 간격",
  "Width": "너비",
  "Width (charge)": "너비 (돌진)",
  "Width (impassable wall)": "너비 (통과 불가 장막)",
  "Zone Duration": "영역 지속시간",

  // 기본 단어 대소문자 매핑
  "Physical damage": "물리 피해량",
  "Magic damage": "마법 피해량",
  "True damage": "고정 피해량",

  // --- 누락된 전체 속성 일괄 추가 ---
  "Bonus Health": "추가 체력",
  "Bonus Health Per Stack": "중첩당 추가 체력",
  "Bonus Health Regeneration": "추가 체력 재생",
  "Bonus Magic Damage On-Hit": "적중 시 추가 마법 피해",
  "Bonus Magic Damage Per Hit": "타격당 추가 마법 피해",
  "Bonus Magic Damage at Max Stacks": "최대 중첩 시 추가 마법 피해",
  "Bonus Magic Damage per Stack": "중첩당 추가 마법 피해",
  "Bonus Magic Resistance per Champion Hit": "챔피언 타격당 추가 마법 저항력",
  "Bonus Monster Damage": "몬스터 대상 추가 피해",
  "Bonus Move Speed": "추가 이동 속도",
  "Bonus Movement Speed Decay": "추가 이동 속도 감쇠",
  "Bonus Movement Speed Duration": "추가 이동 속도 지속시간",
  "Bonus Movement Speed per Stack": "중첩당 추가 이동 속도",
  "Bonus Movement speed": "추가 이동 속도",
  "Bonus Non-Epic Monster Damage": "비에픽 몬스터 추가 피해",
  "Bonus Overload Damage": "과부하 추가 피해",
  "Bonus Physical Damage On-Hit": "적중 시 추가 물리 피해",
  "Bonus Physical Damage per Hit": "타격당 추가 물리 피해",
  "Bonus Primary Target Shield": "주 대상 추가 보호막",
  "Bonus Range": "추가 사거리",
  "Bonus Resistances": "추가 저항력",
  "Bonus Shield per Tick": "틱당 추가 보호막",
  "Bonus Size Per Stack": "중첩당 추가 크기",
  "Bonus Stats": "추가 능력치",
  "Bounce Critical Damage": "바운스 치명타 피해",
  "Bounce Damage": "바운스 피해",
  "Bounce Distance Cap": "바운스 최대 거리",
  "Breath of Light Flat Damage Modifier": "빛의 숨결 고정 피해 보정",
  "Buff Duration": "버프 지속시간",
  "Bullet Storing Interval Time": "탄환 충전 시간 간격",
  "Burst Fire Bonus Magic Damage": "점사 추가 마법 피해",
  "Burst Fire Secondary Target Damage": "점사 보조 대상 피해",
  "Burst Physical Damage": "폭발 물리 피해",
  "Capped Healing": "제한된 회복량",
  "Capped Minion/Monster Health Damage": "미니언/몬스터 체력 피해 제한",
  "Capped Monster Damage": "몬스터 피해 제한",
  "Capped Monster Damage per Hit": "몬스터 타격당 피해 제한",
  "Capped Monster Health Damage": "몬스터 체력 피해 제한",
  "Capped Non-Champion Damage": "챔피언 제외 대상 피해 제한",
  "Center Damage per Snip": "중앙 영역 가위질당 피해",
  "Champion Heal Portion": "챔피언 회복 비율",
  "Champion Healing": "챔피언 대상 회복량",
  "Champion Magic Damage": "챔피언 대상 마법 피해",
  "Champion True Damage": "챔피언 대상 고정 피해",
  "Chomper Damage": "덫 피해",
  "Clone Outgoing Damage": "분신 공격 피해",
  "Collision Physical Damage": "충돌 물리 피해",
  "Combined Bonus Magic Damage": "결합 추가 마법 피해",
  "Combined Increased Minion Damage": "미니언 대상 결합 증가 피해",
  "Combined Primary Monster Damage": "몬스터 대상 결합 기본 피해",
  "Combined Total Minion Damage": "미니언 대상 결합 총 피해",
  "Combined Total Non-Minion Damage": "미니언 제외 대상 결합 총 피해",
  "Cooldown Refund": "재사용 대기시간 환불",
  "Cripple Strength": "약화 강도",
  "Critical Physical Damage": "치명타 물리 피해",
  "Critical damage": "치명타 피해",
  "Damage Increase": "피해량 증가",
  "Damage Modifier": "피해량 보정",
  "Damage Per Second": "초당 피해량",
  "Damage Per Tick": "틱당 피해량",
  "Damage Stored": "저장된 피해량",
  "Damage Stored into Grey Health": "회색 체력으로 저장된 피해량",
  "Damage Transmission": "피해 전이량",
  "Damage per Additional Stack": "추가 중첩당 피해량",
  "Damage per Instance": "적중당 피해량",
  "Damage per Snip": "가위질당 피해량",
  "Damage per second": "초당 피해량",
  "Damage reduction": "피해량 감소",
  "Damage to target on 67% missing hp": "잃은 체력 67% 대상 피해량",
  "Damage with A Thousand Cuts": "천 번의 베기 피해량",
  "Dash Physical Damage": "돌진 물리 피해",
  "Decayed Bonus Movement Speed": "감쇠된 추가 이동 속도",
  "Demolition Threshold": "파괴 임계치",
  "Distance between individual segments": "개별 조각 간 거리",
  "Distance between outermost segments": "최외곽 조각 간 거리",
  "Effect Duration": "효과 지속시간",
  "Empowered Champion Heal": "강화 챔피언 회복량",
  "Empowered Damage": "강화 피해량",
  "Empowered Damage per Tick": "강화 틱당 피해량",
  "Empowered Non-Champion Heal": "강화 비챔피언 회복량",
  "Empowered Root Duration": "강화 속박 지속시간",
  "Empowered Slow": "강화 둔화",
  "Energy Restored": "기력 회복량",
  "Enhanced Bonus Attack Speed": "강화 추가 공격 속도",
  "Enhanced Bonus Movement Speed": "강화 추가 이동 속도",
  "Enhanced Champion Healing": "강화 챔피언 회복량",
  "Enhanced Damage": "강화 피해량",
  "Enhanced Damage Per Tick": "강화 틱당 피해량",
  "Enhanced Healing Cap": "강화 회복량 제한",
  "Enhanced Magic Resistance Reduction": "강화 마법 저항력 감소",
  "Enhanced Minion Damage Per Tick": "미니언 대상 강화 틱당 피해",
  "Enhanced Non-Champion Healing": "비챔피언 대상 강화 회복량",
  "Enhanced Shield Strength": "강화 보호막 흡수량",
  "Enhanced Slow": "강화 둔화",
  "Enhanced damage below threshold": "임계치 이하 강화 피해",
  "Epicenter Magic Damage": "진앙 마법 피해",
  "Fear Duration": "공포 지속시간",
  "Field Magic Damage per Second": "장판 초당 마법 피해",
  "Field Magic Damage per Tick": "장판 틱당 마법 피해",
  "Field Minion Magic Damage per Tick": "미니언 대상 장판 틱당 마법 피해",
  "Final Snip Center Damage": "마지막 가위질 중앙 피해",
  "Final Snip Damage": "마지막 가위질 피해",
  "First Cast Damage": "1차 사용 피해",
  "First Sweetspot Damage": "1타 끝자락 피해",
  "Flat Damage Reduction": "고정 피해 감소",
  "Flurry Physical Damage": "연타 물리 피해",
  "Fracture Magic Damage": "균열 마법 피해",
  "Full Stack Bonus Damage": "최대 중첩 추가 피해",
  "Full Stack Physical Damage": "최대 중첩 물리 피해",
  "Fury Gained": "분노 획득량",
  "Fury Generation per Second": "초당 분노 생성량",
  "Gigalodon Damage": "거대 상어 피해",
  "Glob Physical Damage": "점액 물리 피해",
  "Gold Plunder": "골드 약탈량",
  "Guppy Damage": "아기 상어 피해",
  "HP/Mana Regenerated per 0.5 Seconds": "0.5초당 체력/마나 재생량",
  "Headshot Damage Increase": "헤드샷 피해 증가",
  "Heal Per 1 Fury": "분노 1당 회복량",
  "Heal Per Ally": "아군당 회복량",
  "Heal Per Tick": "틱당 회복량",
  "Heal Percentage": "회복 비율",
  "Heal and Shield Power": "치유 및 보호막 효과",
  "Heal per Hit": "타격당 회복량",
  "Heal per Second": "초당 회복량",
  "Heal per Tick": "틱당 회복량",
  "Healing Cap": "회복량 제한",
  "Healing On-Hit": "적중 시 회복량",
  "Healing Percentage": "회복 비율",
  "Health Cost Reduction": "체력 소모량 감소",
  "Health Regenerated per 0.5 Seconds": "0.5초당 체력 재생량",
  "Hurl Physical Damage": "던지기 물리 피해",
  "Hurl Secondary Physical Damage": "던지기 보조 물리 피해",
  "Hyper Bonus Movement Speed": "하이퍼 추가 이동 속도",
  "Impact Distance to Reveal": "시야 제공 충격 거리",
  "Increased Attack Speed": "증가된 공격 속도",
  "Increased Base Health": "증가된 기본 체력",
  "Increased Blind Duration": "증가된 실명 지속시간",
  "Increased Bonus Armor": "증가된 추가 방어력",
  "Increased Bonus Damage": "증가된 추가 피해",
  "Increased Bonus Magic Damage": "증가된 추가 마법 피해",
  "Increased Bonus Move Speed": "증가된 추가 이동 속도",
  "Increased Bonus Movement Speed": "증가된 추가 이동 속도",
  "Increased Damage Modifier": "증가된 피해 보정",
  "Increased Damage Stored into Grey Health": "회색 체력 전환 증가 피해",
  "Increased Damage per Stack": "중첩당 증가 피해",
  "Increased Heal": "증가된 회복량",
  "Increased Healing": "증가된 회복량",
  "Increased Hurl Damage": "증가된 던지기 피해",
  "Increased Hurl Secondary Damage": "증가된 던지기 보조 피해",
  "Increased Life Steal": "증가된 생명력 흡수",
  "Increased Magic Damage": "증가된 마법 피해",
  "Increased Minimum Damage": "증가된 최소 피해",
  "Increased Minion Damage": "증가된 미니언 피해",
  "Increased Mixed Damage": "증가된 혼합 피해",
  "Increased Modified Damage": "증가된 보정 피해",
  "Increased Monster Damage": "증가된 몬스터 피해",
  "Increased Movement Speed": "증가된 이동 속도",
  "Increased Physical Damage": "증가된 물리 피해",
  "Increased Shield Strength": "증가된 보호막 흡수량",
  "Increased Size": "증가된 크기",
  "Increased Slow": "증가된 둔화",
  "Increased Stored Damage": "증가된 저장 피해",
  "Increased Thrust Damage": "증가된 찌르기 피해",
  "Increased Total Attack Speed": "증가된 총 공격 속도",
  "Initial Bonus Movement Speed": "초기 추가 이동 속도",
  "Initial Rocket Damage": "첫 로켓 피해",
  "Initial Rocket Magic Damage": "첫 로켓 마법 피해",
  "Initial Shield Strength": "초기 보호막 흡수량",
  "Invisibility Duration": "투명 지속시간",
  "Knock Back Distance": "넉백 거리",
  "Knock Up Duration": "에어본 지속시간",
  "Last Tick of Damage": "마지막 틱 피해",
  "Lethality": "치명력",
  "Life Steal": "생명력 흡수",
  "Life steal and spell vamp": "생명력 흡수 및 주문 흡혈",
  "Linger Magic Damage per Tick": "잔류 틱당 마법 피해",
  "Magic Damage On-Hit": "적중 시 마법 피해",
  "Magic Damage Per Bolt": "번개당 마법 피해",
  "Magic Damage Per Cluster": "군집당 마법 피해",
  "Magic Damage Per Dagger": "단검당 마법 피해",
  "Magic Damage Per Hit": "타격당 마법 피해",
  "Magic Damage Per Second": "초당 마법 피해",
  "Magic Damage Per Wave": "파도당 마법 피해",
  "Magic Damage Reduction": "마법 피해 감소",
  "Magic Damage per Explosion": "폭발당 마법 피해",
  "Magic Damage per Hit": "타격당 마법 피해",
  "Magic Damage per Mine": "지뢰당 마법 피해",
  "Magic Damage per Needle": "바늘당 마법 피해",
  "Magic Damage per Orb": "구체당 마법 피해",
  "Magic Damage per Sphere": "구체당 마법 피해",
  "Magic Damage per Tick": "틱당 마법 피해",
  "Magic Resistance Reduction": "마법 저항력 감소",
  "Magic Shield Strength": "마법 보호막 흡수량",
  "Mana Refunded": "마나 환불량",
  "Mana Restore": "마나 회복량",
  "Mana Restored": "마나 회복량",
  "Mana Restored Against Champions": "챔피언 대상 마나 회복량",
  "Mana Restored per Kill": "처치 시 마나 회복량",
  "Mark Magic Damage": "표식 마법 피해",
  "Max Single-Target Monster Damage": "단일 몬스터 대상 최대 피해",
  "Maximum Attack Speed": "최대 공격 속도",
  "Maximum Base Damage Increase": "최대 기본 피해 증가",
  "Maximum Bonus Armor": "최대 추가 방어력",
  "Maximum Bonus Attack Speed": "최대 추가 공격 속도",
  "Maximum Bonus Magic Damage": "최대 추가 마법 피해",
  "Maximum Bonus Magic Damage at Max Stacks": "최대 중첩 시 최대 추가 마법 피해",
  "Maximum Bonus Magic Damage per Stack": "중첩당 최대 추가 마법 피해",
  "Maximum Bonus Movement Speed": "최대 추가 이동 속도",
  "Maximum Bonus Physical Damage": "최대 추가 물리 피해",
  "Maximum Bonus True Damage": "최대 추가 고정 피해",
  "Maximum Bullets Stored": "최대 저장 탄환 수",
  "Maximum Center Damage": "최대 중앙 영역 피해",
  "Maximum Champion Damage": "챔피언 대상 최대 피해",
  "Maximum Charges": "최대 충전 횟수",
  "Maximum Cripple": "최대 약화량",
  "Maximum Damage Increase": "최대 피해 증가",
  "Maximum Damage Per Tick": "틱당 최대 피해",
  "Maximum Damage with Infinity Edge": "무한의 대검 최대 피해",
  "Maximum Final Bounce Physical Damage": "최종 바운스 최대 물리 피해",
  "Maximum Fourth Shot Damage": "4번째 총탄 최대 피해",
  "Maximum Heal": "최대 회복량",
  "Maximum Heal Per Tick": "틱당 최대 회복량",
  "Maximum Heal per Tick": "틱당 최대 회복량",
  "Maximum Increased Damage": "최대 증가 피해",
  "Maximum Knockup Duration": "최대 에어본 지속시간",
  "Maximum Magic Damage": "최대 마법 피해",
  "Maximum Mana Restored": "최대 마나 회복량",
  "Maximum Minion Damage": "미니언 대상 최대 피해",
  "Maximum Minion/Monster Damage": "미니언/몬스터 대상 최대 피해",
  "Maximum Mixed Damage": "최대 혼합 피해",
  "Maximum Mixed Total Damage with Fire at Will and Death's Daughter": "포격 개시 + 죽음의 여신 최대 혼합 총 피해",
  "Maximum Monster Damage": "몬스터 대상 최대 피해",
  "Maximum Monster Damage per hit": "몬스터 대상 타격당 최대 피해",
  "Maximum Movement Speed": "최대 이동 속도",
  "Maximum Non-Champion Damage": "비챔피언 대상 최대 피해",
  "Maximum Non-Minion Non-Sweetspot Damage": "미니언 제외 일반 영역 최대 피해",
  "Maximum Non-Minion Sweetspot Damage": "미니언 제외 끝자락 최대 피해",
  "Maximum Number of Traps": "최대 함정 수",
  "Maximum Physical Damage": "최대 물리 피해",
  "Maximum Physical Damage per Bullet": "탄환당 최대 물리 피해",
  "Maximum Physical Damage per hit": "타격당 최대 물리 피해",
  "Maximum Physical Damage with Infinity Edge": "무한의 대검 최대 물리 피해",
  "Maximum Range Channel Duration": "최대 사거리 채널링 지속시간",
  "Maximum Reduced Damage": "최대 감소 피해",
  "Maximum Secondary Damage": "최대 보조 피해",
  "Maximum Shield Strength": "최대 보호막 흡수량",
  "Maximum Single-Target Damage": "단일 대상 최대 피해",
  "Maximum Slow": "최대 둔화",
  "Maximum Stacks": "최대 중첩 수",
  "Maximum Total Bonus AD": "최대 총 추가 AD",
  "Maximum Total Damage": "최대 총 피해",
  "Maximum Total Heal": "최대 총 회복량",
  "Maximum Total Magic Damage": "최대 총 마법 피해",
  "Maximum Total Monster Damage": "몬스터 대상 최대 총 피해",
  "Maximum Total Physical Damage": "최대 총 물리 피해",
  "Maximum True Damage": "최대 고정 피해",
  "Maximum charges": "최대 충전 횟수",
  "Minimum Bonus Damage": "최소 추가 피해",
  "Minimum Bonus Magic Damage": "최소 추가 마법 피해",
  "Minimum Bonus Physical Damage": "최소 추가 물리 피해",
  "Minimum Bonus True Damage": "최소 추가 고정 피해",
  "Minimum Center Damage": "최소 중앙 영역 피해",
  "Minimum Charged Physical Damage": "최소 충전 물리 피해",
  "Minimum Damage Mitigated": "최소 피해 감쇠량",
  "Minimum Damage Per Tick": "틱당 최소 피해",
  "Minimum Fourth Shot Damage": "4번째 총탄 최소 피해",
  "Minimum Heal": "최소 회복량",
  "Minimum Heal Per Tick": "틱당 최소 회복량",
  "Minimum Heal per Tick": "틱당 최소 회복량",
  "Minimum Health Threshold": "최소 체력 임계치",
  "Minimum Mana Restored": "최소 마나 회복량",
  "Minimum Minion Damage": "미니언 대상 최소 피해",
  "Minimum Mixed Damage": "최소 혼합 피해",
  "Minimum Monster Damage": "몬스터 대상 최소 피해",
  "Minimum Monster Damage per hit": "몬스터 대상 타격당 최소 피해",
  "Minimum Movement Speed": "최소 이동 속도",
  "Minimum Physical Damage per Bullet": "탄환당 최소 물리 피해",
  "Minimum Physical Damage per hit": "타격당 최소 물리 피해",
  "Minimum Reduced Damage": "최소 감소 피해",
  "Minimum Secondary Damage": "최소 보조 피해",
  "Minimum Shield": "최소 보호막",
  "Minimum Shield Strength": "최소 보호막 흡수량",
  "Minimum Slow": "최소 둔화",
  "Minimum Total Damage": "최소 총 피해",
  "Minimum Total Heal": "최소 총 회복량",
  "Minimum Total Physical Damage": "최소 총 물리 피해",
  "Minion Bounce Critical Damage": "미니언 바운스 치명타 피해",
  "Minion Bounce Damage": "미니언 바운스 피해",
  "Minion Damage Per Feather": "깃털당 미니언 피해",
  "Minion Damage Per Shot": "발당 미니언 피해",
  "Minion Damage Per Tick": "틱당 미니언 피해",
  "Minion Damage per Explosion": "폭발당 미니언 피해",
  "Minion Damage per Rocket": "로켓당 미니언 피해",
  "Minion Heal": "미니언 대상 회복량",
  "Minion Healing Percentage": "미니언 대상 회복 비율",
  "Minion and Small Monster Damage": "미니언 및 소형 몬스터 피해",
  "Minion damage": "미니언 대상 피해",
  "Mist Walkers": "안개 보행자",
  "Modified Damage Reduction": "보정 피해 감소",
  "Modified Magic Damage": "보정 마법 피해",
  "Modified Minion Damage": "보정 미니언 피해",
  "Modified Physical Damage": "보정 물리 피해",
  "Monster Bonus Physical Damage": "몬스터 대상 추가 물리 피해",
  "Monster Damage Cap": "몬스터 피해 제한",
  "Monster Damage On-Hit": "몬스터 적중 시 피해",
  "Monster Damage per Tick": "몬스터 틱당 피해",
  "Monster Disable Duration": "몬스터 무력화 지속시간",
  "Monster Healing Percentage": "몬스터 대상 회복 비율",
  "Monster Magic Damage": "몬스터 대상 마법 피해",
  "Monster Percent Health Damage Cap": "몬스터 체력 비례 피해 제한",
  "Monster Physical Damage": "몬스터 대상 물리 피해",
  "Movement Speed Modifier": "이동 속도 보정",
  "Non-Champion Bonus Damage": "비챔피언 대상 추가 피해",
  "Non-Champion Damage": "비챔피언 대상 피해",
  "Non-Champion Heal": "비챔피언 대상 회복량",
  "Non-Champion Healing": "비챔피언 대상 회복량",
  "Non-Champion True Damage": "비챔피언 대상 고정 피해",
  "Non-Epic Monster Damage": "비에픽 몬스터 피해",
  "Number of Bolts": "번개 수",
  "Number of Recasts": "재사용 횟수",
  "Number of ice segments": "얼음 조각 수",
  "On-Hit Damage Effectiveness": "적중 피해 유효율",
  "Orb Magic Damage": "구체 마법 피해",
  "Orb Minion Magic Damage": "미니언 대상 구체 마법 피해",
  "Orb Root Duration": "구체 속박 지속시간",
  "Outer Cone Bonus Damage": "외곽 원뿔 추가 피해",
  "Passive Bonus Magic Damage": "지속 효과 추가 마법 피해",
  "Path Duration": "경로 지속시간",
  "Physical Damage (Blade)": "물리 피해 (검날)",
  "Physical Damage Per Arrow": "화살당 물리 피해",
  "Physical Damage Per Dagger": "단검당 물리 피해",
  "Physical Damage Per Feather": "깃털당 물리 피해",
  "Physical Damage Per Hit": "타격당 물리 피해",
  "Physical Damage Per Missile": "미사일당 물리 피해",
  "Physical Damage Per Shot": "발당 물리 피해",
  "Physical Damage Per Stack": "중첩당 물리 피해",
  "Physical Damage Reduction": "물리 피해 감소",
  "Physical Damage per Hit": "타격당 물리 피해",
  "Physical Damage per Tick": "틱당 물리 피해",
  "Reduced Damage": "감소된 피해",
  "Static Cooldown": "고정 재사용 대기시간",
  "Taunt Duration": "도발 지속시간",
  "Total Heal": "총 회복량",
  "Total Healing": "총 회복량",
  "Total Slow": "총 둔화",
  "Total Waves": "총 웨이브 수",

  // --- 마지막 누락분 46개 일괄 추가 ---
  "Ability Haste": "스킬 가속",
  "Active Bonus Magic Damage": "활성화 추가 마법 피해",
  "Active Increased Minion Damage": "미니언 대상 활성화 증가 피해",
  "Active Maximum Magic Damage": "활성화 최대 마법 피해",
  "Active Minimum Magic Damage": "활성화 최소 마법 피해",
  "Additional Bonus AD": "추가 AD 보너스",
  "Additional Bonus Movement Speed": "추가 이동 속도 보너스",
  "Additional Cripple Per Second": "초당 추가 약화",
  "Additional Damage per 20% Crit Chance": "치명타 확률 20%당 추가 피해",
  "Additional Minion Damage per 20% Crit Chance": "치명타 확률 20%당 미니언 추가 피해",
  "Additional Physical Damage": "추가 물리 피해",
  "Additional Slow Per Second": "초당 추가 둔화",
  "Airborne Duration": "에어본 지속시간",
  "Ally Bonus Armor": "아군 추가 방어력",
  "Ally Bonus Magic Damage": "아군 추가 마법 피해",
  "Ally Bonus Magic Resistance": "아군 추가 마법 저항력",
  "Ally Bonus Shield per Tick": "아군 틱당 추가 보호막",
  "Ally Initial Shield": "아군 초기 보호막",
  "Ally Total Maximum Shield": "아군 총 최대 보호막",
  "Application Magic Damage": "적용 마법 피해",
  "Arc of Ruin Base Damage": "파멸의 호 기본 피해",
  "Armor Reduction": "방어력 감소",
  "Arrows": "화살 수",
  "Attack Damage Reduction": "공격력 감소",
  "Attack Speed per Subsequent Stack": "이후 중첩당 공격 속도",
  "Barrier Duration": "방어막 지속시간",
  "Base Attack Range Scaling": "기본 공격 사거리 비례",
  "Base Champion Heal": "기본 챔피언 회복량",
  "Base Non-Champion Heal": "기본 비챔피언 회복량",
  "Berserk Duration": "광폭화 지속시간",
  "Best Friend Heal per Hit": "절친 타격당 회복량",
  "Best Friend Total Heal": "절친 총 회복량",
  "Big One Physical Damage": "대형 폭탄 물리 피해",
  "Bleed Physical Damage per Tick": "출혈 틱당 물리 피해",
  "Blind Duration": "실명 지속시간",
  "Bonus Armor per Champion Hit": "챔피언 타격당 추가 방어력",
  "Bonus Attack Damage": "추가 공격력",
  "Bonus Attack Range": "추가 공격 사거리",
  "Bonus Attack Range Per Stack": "중첩당 추가 공격 사거리",
  "Bonus Champion Damage": "챔피언 대상 추가 피해",
  "Bonus Damage Cap": "추가 피해 제한",
  "Bonus Damage Per Bolt": "번개당 추가 피해",
  "Bonus Damage Per Champion": "챔피언당 추가 피해",
  "Bonus Damage Per Second": "초당 추가 피해",
  "Bonus Damage Per Stack": "중첩당 추가 피해",
  "Bonus Damage per Target Death": "대상 처치당 추가 피해"
};

// 패턴 기반 폴백 번역 함수 (ATTRIBUTE_MAP에 없는 속성도 자동 한글화)
function translateAttribute(attr) {
  if (!attr) return '';
  
  // 1. 완전 일치 확인
  if (ATTRIBUTE_MAP[attr]) return ATTRIBUTE_MAP[attr];
  
  // 2. 패턴 기반 자동 번역
  let result = attr;
  
  // 단어/구문 치환 테이블 (긴 구문을 먼저 처리)
  const patterns = [
    // 복합 구문
    ["Per Tick", "틱당"], ["per Tick", "틱당"], ["per tick", "틱당"],
    ["Per Hit", "타격당"], ["per Hit", "타격당"], ["per hit", "타격당"],
    ["Per Second", "초당"], ["per Second", "초당"], ["per second", "초당"],
    ["Per Stack", "중첩당"], ["per Stack", "중첩당"], ["per stack", "중첩당"],
    ["Per Shot", "발당"], ["per Shot", "발당"],
    ["Per Spin", "회전당"], ["per Spin", "회전당"],
    ["Per Missile", "미사일당"], ["per Missile", "미사일당"],
    ["Per Feather", "깃털당"], ["Per Arrow", "화살당"],
    ["Per Dagger", "단검당"], ["Per Bolt", "번개당"],
    ["Per Wave", "파도당"], ["Per Pass", "관통당"],
    ["Per Bullet", "탄환당"], ["per Bullet", "탄환당"],
    ["Per Flurry", "연타당"], ["Per Cluster", "군집당"],
    ["Per Explosion", "폭발당"], ["per Explosion", "폭발당"],
    ["Per Rocket", "로켓당"], ["per Rocket", "로켓당"],
    ["Per Mine", "지뢰당"], ["per Mine", "지뢰당"],
    ["Per Packmate", "무리 사냥개당"], ["per Packmate", "무리 사냥개당"],
    ["Per Needle", "바늘당"], ["Per Orb", "구체당"],
    ["Per Sphere", "구체당"],
    ["On-Hit", "적중 시"],
    ["Vs. 5 Champions", "5인 대상"],
    ["Vs Monsters", "몬스터 대상"],
    ["On Champion Hit", "챔피언 적중 시"],
    ["with Infinity Edge", "무한의 대검 적용"],
    ["with Fire at Will", "포격 개시 포함"],
    ["with Death's Daughter", "죽음의 여신 포함"],
    ["with A Thousand Cuts", "천 번의 베기"],
    ["below threshold", "임계치 이하"],
    ["into Grey Health", "회색 체력 전환"],
    // 대상/위치
    ["Non-Champion", "비챔피언 대상"], ["Non-Minion", "미니언 제외"],
    ["Non-Epic Monster", "비에픽 몬스터"],
    ["Minion/Monster", "미니언/몬스터"],
    ["Primary Target", "주 대상"],
    ["Secondary Target", "보조 대상"],
    ["Single-Target", "단일 대상"],
    ["Champion", "챔피언 대상"], ["Minion", "미니언 대상"],
    ["Monster", "몬스터 대상"],
    // 피해 유형
    ["Physical Damage", "물리 피해"], ["Magic Damage", "마법 피해"],
    ["True Damage", "고정 피해"], ["Mixed Damage", "혼합 피해"],
    ["Bonus Damage", "추가 피해"],
    // 속성
    ["Movement Speed", "이동 속도"], ["Attack Speed", "공격 속도"],
    ["Magic Resistance", "마법 저항력"], ["Magic Resist", "마법 저항력"],
    ["Shield Strength", "보호막 흡수량"],
    ["Damage Reduction", "피해 감소"],
    ["Cooldown", "재사용 대기시간"],
    // 수식어
    ["Empowered", "강화"], ["Enhanced", "강화"],
    ["Maximum", "최대"], ["Minimum", "최소"],
    ["Increased", "증가된"], ["Reduced", "감소된"],
    ["Bonus", "추가"], ["Total", "총"],
    ["Initial", "첫"], ["Subsequent", "이후"],
    ["Modified", "보정"],
    // 기본 용어
    ["Damage", "피해"], ["Shield", "보호막"], ["Heal", "회복"],
    ["Healing", "회복"], ["Armor", "방어력"],
    ["Duration", "지속시간"], ["Slow", "둔화"],
    ["Stun", "기절"], ["Root", "속박"],
    ["Silence", "침묵"], ["Fear", "공포"],
    ["Taunt", "도발"],
    ["Physical", "물리"], ["Magic", "마법"]
  ];
  
  for (const [eng, kor] of patterns) {
    if (result.includes(eng)) {
      result = result.replace(new RegExp(eng.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), kor);
    }
  }
  
  return result;
}

// 단위 및 계수 설명 한글 번역 맵 (AD, AP는 영어 유지)
const UNIT_MAP = {
  "of target's maximum health": "대상 최대 체력 비례",
  "target's maximum health": "대상 최대 체력 비례",
  "of target's missing health": "대상 잃은 체력 비례",
  "target's missing health": "대상 잃은 체력 비례",
  "of target's current health": "대상 현재 체력 비례",
  "target's current health": "대상 현재 체력 비례",
  "of target's max health": "대상 최대 체력 비례",
  "target's max health": "대상 최대 체력 비례",
  "of target's missing HP": "대상 잃은 체력 비례",
  "target's missing HP": "대상 잃은 체력 비례",
  "of target's max HP": "대상 최대 체력 비례",
  "target's max HP": "대상 최대 체력 비례",
  "of target's health": "대상 체력 비례",
  "target's health": "대상 체력 비례",
  
  "%  bonus AD": "% 추가 AD",
  "%  of target's current health": "% 대상 현재 체력 비례",
  "%  of target's maximum health": "% 대상 최대 체력 비례",
  "%  of target's missing health": "% 대상 잃은 체력 비례",
  "%  of the original damage": "% 원래 피해 비례",
  "%  of the target's maximum health": "% 대상 최대 체력 비례",
  "% (+ 0.2% per 100 bonus armor) (+ 0.2% per 100 bonus magic resistance) of target's maximum health": "% (+ 100 추가 방어력당 0.2%) (+ 100 추가 마법 저항력당 0.2%) 대상 최대 체력 비례",
  "% (+ 0.25% per 100 AP) of target's maximum health": "% (+ 100 AP당 0.25%) 대상 최대 체력 비례",
  "% (+ 0.5% per Feast stack) of target's maximum health": "% (+ 포식 중첩당 0.5%) 대상 최대 체력 비례",
  "% (+ 0.5% per Mark) of target's missing health": "% (+ 표식당 0.5%) 대상 잃은 체력 비례",
  "% (+ 0.55% per 100 AP) of the target's maximum health": "% (+ 100 AP당 0.55%) 대상 최대 체력 비례",
  "% (+ 1 / 1.5 / 2 / 2.5 / 3% per 100 AD) of target's maximum health": "% (+ 100 AD당 1 / 1.5 / 2 / 2.5 / 3%) 대상 최대 체력 비례",
  "% (+ 1% per mark) of target's current health": "% (+ 표식당 1%) 대상 현재 체력 비례",
  "% (+ 1.1% per 100 AP) of the target's maximum health": "% (+ 100 AP당 1.1%) 대상 최대 체력 비례",
  "% (+ 1.5% per 100 AP) of target's maximum health": "% (+ 100 AP당 1.5%) 대상 최대 체력 비례",
  "% (+ 1.5% per 100 bonus AD) of the target's maximum health": "% (+ 100 추가 AD당 1.5%) 대상 최대 체력 비례",
  "% (+ 1.5% per Feast stack) of target's maximum health": "% (+ 포식 중첩당 1.5%) 대상 최대 체력 비례",
  "% (+ 1.5% per mark) of target's current health": "% (+ 표식당 1.5%) 대상 현재 체력 비례",
  "% (+ 1.6% per 100 bonus armor) (+ 1.6% per 100 bonus magic resistance) of target's maximum health": "% (+ 100 추가 방어력당 1.6%) (+ 100 추가 마법 저항력당 1.6%) 대상 최대 체력 비례",
  "% (+ 1.65% per 100 AP) of the target's maximum health": "% (+ 100 AP당 1.65%) 대상 최대 체력 비례",
  "% (+ 2 / 3 / 4 / 5 / 6% per 100 AD) of target's maximum health": "% (+ 100 AD당 2 / 3 / 4 / 5 / 6%) 대상 최대 체력 비례",
  "% (+ 2% per 100 AP) of target's maximum health": "% (+ 100 AP당 2%) 대상 최대 체력 비례",
  "% (+ 2% per 100 bonus AD) (+ 0.4% per 100 bonus health) of target's maximum health": "% (+ 100 추가 AD당 2%) (+ 100 추가 체력당 0.4%) 대상 최대 체력 비례",
  "% (+ 2% per 100 bonus AD) of the target's maximum health": "% (+ 100 추가 AD당 2%) 대상 최대 체력 비례",
  "% (+ 2% per 100 bonus armor) (+ 2% per 100 bonus magic resistance) of target's maximum health": "% (+ 100 추가 방어력당 2%) (+ 100 추가 마법 저항력당 2%) 대상 최대 체력 비례",
  "% (+ 2%) (+ 0.75% (+ 0.2%) per Mark) of target's missing health": "% (+ 2%) (+ 표식당 0.75% (+ 0.2%)) 대상 잃은 체력 비례",
  "% (+ 2.5% per 100 AP) of target's maximum health": "% (+ 100 AP당 2.5%) 대상 최대 체력 비례",
  "% (+ 2.5% per 100 bonus AD) of the target's missing health": "% (+ 100 추가 AD당 2.5%) 대상 잃은 체력 비례",
  "% (+ 2.75% per 100 AP) of the target's maximum health": "% (+ 100 AP당 2.75%) 대상 최대 체력 비례",
  "% (+ 2.75% per 100 bonus AD) of the target's missing health": "% (+ 100 추가 AD당 2.75%) 대상 잃은 체력 비례",
  "% (+ 25% per 100 bonus AD) of expended Grit": "% (+ 100 추가 AD당 25%) 소모한 투지 비례",
  "% (+ 3% per 100 AP) of target's current health": "% (+ 100 AP당 3%) 대상 현재 체력 비례",
  "% (+ 3% per 100 AP) of target's maximum health": "% (+ 100 AP당 3%) 대상 최대 체력 비례",
  "% (+ 3% per 100 AP) of target's missing health": "% (+ 100 AP당 3%) 대상 잃은 체력 비례",
  "% (+ 3% per 100 bonus AD) of the target's maximum health": "% (+ 100 추가 AD당 3%) 대상 최대 체력 비례",
  "% (+ 3.3% per 100 AP) of the target's maximum health": "% (+ 100 AP당 3.3%) 대상 최대 체력 비례",
  "% (+ 3.6% per 100 bonus armor) (+ 3.6% per 100 bonus magic resistance) of target's maximum health": "% (+ 100 추가 방어력당 3.6%) (+ 100 추가 마법 저항력당 3.6%) 대상 최대 체력 비례",
  "% (+ 4% per 100 bonus AD) of the target's maximum health": "% (+ 100 추가 AD당 4%) 대상 최대 체력 비례",
  "% (+ 4.5% per 100 AP) of target's maximum health": "% (+ 100 AP당 4.5%) 대상 최대 체력 비례",
  "% (+ 4.95% per 100 AP) of the target's maximum health": "% (+ 100 AP당 4.95%) 대상 최대 체력 비례",
  "% (+ 6% per 100 AP) of target's maximum health": "% (+ 100 AP당 6%) 대상 최대 체력 비례",
  "% (+ 7% per 100 AP) of the target's maximum health": "% (+ 100 AP당 7%) 대상 최대 체력 비례",
  "% AD": "% AD",
  "% AP": "% AP",
  "% AP per 100 bonus health": "% AP (100 추가 체력당)",
  "% armor": "% 방어력",
  "% bonus AD": "% 추가 AD",
  "% bonus armor": "% 추가 방어력",
  "% bonus health": "% 추가 체력",
  "% bonus magic resistance": "% 추가 마법 저항력",
  "% bonus mana": "% 추가 마나",
  "% bonus movement speed": "% 추가 이동 속도",
  "% life steal": "% 생명력 흡수",
  "% maximum health": "% 최대 체력",
  "% maximum mana": "% 최대 마나",
  "% missing health": "% 잃은 체력",
  "% of Braum's maximum health": "% 브라움 최대 체력 비례",
  "% of Ivern's AP": "% 아이번 AP 비례",
  "% of Siphoning Strike stacks": "% 흡수의 일격 중첩 비례",
  "% of Sona's AP": "% 소나 AP 비례",
  "% of Taric's armor": "% 타릭 방어력 비례",
  "% of Zac's maximum health": "% 자크 최대 체력 비례",
  "% of damage dealt": "% 가한 피해량 비례",
  "% of damage stored": "% 저장된 피해량 비례",
  "% of her maximum health": "% 최대 체력 비례",
  "% of his bonus health": "% 추가 체력 비례",
  "% of his maximum health": "% 최대 체력 비례",
  "% of his missing health": "% 잃은 체력 비례",
  "% of maximum health": "% 최대 체력 비례",
  "% of missing health": "% 잃은 체력 비례",
  "% of missing mana": "% 잃은 마나 비례",
  "% of primary target's bonus health": "% 주 대상 추가 체력 비례",
  "% of target's armor": "% 대상 방어력 비례",
  "% of target's current health": "% 대상 현재 체력 비례",
  "% of target's maximum health": "% 대상 최대 체력 비례",
  "% of target's missing health": "% 대상 잃은 체력 비례",
  "% of the target's maximum health": "% 대상 최대 체력 비례",
  "% of turret's maximum health": "% 포탑 최대 체력 비례",
  "% per 1% of health lost in the past 4 seconds": "% (지난 4초간 잃은 체력 1%당)",
  "% per 100 AD": "% (100 AD당)",
  "% per 100 AP": "% (100 AP당)",
  "% per 100 Pantheon's bonus health": "% (판테온 추가 체력 100당)",
  "% per 100 bonus AD": "% (100 추가 AD당)",
  "% per 100 bonus health": "% (100 추가 체력당)",
  "% per 100 bonus magic resistance": "% (100 추가 마법 저항력당)",
  "% per 100 of Sona's AP": "% (소나 AP 100당)",
  "% per 100% bonus attack speed": "% (100% 추가 공격 속도당)",
  "% total armor": "% 총 방어력",
  "% total magic resistance": "% 총 마법 저항력",
  "(+ (3.1% Stardust)% of target's maximum health": "(+ (성가루 3.1%)% 대상 최대 체력 비례)",
  "(+ 3.5% AP) per Overwhelm stack on the target": "(+ 3.5% AP) 대상의 압도 중첩당",
  "+ 0.3 per 100% bonus attack speed": "+ 0.3 (100% 추가 공격 속도당)",
  
  "based on critical strike chance": "치명타 확률 비례",
  "chunks of ice": "얼음 조각",
  "per 1% missing health": "잃은 체력 1%당",
  "per 4% critical strike chance": "치명타 확률 4%당",
  "per Mist collected": "수집한 안개 중첩당",
  "per Soul collected": "수집한 영혼 중첩당",
  "seconds": "초",
  "soldiers": "모래 병사",
  "units": "유닛",

  "bonus health": "추가 체력",
  "maximum health": "최대 체력",
  "max health": "최대 체력",
  "missing health": "잃은 체력",
  "bonus AD": "추가 AD",
  "total AD": "총 AD",
  "AD": "AD",
  "AP": "AP",
  "armor": "방어력",
  "magic resist": "마법 저항력",
  "bonus armor": "추가 방어력",
  "bonus magic resist": "추가 마법 저항력",
  "mana": "마나",
  "energy": "기력"
};

// 단위/계수 영문 텍스트 번역 함수
function translateUnit(unitStr) {
  if (!unitStr) return '';
  let trimmed = unitStr.trim();
  
  // 단일 % 기호인 경우 그대로 반환
  if (trimmed === '%') return '%';
  
  const lower = trimmed.toLowerCase();
  
  // 단독 시간(초) 단위를 가리키는 영문자의 경우 아포스트로피 's 등과 혼동하지 않도록 단독 완전일치로만 처리
  if (lower === 's' || lower === 'sec' || lower === 'second' || lower === 'seconds') {
    return '초';
  }
  
  // 완전 일치 대조 (긴 문장 통째 변환 1순위)
  if (UNIT_MAP[trimmed]) {
    return UNIT_MAP[trimmed];
  }
  if (UNIT_MAP[lower]) {
    return UNIT_MAP[lower];
  }
  
  // 복합 텍스트 부분 치환 (replaceAll로 특수 문자 크래시 방지)
  let result = trimmed;
  const sortedEntries = Object.entries(UNIT_MAP).sort((a, b) => b[0].length - a[0].length);
  
  for (const [eng, kor] of sortedEntries) {
    result = result.replaceAll(eng, kor);
  }
  return result;
}

// 로컬에 보관된 Meraki 스펙 데이터를 최초 1회 일괄 로드 (CORS 및 속도제한 완벽 해결)
async function loadMerakiData() {
  try {
    const response = await fetch('champions.json');
    if (!response.ok) throw new Error('로컬 스펙 데이터 로드 실패');
    state.merakiChampions = await response.json();
    console.log('로컬 챔피언 스펙 데이터 로드 완료');
  } catch (error) {
    console.warn('로컬 스펙 데이터 로드 실패 (계수가 생략될 수 있습니다):', error);
  }
}

// DDragon ID와 Meraki 챔피언 Key 간의 불일치를 보정해주는 매핑 함수
function findMerakiChampion(championId, detailData) {
  if (!state.merakiChampions) return null;
  
  // 1. DDragon ID로 직접 찾기 (예: Garen, Ahri)
  if (state.merakiChampions[championId]) {
    return state.merakiChampions[championId];
  }
  
  // 2. 대소문자 무관 대조하여 찾기
  const lowerId = championId.toLowerCase();
  const foundKey = Object.keys(state.merakiChampions).find(k => k.toLowerCase() === lowerId);
  if (foundKey) {
    return state.merakiChampions[foundKey];
  }

  // 3. 고유 숫자 ID 대조하여 찾기 (가장 정확함 - 오공 MonkeyKing "62" 등 매핑 성공)
  const numericKey = parseInt(detailData.key);
  const foundByNumericKey = Object.values(state.merakiChampions).find(c => c.id === numericKey);
  if (foundByNumericKey) {
    return foundByNumericKey;
  }

  // 4. 한글 이름 또는 영문명 매칭 Fallback
  const foundByName = Object.values(state.merakiChampions).find(c => c.name.toLowerCase() === detailData.name.toLowerCase());
  if (foundByName) {
    return foundByName;
  }
  
  return null;
}

// 스킬의 기본 스펙 및 계수 HTML 생성
function getSkillSpecsHtml(merakiSpell) {
  if (!merakiSpell || !merakiSpell.effects || merakiSpell.effects.length === 0) return '';
  
  let html = '<div class="skill-specs-box">';
  let hasSpecs = false;

  merakiSpell.effects.forEach(effect => {
    if (effect.leveling && effect.leveling.length > 0) {
      effect.leveling.forEach(lvl => {
        // ATTRIBUTE_MAP 우선 조회 → 없으면 패턴 기반 자동 번역
        const attrName = translateAttribute(lvl.attribute);
        const modifiers = lvl.modifiers;
        
        if (modifiers && modifiers.length > 0) {
          hasSpecs = true;
          
          // 기본 수치들 (스킬 레벨별)
          const baseValues = modifiers[0].values.map(v => Math.round(v * 100) / 100).join(' / ');
          const rawBaseUnit = modifiers[0].units[0] || '';
          let baseUnit = translateUnit(rawBaseUnit);
          
          // 베이스 유닛 포맷팅 (색상 및 띄어쓰기)
          if (baseUnit) {
            // 앞에 '%'가 오면 띄어쓰기 확보, 텍스트가 오면 띄어쓰기 확보
            if (baseUnit.startsWith('%')) {
              baseUnit = '% ' + baseUnit.substring(1).trim();
            } else if (!baseUnit.startsWith(' ')) {
              baseUnit = ' ' + baseUnit;
            }
            
            const lowerRawBase = rawBaseUnit.toLowerCase();
            let baseScaleType = '';
            if (lowerRawBase.includes('health') || lowerRawBase.includes('hp')) {
              baseScaleType = 'scaling-hp';
            } else if (lowerRawBase.includes('ad') || lowerRawBase.includes('attack damage')) {
              baseScaleType = 'scaling-ad';
            } else if (lowerRawBase.includes('ap') || lowerRawBase.includes('ability power')) {
              baseScaleType = 'scaling-ap';
            }
            
            // 색상을 입히기 위해 span으로 감싸기
            if (baseScaleType) {
              if (baseUnit.startsWith('% ')) {
                baseUnit = '% <span class="' + baseScaleType + '">' + baseUnit.substring(2) + '</span>';
              } else {
                baseUnit = ' <span class="' + baseScaleType + '">' + baseUnit.substring(1).trim() + '</span>';
              }
            }
          }
          
          // 계수 수치들 (AD, AP, 추가 체력 등)
          let scalingStr = '';
          if (modifiers.length > 1) {
            const scalings = modifiers.slice(1).map(mod => {
              const val = Math.round(mod.values[0] * 100) / 100;
              const unit = mod.units[0] || '';
              const translatedUnit = translateUnit(unit);
              
              // AD, AP, HP 등 계수 명칭 포맷팅 및 타입 분류
              let scaleType = 'other';
              const lowerUnit = unit.toLowerCase();
              
              if (lowerUnit.includes('ad')) {
                scaleType = 'ad';
              } else if (lowerUnit.includes('ap')) {
                scaleType = 'ap';
              } else if (lowerUnit.includes('health') || lowerUnit.includes('hp')) {
                scaleType = 'hp';
              }
              
              let cleanTranslated = translatedUnit;
              if (cleanTranslated.startsWith('%')) {
                cleanTranslated = cleanTranslated.replace(/^%\s*/, '');
              }
              
              return `<span class="scaling-ratio scaling-${scaleType}">(+ ${val}% ${cleanTranslated})</span>`;
            }).join(' ');
            
            scalingStr = ` ${scalings}`;
          }
          
          html += `
            <div class="spec-line">
              <span class="spec-attr">${attrName}</span>
              <span class="spec-val">${baseValues}${baseUnit}${scalingStr}</span>
            </div>
          `;
        }
      });
    }
  });

  html += '</div>';
  return hasSpecs ? html : '';
}

// ===========================
// 전적 검색 기능
// ===========================

// 큐 타입 ID → 한글 이름
const QUEUE_MAP = {
  420: '솔로 랭크',
  440: '자유 랭크',
  430: '일반',
  450: '칼바람 나락',
  490: '일반 (빠른 대전)',
  400: '일반',
  700: '격전',
  720: '격전',
  830: 'AI 대전 (입문)',
  840: 'AI 대전 (초보)',
  850: 'AI 대전 (중급)',
  900: 'URF',
  1020: '단일 챔피언',
  1300: '돌격 넥서스',
  1400: '궁극기 주문서',
  1700: '아레나',
  1710: '아레나',
  1900: 'URF',
  0: '커스텀'
};

function getQueueName(queueId) {
  return QUEUE_MAP[queueId] || '기타';
}

// 게임 시간 포맷팅
function formatGameDuration(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}분 ${sec}초`;
}

// 랭크 티어 한글 변환
const TIER_MAP = {
  'IRON': '아이언',
  'BRONZE': '브론즈',
  'SILVER': '실버',
  'GOLD': '골드',
  'PLATINUM': '플래티넘',
  'EMERALD': '에메랄드',
  'DIAMOND': '다이아몬드',
  'MASTER': '마스터',
  'GRANDMASTER': '그랜드마스터',
  'CHALLENGER': '챌린저'
};

function getTierName(tier) {
  return TIER_MAP[tier] || tier;
}

// 전적 검색 핸들러
async function handleMatchSearch() {
  const input = elements.matchSearchInput.value.trim();
  if (!input || state.matchSearching) return;

  // 소환사명#태그 파싱 (태그가 없으면 기본값 #KR1 자동 추가)
  let query = input;
  if (!query.includes('#')) {
    query += '#KR1';
    // 사용자가 입력창에서도 추가된 태그를 볼 수 있도록 업데이트
    elements.matchSearchInput.value = query;
  }

  const parts = query.split('#');
  const gameName = parts[0].trim();
  const tagLine = parts.slice(1).join('#').trim();

  state.matchSearching = true;
  elements.matchSearchBtn.disabled = true;
  elements.matchSearchBtn.textContent = '검색 중...';

  // 프로필 영역에 로딩 표시
  elements.summonerProfile.classList.remove('hidden');
  elements.summonerProfile.innerHTML = `
    <div class="match-loading">
      <div class="spinner"></div>
      <p>소환사 정보를 불러오는 중...</p>
    </div>
  `;
  elements.matchList.innerHTML = '';
    elements.summonerProfileHeader.classList.remove('hidden');
    elements.summonerProfileHeader.innerHTML = `
      <div class="match-error">
        <p>❌ ${error.message || '소환사를 찾을 수 없습니다.'}</p>
        <p style="font-size:12px; margin-top:8px; color:var(--text-sub);">소환사명#태그를 다시 확인해주세요.</p>
      </div>
    `;
  } finally {
    state.matchSearching = false;
    elements.matchSearchBtn.disabled = false;
    elements.matchSearchBtn.textContent = '검색';
  }
}

// 소환사 검색 (Account → Summoner → League → Matches)
async function searchSummoner(gameName, tagLine) {
  // 1. Account-V1: 소환사명#태그 → PUUID
  const accountRes = await fetch(`/api/riot/account/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
  if (!accountRes.ok) {
    const err = await accountRes.json().catch(() => ({}));
    throw new Error(accountRes.status === 404 ? '소환사를 찾을 수 없습니다.' : (err.error || 'Account API 오류'));
  }
  const accountData = await accountRes.json();

  // 2. Summoner-V4: PUUID → 소환사 프로필
  const summonerRes = await fetch(`/api/riot/summoner/${accountData.puuid}`);
  if (!summonerRes.ok) throw new Error('소환사 정보를 가져올 수 없습니다.');
  const summonerData = await summonerRes.json();

  // 3. League-V4: PUUID → 랭크 정보
  const leagueRes = await fetch(`/api/riot/league/${accountData.puuid}`);
  const leagueData = leagueRes.ok ? await leagueRes.json() : [];

  // 프로필 저장
  state.summonerProfile = {
    puuid: accountData.puuid,
    gameName: accountData.gameName,
    tagLine: accountData.tagLine,
    summonerLevel: summonerData.summonerLevel,
    profileIconId: summonerData.profileIconId,
    summonerId: summonerData.id,
    ranks: leagueData
  };

  // 프로필 렌더링
  renderMatchProfile();

  // 검색 성공 시 최근 검색어에 저장
  saveRecentSearch(accountData.gameName, accountData.tagLine);

  // 4. Match-V5: 최근 20매치 ID 로드
  await loadMatchHistory(accountData.puuid);
}

// 프로필 영역 렌더링 (헤더 + 랭크 사이드바)
function renderMatchProfile() {
  const p = state.summonerProfile;
  if (!p) return;

  const iconUrl = `https://ddragon.leagueoflegends.com/cdn/${state.version}/img/profileicon/${p.profileIconId}.png`;

  // 1. 전체 프로필 헤더 렌더링
  elements.summonerProfileHeader.classList.remove('hidden');
  elements.matchDashboard.classList.remove('hidden'); // 대시보드 구조 보이기
  
  elements.summonerProfileHeader.innerHTML = `
    <div class="profile-header-inner">
      <div class="profile-header-top">
        <div class="profile-icon-wrap">
          <img src="${iconUrl}" alt="프로필 아이콘">
          <span class="profile-level">${p.summonerLevel}</span>
        </div>
        <div class="profile-info">
          <h2>${p.gameName} <span class="profile-tag">#${p.tagLine}</span></h2>
          <div class="profile-actions">
            <button class="btn-refresh" onclick="document.getElementById('match-search-btn').click()">전적 갱신</button>
          </div>
        </div>
      </div>
      <div class="profile-tabs">
        <div class="profile-tab active">종합</div>
        <div class="profile-tab">챔피언</div>
        <div class="profile-tab">인게임 정보</div>
      </div>
    </div>
  `;

  // 2. 좌측 랭크 위젯 렌더링
  const soloRank = p.ranks.find(r => r.queueType === 'RANKED_SOLO_5x5');
  const flexRank = p.ranks.find(r => r.queueType === 'RANKED_FLEX_SR');

  function rankHtml(rank, label) {
    if (!rank) {
      return `
        <div class="rank-box">
          <div class="rank-box-header">${label}</div>
          <div class="rank-box-content">
            <div class="rank-icon"><span style="color:var(--text-sub);font-size:12px;">Unranked</span></div>
            <div class="rank-details">
              <div class="rank-tier" style="color:var(--text-sub);">Unranked</div>
            </div>
          </div>
        </div>
      `;
    }
    const wins = rank.wins;
    const losses = rank.losses;
    const total = wins + losses;
    const winrate = total > 0 ? Math.round((wins / total) * 100) : 0;
    return `
      <div class="rank-box">
        <div class="rank-box-header">${label}</div>
        <div class="rank-box-content">
          <div class="rank-icon">
            <!-- 티어 이미지 매핑은 향후 고도화 가능. 현재는 텍스트 위주 -->
            <span style="font-size:12px;font-weight:bold;color:var(--color-gold);">${rank.tier.charAt(0)}${rank.tier.slice(1).toLowerCase()}</span>
          </div>
          <div class="rank-details">
            <div class="rank-tier">${getTierName(rank.tier)} ${rank.rank}</div>
            <div class="rank-lp">${rank.leaguePoints} LP</div>
            <div class="rank-winrate">${wins}승 ${losses}패 (${winrate}%)</div>
          </div>
        </div>
      </div>
    `;
  }

  elements.rankInfo.innerHTML = `
    ${rankHtml(soloRank, '솔로 랭크')}
    ${rankHtml(flexRank, '자유 랭크')}
  `;
}

// 매치 히스토리 로드
async function loadMatchHistory(puuid) {
  // 로딩 표시
  elements.matchList.innerHTML = `
    <div class="match-loading">
      <div class="spinner"></div>
      <p>전적을 불러오는 중...</p>
    </div>
  `;

  // 매치 ID 목록 가져오기
  const matchIdsRes = await fetch(`/api/riot/matches/${puuid}?count=20`);
  if (!matchIdsRes.ok) throw new Error('매치 목록을 가져올 수 없습니다.');
  const matchIds = await matchIdsRes.json();
  state.matchIds = matchIds;

  if (matchIds.length === 0) {
    elements.matchList.innerHTML = `
      <div class="match-empty">
        <div class="empty-icon">📋</div>
        <h3>전적 없음</h3>
        <p>최근 전적이 없습니다.</p>
      </div>
    `;
    return;
  }

  // 매치 상세 데이터 병렬 로드 (5개씩 배치)
  state.matchDetails = {};
  elements.matchList.innerHTML = `
    <div class="match-loading">
      <div class="spinner"></div>
      <p>전적 상세 정보 로딩 중 (0/${matchIds.length})...</p>
    </div>
  `;

  const batchSize = 5;
  for (let i = 0; i < matchIds.length; i += batchSize) {
    const batch = matchIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (matchId) => {
        if (state.matchDetails[matchId]) return state.matchDetails[matchId];
        const res = await fetch(`/api/riot/match/${matchId}`);
        if (!res.ok) throw new Error(`매치 ${matchId} 로드 실패`);
        return res.json();
      })
    );

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        state.matchDetails[batch[idx]] = result.value;
      }
    });

    // 진행 상황 업데이트
    const loadingEl = elements.matchList.querySelector('.match-loading p');
    if (loadingEl) {
      loadingEl.textContent = `전적 상세 정보 로딩 중 (${Math.min(i + batchSize, matchIds.length)}/${matchIds.length})...`;
    }
  }

  // 전적 리스트 렌더링
  renderMatchList();
}

// 전적 리스트 렌더링
function renderMatchList() {
  elements.matchList.innerHTML = '';
  const puuid = state.summonerProfile?.puuid;

  state.matchIds.forEach(matchId => {
    const match = state.matchDetails[matchId];
    if (!match) return;

    const info = match.info;
    const me = info.participants.find(p => p.puuid === puuid);
    if (!me) return;

    const isWin = me.win;
    const isRemake = info.gameDuration < 300;
    const resultClass = isRemake ? 'remake' : (isWin ? 'win' : 'lose');
    const resultText = isRemake ? '다시하기' : (isWin ? '승리' : '패배');

    const champImg = `https://ddragon.leagueoflegends.com/cdn/${state.version}/img/champion/${me.championName}.png`;
    const kda = me.deaths === 0 ? 'Perfect' : ((me.kills + me.assists) / me.deaths).toFixed(2);
    const cs = me.totalMinionsKilled + (me.neutralMinionsKilled || 0);
    const gameDuration = formatGameDuration(info.gameDuration);
    const queueName = getQueueName(info.queueId);

    // 아이템 이미지들
    const itemSlots = [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5, me.item6];
    const itemsHtml = itemSlots.map(itemId => {
      if (itemId && itemId > 0) {
        return `<img src="https://ddragon.leagueoflegends.com/cdn/${state.version}/img/item/${itemId}.png" alt="아이템">`;
      }
      return '<div class="item-empty"></div>';
    }).join('');

    // 게임 시간 ago 계산
    const gameEndTime = info.gameEndTimestamp || (info.gameStartTimestamp + info.gameDuration * 1000);
    const agoMs = Date.now() - gameEndTime;
    const agoMin = Math.floor(agoMs / 60000);
    const agoHour = Math.floor(agoMin / 60);
    const agoDay = Math.floor(agoHour / 24);
    let agoText = '';
    if (agoDay > 0) agoText = `${agoDay}일 전`;
    else if (agoHour > 0) agoText = `${agoHour}시간 전`;
    else agoText = `${agoMin}분 전`;

    const card = document.createElement('div');
    card.className = `match-card ${resultClass}`;
    if (matchId === state.selectedMatchId) card.classList.add('selected');

    card.innerHTML = `
      <img class="mc-champ" src="${champImg}" alt="${me.championName}">
      <div class="mc-info">
        <div class="mc-result ${resultClass}">${resultText}</div>
        <div class="mc-queue">${queueName}</div>
      </div>
      <div>
        <div class="mc-kda">${me.kills} / <span style="color:#f87171">${me.deaths}</span> / ${me.assists}</div>
        <div class="mc-kda-ratio">KDA ${kda}</div>
      </div>
      <div class="mc-cs-time">
        <div>CS ${cs}</div>
        <div>${gameDuration}</div>
        <div style="font-size:10px;color:var(--text-sub)">${agoText}</div>
      </div>
      <div class="mc-items">${itemsHtml}</div>
    `;

    card.addEventListener('click', () => {
      // 기존 선택 해제
      document.querySelectorAll('.match-card.selected').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedMatchId = matchId;
      showMatchDetail(matchId);
    });

    elements.matchList.appendChild(card);
  });
}

// 매치 상세 정보 표시 (우측 패널)
function showMatchDetail(matchId) {
  const match = state.matchDetails[matchId];
  if (!match) return;

  const info = match.info;
  const puuid = state.summonerProfile?.puuid;
  const me = info.participants.find(p => p.puuid === puuid);
  const isWin = me?.win;
  const isRemake = info.gameDuration < 300;
  const resultText = isRemake ? '다시하기' : (isWin ? '승리' : '패배');
  const resultClass = isRemake ? 'remake' : (isWin ? 'win' : 'lose');

  const gameDuration = formatGameDuration(info.gameDuration);
  const queueName = getQueueName(info.queueId);

  // 게임 날짜
  const gameDate = new Date(info.gameStartTimestamp);
  const dateStr = `${gameDate.getFullYear()}.${String(gameDate.getMonth() + 1).padStart(2, '0')}.${String(gameDate.getDate()).padStart(2, '0')} ${String(gameDate.getHours()).padStart(2, '0')}:${String(gameDate.getMinutes()).padStart(2, '0')}`;

  // 팀 분리
  const blueTeam = info.participants.filter(p => p.teamId === 100);
  const redTeam = info.participants.filter(p => p.teamId === 200);

  // 팀 결과
  const blueWin = info.teams?.find(t => t.teamId === 100)?.win;
  const redWin = info.teams?.find(t => t.teamId === 200)?.win;

  function teamTableHtml(team, teamName, teamColor, teamWon) {
    const resultLabel = isRemake ? '다시하기' : (teamWon ? '승리' : '패배');
    let rows = '';
    team.forEach(p => {
      const isMe = p.puuid === puuid;
      const champImg = `https://ddragon.leagueoflegends.com/cdn/${state.version}/img/champion/${p.championName}.png`;
      const cs = p.totalMinionsKilled + (p.neutralMinionsKilled || 0);
      const kda = p.deaths === 0 ? 'Perfect' : ((p.kills + p.assists) / p.deaths).toFixed(2);
      const damage = p.totalDamageDealtToChampions;

      const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6];
      const itemsHtml = items.map(id => {
        if (id && id > 0) {
          return `<img src="https://ddragon.leagueoflegends.com/cdn/${state.version}/img/item/${id}.png" alt="">`;
        }
        return '<div class="item-empty"></div>';
      }).join('');

      rows += `
        <tr class="${isMe ? 'is-me' : ''}">
          <td>
            <div class="td-champ">
              <img src="${champImg}" alt="${p.championName}">
              <span class="champ-name">${p.championName}</span>
            </div>
          </td>
          <td class="td-summoner" title="${p.riotIdGameName || p.summonerName || ''}">${p.riotIdGameName || p.summonerName || '알 수 없음'}</td>
          <td class="td-kda">${p.kills}/${p.deaths}/${p.assists} <span style="font-size:11px;color:var(--text-sub)">(${kda})</span></td>
          <td>${cs}</td>
          <td>${damage.toLocaleString()}</td>
          <td><div class="td-items">${itemsHtml}</div></td>
        </tr>
      `;
    });

    return `
      <div class="team-table-header ${teamColor}">${teamName} (${resultLabel})</div>
      <table class="team-table">
        <thead>
          <tr>
            <th>챔피언</th>
            <th>소환사</th>
            <th>KDA</th>
            <th>CS</th>
            <th>피해량</th>
            <th>아이템</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  elements.matchEmptyState.classList.add('hidden');
  elements.matchDetailContent.classList.remove('hidden');
  elements.matchDetailContent.innerHTML = `
    <div class="match-detail-header">
      <span class="md-result ${resultClass}">${resultText}</span>
      <div class="md-meta">
        <div>${queueName} · ${gameDuration}</div>
        <div>${dateStr}</div>
      </div>
    </div>
    ${teamTableHtml(blueTeam, '블루팀', 'blue', blueWin)}
    ${teamTableHtml(redTeam, '레드팀', 'red', redWin)}
  `;
}

// 자동완성: 최근 검색어 저장
function saveRecentSearch(gameName, tagLine) {
  const key = 'lol-db-recent-searches';
  let searches = [];
  try {
    searches = JSON.parse(localStorage.getItem(key)) || [];
    if (!Array.isArray(searches)) searches = [];
  } catch (e) {
    searches = [];
  }
  
  const query = `${gameName}#${tagLine}`;
  
  // 기존 중복 제거 후 맨 앞에 추가
  searches = searches.filter(s => s.toLowerCase() !== query.toLowerCase());
  searches.unshift(query);
  
  // 최대 8개까지 유지
  if (searches.length > 8) {
    searches.pop();
  }
  
  localStorage.setItem(key, JSON.stringify(searches));
}

// 자동완성: 최근 검색어 삭제
function deleteRecentSearch(query, event) {
  if (event) event.stopPropagation(); // 부모 클릭 이벤트 방지
  
  const key = 'lol-db-recent-searches';
  let searches = [];
  try {
    searches = JSON.parse(localStorage.getItem(key)) || [];
    if (!Array.isArray(searches)) searches = [];
  } catch (e) {
    searches = [];
  }
  
  searches = searches.filter(s => s !== query);
  localStorage.setItem(key, JSON.stringify(searches));
  
  // 갱신 후 다시 보여주기
  showAutocomplete();
}

// 자동완성: 목록 노출 및 렌더링
function showAutocomplete() {
  const listEl = elements.matchAutocompleteList;
  const inputVal = elements.matchSearchInput.value.trim().toLowerCase();
  
  const key = 'lol-db-recent-searches';
  let searches = [];
  try {
    searches = JSON.parse(localStorage.getItem(key)) || [];
    if (!Array.isArray(searches)) searches = [];
  } catch (e) {
    searches = [];
  }
  
  // 입력값이 있으면 최근 검색어 중 매칭되는 항목 필터링 (로컬 자동완성)
  const filtered = inputVal
    ? searches.filter(s => s.toLowerCase().includes(inputVal))
    : searches;
    
  if (filtered.length === 0) {
    if (!inputVal) {
      listEl.innerHTML = '<div class="autocomplete-empty">최근 검색어가 없습니다.</div>';
      listEl.classList.remove('hidden');
    } else {
      listEl.classList.add('hidden'); // 매칭 검색어가 없으면 닫음
    }
    return;
  }
  
  listEl.innerHTML = '';
  filtered.forEach(query => {
    const parts = query.split('#');
    const name = parts[0];
    const tag = parts[1] || '';
    
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    
    item.innerHTML = `
      <div class="autocomplete-info">
        <span class="autocomplete-name">${name}</span>
        <span class="autocomplete-tag">#${tag}</span>
      </div>
      <button class="autocomplete-delete-btn" title="삭제">&times;</button>
    `;
    
    // 클릭 시 바로 검색
    item.addEventListener('click', () => {
      elements.matchSearchInput.value = query;
      listEl.classList.add('hidden');
      handleMatchSearch();
    });
    
    // 삭제 버튼 이벤트
    const deleteBtn = item.querySelector('.autocomplete-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      deleteRecentSearch(query, e);
    });
    
    listEl.appendChild(item);
  });
  
  listEl.classList.remove('hidden');
}

// 자동완성: 닫기
function hideAutocomplete() {
  setTimeout(() => {
    elements.matchAutocompleteList.classList.add('hidden');
  }, 200); // 아이템 클릭 이벤트가 먼저 실행되도록 약간 지연
}
