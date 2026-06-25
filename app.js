console.log('DEX app.js v1.0.3 loaded');

// 글로벌 상태 객체
const state = {
  version: '14.3.1', // 초기값, api 통신 후 동적으로 갱신됨
  champions: [],
  items: [],
  currentTab: 'champions', // 'champions' | 'items'
  searchQuery: '',
  activeFilter: 'ALL',
  selectedId: null,
  // 챔피언 상세 정보 캐시
  championDetails: {},
  // 로컬 로드된 챔피언 상세 스펙 캐시
  merakiChampions: null
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
  searchInput: document.getElementById('search-input'),
  clearSearchBtn: document.getElementById('clear-search-btn'),
  filterGroup: document.getElementById('filter-group'),
  listGrid: document.getElementById('list-grid'),
  emptyDetailState: document.getElementById('empty-detail-state'),
  detailContentArea: document.getElementById('detail-content-area')
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

    // 2. 챔피언 및 아이템 데이터 로드
    await Promise.all([
      loadChampions(),
      loadItems()
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

  // 버튼 스타일 업데이트
  if (tab === 'champions') {
    elements.tabChampions.classList.add('active');
    elements.tabItems.classList.remove('active');
    elements.searchInput.placeholder = '챔피언 이름을 입력하여 검색...';
  } else {
    elements.tabItems.classList.add('active');
    elements.tabChampions.classList.remove('active');
    elements.searchInput.placeholder = '아이템 이름을 입력하여 검색...';
  }

  // 뷰 초기화
  elements.emptyDetailState.classList.remove('hidden');
  elements.detailContentArea.classList.add('hidden');

  renderFilters();
  renderList();
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

  // 로컬 Meraki 상세 스펙 데이터 최초 1회 일괄 로드
  if (!state.merakiChampions) {
    await loadMerakiData();
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
// 한글 맵핑 딕셔너리 (전체 챔피언의 모든 고유 속성 100% 집대성)
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
  "True damage": "고정 피해량"
};

// 단위 및 계수 설명 한글 번역 맵 (Meraki 데이터에 포함된 모든 고유 비례/단위 표현 100% 매핑)
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
  
  "%  bonus AD": "% 추가 공격력",
  "%  of target's current health": "% 대상 현재 체력 비례",
  "%  of target's maximum health": "% 대상 최대 체력 비례",
  "%  of target's missing health": "% 대상 잃은 체력 비례",
  "%  of the original damage": "% 원래 피해 비례",
  "%  of the target's maximum health": "% 대상 최대 체력 비례",
  "% (+ 0.2% per 100 bonus armor) (+ 0.2% per 100 bonus magic resistance) of target's maximum health": "% (+ 100 추가 방어력당 0.2%) (+ 100 추가 마법 저항력당 0.2%) 대상 최대 체력 비례",
  "% (+ 0.25% per 100 AP) of target's maximum health": "% (+ 100 주문력당 0.25%) 대상 최대 체력 비례",
  "% (+ 0.5% per Feast stack) of target's maximum health": "% (+ 포식 중첩당 0.5%) 대상 최대 체력 비례",
  "% (+ 0.5% per Mark) of target's missing health": "% (+ 표식당 0.5%) 대상 잃은 체력 비례",
  "% (+ 0.55% per 100 AP) of the target's maximum health": "% (+ 100 주문력당 0.55%) 대상 최대 체력 비례",
  "% (+ 1 / 1.5 / 2 / 2.5 / 3% per 100 AD) of target's maximum health": "% (+ 100 공격력당 1 / 1.5 / 2 / 2.5 / 3%) 대상 최대 체력 비례",
  "% (+ 1% per mark) of target's current health": "% (+ 표식당 1%) 대상 현재 체력 비례",
  "% (+ 1.1% per 100 AP) of the target's maximum health": "% (+ 100 주문력당 1.1%) 대상 최대 체력 비례",
  "% (+ 1.5% per 100 AP) of target's maximum health": "% (+ 100 주문력당 1.5%) 대상 최대 체력 비례",
  "% (+ 1.5% per 100 bonus AD) of the target's maximum health": "% (+ 100 추가 공격력당 1.5%) 대상 최대 체력 비례",
  "% (+ 1.5% per Feast stack) of target's maximum health": "% (+ 포식 중첩당 1.5%) 대상 최대 체력 비례",
  "% (+ 1.5% per mark) of target's current health": "% (+ 표식당 1.5%) 대상 현재 체력 비례",
  "% (+ 1.6% per 100 bonus armor) (+ 1.6% per 100 bonus magic resistance) of target's maximum health": "% (+ 100 추가 방어력당 1.6%) (+ 100 추가 마법 저항력당 1.6%) 대상 최대 체력 비례",
  "% (+ 1.65% per 100 AP) of the target's maximum health": "% (+ 100 주문력당 1.65%) 대상 최대 체력 비례",
  "% (+ 2 / 3 / 4 / 5 / 6% per 100 AD) of target's maximum health": "% (+ 100 공격력당 2 / 3 / 4 / 5 / 6%) 대상 최대 체력 비례",
  "% (+ 2% per 100 AP) of target's maximum health": "% (+ 100 주문력당 2%) 대상 최대 체력 비례",
  "% (+ 2% per 100 bonus AD) (+ 0.4% per 100 bonus health) of target's maximum health": "% (+ 100 추가 공격력당 2%) (+ 100 추가 체력당 0.4%) 대상 최대 체력 비례",
  "% (+ 2% per 100 bonus AD) of the target's maximum health": "% (+ 100 추가 공격력당 2%) 대상 최대 체력 비례",
  "% (+ 2% per 100 bonus armor) (+ 2% per 100 bonus magic resistance) of target's maximum health": "% (+ 100 추가 방어력당 2%) (+ 100 추가 마법 저항력당 2%) 대상 최대 체력 비례",
  "% (+ 2%) (+ 0.75% (+ 0.2%) per Mark) of target's missing health": "% (+ 2%) (+ 표식당 0.75% (+ 0.2%)) 대상 잃은 체력 비례",
  "% (+ 2.5% per 100 AP) of target's maximum health": "% (+ 100 주문력당 2.5%) 대상 최대 체력 비례",
  "% (+ 2.5% per 100 bonus AD) of the target's missing health": "% (+ 100 추가 공격력당 2.5%) 대상 잃은 체력 비례",
  "% (+ 2.75% per 100 AP) of the target's maximum health": "% (+ 100 주문력당 2.75%) 대상 최대 체력 비례",
  "% (+ 2.75% per 100 bonus AD) of the target's missing health": "% (+ 100 추가 공격력당 2.75%) 대상 잃은 체력 비례",
  "% (+ 25% per 100 bonus AD) of expended Grit": "% (+ 100 추가 공격력당 25%) 소모한 투지 비례",
  "% (+ 3% per 100 AP) of target's current health": "% (+ 100 주문력당 3%) 대상 현재 체력 비례",
  "% (+ 3% per 100 AP) of target's maximum health": "% (+ 100 주문력당 3%) 대상 최대 체력 비례",
  "% (+ 3% per 100 AP) of target's missing health": "% (+ 100 주문력당 3%) 대상 잃은 체력 비례",
  "% (+ 3% per 100 bonus AD) of the target's maximum health": "% (+ 100 추가 공격력당 3%) 대상 최대 체력 비례",
  "% (+ 3.3% per 100 AP) of the target's maximum health": "% (+ 100 주문력당 3.3%) 대상 최대 체력 비례",
  "% (+ 3.6% per 100 bonus armor) (+ 3.6% per 100 bonus magic resistance) of target's maximum health": "% (+ 100 추가 방어력당 3.6%) (+ 100 추가 마법 저항력당 3.6%) 대상 최대 체력 비례",
  "% (+ 4% per 100 bonus AD) of the target's maximum health": "% (+ 100 추가 공격력당 4%) 대상 최대 체력 비례",
  "% (+ 4.5% per 100 AP) of target's maximum health": "% (+ 100 주문력당 4.5%) 대상 최대 체력 비례",
  "% (+ 4.95% per 100 AP) of the target's maximum health": "% (+ 100 주문력당 4.95%) 대상 최대 체력 비례",
  "% (+ 6% per 100 AP) of target's maximum health": "% (+ 100 주문력당 6%) 대상 최대 체력 비례",
  "% (+ 7% per 100 AP) of the target's maximum health": "% (+ 100 주문력당 7%) 대상 최대 체력 비례",
  "% AD": "% 공격력",
  "% AP": "% 주문력",
  "% AP per 100 bonus health": "% 주문력 (100 추가 체력당)",
  "% armor": "% 방어력",
  "% bonus AD": "% 추가 공격력",
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
  "% of Ivern's AP": "% 아이번 주문력 비례",
  "% of Siphoning Strike stacks": "% 흡수의 일격 중첩 비례",
  "% of Sona's AP": "% 소나 주문력 비례",
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
  "% per 100 AD": "% (100 공격력당)",
  "% per 100 AP": "% (100 주문력당)",
  "% per 100 Pantheon's bonus health": "% (판테온 추가 체력 100당)",
  "% per 100 bonus AD": "% (100 추가 공격력당)",
  "% per 100 bonus health": "% (100 추가 체력당)",
  "% per 100 bonus magic resistance": "% (100 추가 마법 저항력당)",
  "% per 100 of Sona's AP": "% (소나 주문력 100당)",
  "% per 100% bonus attack speed": "% (100% 추가 공격 속도당)",
  "% total armor": "% 총 방어력",
  "% total magic resistance": "% 총 마법 저항력",
  "(+ (3.1% Stardust)% of target's maximum health": "(+ (성가루 3.1%)% 대상 최대 체력 비례)",
  "(+ 3.5% AP) per Overwhelm stack on the target": "(+ 3.5% 주문력) 대상의 압도 중첩당",
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
  "bonus AD": "추가 공격력",
  "total AD": "총 공격력",
  "AD": "공격력",
  "AP": "주문력",
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
  
  // Meraki 데이터에서 유입되는 중복 % 접두사 제거
  if (trimmed.startsWith('%')) {
    trimmed = trimmed.substring(1).trim();
  }
  
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
  
  // 복합 텍스트 부분 치환 (긴 문자열부터 순차적으로 치환하여 쪼개짐 방지)
  let result = trimmed;
  const sortedEntries = Object.entries(UNIT_MAP).sort((a, b) => b[0].length - a[0].length);
  
  for (const [eng, kor] of sortedEntries) {
    const regex = new RegExp(`\\b${eng}\\b`, 'gi');
    result = result.replace(regex, kor);
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
        const attrName = ATTRIBUTE_MAP[lvl.attribute] || lvl.attribute;
        const modifiers = lvl.modifiers;
        
        if (modifiers && modifiers.length > 0) {
          hasSpecs = true;
          
          // 기본 수치들 (스킬 레벨별)
          const baseValues = modifiers[0].values.map(v => Math.round(v * 100) / 100).join(' / ');
          const baseUnit = translateUnit(modifiers[0].units[0] || '');
          
          // 계수 수치들 (AD, AP, 추가 체력 등)
          let scalingStr = '';
          if (modifiers.length > 1) {
            const scalings = modifiers.slice(1).map(mod => {
              // Meraki 데이터는 이미 백분율 수치(예: 65)로 들어있으므로 100을 곱하지 않고 그대로 소수점 둘째자리 반올림하여 사용합니다.
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
              
              return `<span class="scaling-ratio scaling-${scaleType}">(+ ${val}% ${translatedUnit})</span>`;
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
