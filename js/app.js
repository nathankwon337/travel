/* ---------- storage helpers ---------- */
const LS = {
  checklist: 'trip_checklist_v1',
  reservations: 'trip_reservations_v1',
  memos: 'trip_memos_v1'
};
const SYNC_CONFIG_KEY = 'trip_sync_config_v1';
function loadLS(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(e){ return fallback; }
}
function saveLS(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){}
}
function getSyncConfig(){ return loadLS(SYNC_CONFIG_KEY, {url:''}); }
function setSyncConfig(cfg){ saveLS(SYNC_CONFIG_KEY, cfg); }
function syncUrl(){
  const c = getSyncConfig();
  return c.url && c.url.trim() ? c.url.trim() : null;
}
let syncStatus = 'idle'; /* idle | syncing | ok | error */

async function pullFromSheet(){
  const url = syncUrl();
  if(!url) return;
  syncStatus = 'syncing';
  try{
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(url + sep + 'action=getAll');
    const data = await res.json();

    checklistState = {};
    Object.keys(data.checklist||{}).forEach(k=>{
      const v = data.checklist[k];
      checklistState[k] = (v === true || v === 'TRUE' || v === 'true');
    });
    saveLS(LS.checklist, checklistState);

    reservationState = {};
    Object.keys(data.reservations||{}).forEach(k=>{
      const v = data.reservations[k];
      reservationState[k] = (v === true || v === 'TRUE' || v === 'true');
    });
    saveLS(LS.reservations, reservationState);

    if(Array.isArray(data.memos)){
      memos = data.memos.map(m => ({
        id: typeof m.id === 'number' ? m.id : (Number(m.id) || Date.now()),
        date: m.date, type: m.type, text: m.text,
        title: m.title, amount: m.amount, currency: m.currency
      }));
      saveLS(LS.memos, memos);
    }
    syncStatus = 'ok';
  }catch(err){
    syncStatus = 'error';
  }
}

function pushToSheet(action, payload){
  const url = syncUrl();
  if(!url) return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action }, payload))
  }).catch(()=>{});
}

/* ---------- data ---------- */
let DATA = { itinerary: [], detail: [], reservations: null, food: null, shopping: null, checklist: [] };
let checklistState = loadLS(LS.checklist, {});
let reservationState = loadLS(LS.reservations, {});
let memos = loadLS(LS.memos, []);

async function loadAllData(){
  const [itinerary, detail, reservations, food, shopping, checklist] = await Promise.all([
    fetch('data/itinerary.json').then(r=>r.json()),
    fetch('data/itinerary_detail.json').then(r=>r.json()),
    fetch('data/reservations.json').then(r=>r.json()),
    fetch('data/food.json').then(r=>r.json()),
    fetch('data/shopping.json').then(r=>r.json()),
    fetch('data/checklist.json').then(r=>r.json())
  ]);
  DATA = { itinerary, detail, reservations, food, shopping, checklist };
}

/* ---------- utils ---------- */
function fmtNum(n){
  if(n === null || n === undefined || n === '') return '-';
  if(typeof n === 'number') return Math.round(n).toLocaleString('ko-KR');
  return n;
}
function todayISO(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function dayDiff(a,b){
  const da = new Date(a), db = new Date(b);
  return Math.round((da - db) / (1000*60*60*24));
}
const TRIP_START = '2026-07-29';
const TRIP_END = '2026-08-11';

function checklistProgress(){
  let total = 0, done = 0;
  DATA.checklist.forEach(cat=>{
    cat.items.forEach(item=>{
      total++;
      if(checklistState[cat.category+'::'+item.name]) done++;
    });
  });
  return { total, done, pct: total ? Math.round(done/total*100) : 0 };
}
function reservationProgress(){
  let total = 0, done = 0;
  DATA.reservations.categories.forEach(cat=>{
    cat.items.forEach((item, idx)=>{
      total++;
      const key = cat.category+'::'+idx;
      const override = reservationState[key];
      const paid = override !== undefined ? override : item.paid;
      if(paid) done++;
    });
  });
  return { total, done };
}

/* ---------- router ---------- */
const VIEWS = {
  home: { title: '홈', render: renderHome },
  itinerary: { title: '일정', render: renderItinerary },
  reservations: { title: '예약 · 비용', render: renderReservations },
  explore: { title: '맛집 · 쇼핑', render: renderExplore },
  checklist: { title: '체크리스트', render: renderChecklist },
  memo: { title: '메모 · 가계부', render: renderMemo },
  settings: { title: '설정', render: renderSettings }
};

function currentViewKey(){
  const h = location.hash.replace('#','');
  return VIEWS[h] ? h : 'home';
}

function render(){
  const key = currentViewKey();
  document.getElementById('topbarTitle').textContent = VIEWS[key].title;
  document.querySelectorAll('.nav-item').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.view === key);
  });
  const app = document.getElementById('app');
  app.innerHTML = '';
  VIEWS[key].render(app);
}

document.querySelectorAll('.nav-item').forEach(btn=>{
  btn.addEventListener('click', ()=>{ location.hash = btn.dataset.view; });
});
document.getElementById('settingsBtn').addEventListener('click', ()=>{ location.hash = 'settings'; });
window.addEventListener('hashchange', render);

/* ================= HOME ================= */
function renderHome(app){
  const today = todayISO();
  let ddayLabel, ddaySub;
  const toStart = dayDiff(TRIP_START, today);
  const toEnd = dayDiff(TRIP_END, today);
  if(toStart > 0){
    ddayLabel = 'D-' + toStart;
    ddaySub = 'PRAHA 7.29 출발';
  } else if(toEnd >= 0){
    ddayLabel = (Math.abs(toStart)+1) + '일차';
    ddaySub = '여행 중';
  } else {
    ddayLabel = '여행 종료';
    ddaySub = '수고하셨습니다';
  }

  const cp = checklistProgress();
  const rp = reservationProgress();

  // find today's itinerary day, or next upcoming day
  let day = DATA.itinerary.find(d => d.date === today);
  let dayNoteLabel = '오늘의 일정';
  if(!day){
    day = DATA.itinerary.find(d => d.date > today);
    dayNoteLabel = day ? (day.dateLabel + ' 일정 미리보기') : '';
  }

  const recentMemos = [...memos].sort((a,b)=> b.id - a.id).slice(0,2);

  app.innerHTML = `
    <div class="stamp">
      <div class="stamp-d">${ddayLabel}</div>
      <div class="stamp-sub">${ddaySub}</div>
    </div>
    <div class="stat-row">
      <div class="stat-chip"><div class="num">${cp.pct}%</div><div class="lbl">체크리스트 (${cp.done}/${cp.total})</div></div>
      <div class="stat-chip"><div class="num">${rp.done}/${rp.total}</div><div class="lbl">예약 완료</div></div>
    </div>
    <p class="section-eyebrow">Schedule</p>
    <p class="section-title">${dayNoteLabel || '일정 정보 없음'}</p>
    <div id="homeDayEvents"></div>
    <p class="section-eyebrow" style="margin-top:20px;">Notebook</p>
    <p class="section-title">최근 메모</p>
    <div id="homeMemos"></div>
  `;

  const eventsWrap = document.getElementById('homeDayEvents');
  if(day){
    eventsWrap.innerHTML = day.events.slice(0,3).map(ev => ticketHTML(ev)).join('');
  } else {
    eventsWrap.innerHTML = '<p class="empty">표시할 일정이 없습니다.</p>';
  }

  const memoWrap = document.getElementById('homeMemos');
  if(recentMemos.length === 0){
    memoWrap.innerHTML = '<p class="empty">아직 작성된 메모가 없습니다.</p>';
  } else {
    memoWrap.innerHTML = recentMemos.map(m => memoCardHTML(m, false)).join('');
  }
}

function ticketHTML(ev){
  const tag = ev.hotel ? `<span class="ticket-tag hotel">${ev.hotel}</span>` : '';
  const transportTag = ev.transport ? `<span class="ticket-tag">${ev.transport}</span>` : '';
  return `
    <div class="ticket">
      <div class="ticket-row">
        <div class="ticket-time">${ev.time || ''}</div>
        <div class="ticket-body">
          <strong>${ev.title || ''}</strong>
          ${ev.place ? `<p>${ev.place}</p>` : ''}
          ${transportTag}${tag}
        </div>
      </div>
    </div>
  `;
}

/* ================= ITINERARY ================= */
let selectedDayIndex = 0;
let itineraryDetailMode = false;

function renderItinerary(app){
  const days = DATA.itinerary;
  app.innerHTML = `
    <p class="section-eyebrow">Day by day</p>
    <p class="section-title" id="itDayTitle"></p>
    <div class="day-strip" id="dayStrip"></div>
    <div class="toggle-row">
      <button class="toggle-btn" data-mode="summary">요약 보기</button>
      <button class="toggle-btn" data-mode="detail">상세 보기</button>
    </div>
    <div id="itEvents"></div>
  `;
  const strip = document.getElementById('dayStrip');
  strip.innerHTML = days.map((d,i)=>{
    const [m,rest] = d.dateLabel.split('/');
    return `<div class="day-tab" data-idx="${i}"><span>${d.dateLabel.split(' ')[0]}</span><small>${d.city||''}</small></div>`;
  }).join('');
  strip.querySelectorAll('.day-tab').forEach(el=>{
    el.addEventListener('click', ()=>{ selectedDayIndex = parseInt(el.dataset.idx); renderItineraryBody(); });
  });
  app.querySelectorAll('.toggle-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{ itineraryDetailMode = btn.dataset.mode === 'detail'; renderItineraryBody(); });
  });
  renderItineraryBody();
}

function renderItineraryBody(){
  const days = DATA.itinerary;
  const day = days[selectedDayIndex];
  document.getElementById('itDayTitle').textContent = day.dateLabel + (day.city ? ' · ' + day.city : '');
  document.querySelectorAll('.day-tab').forEach((el,i)=> el.classList.toggle('active', i===selectedDayIndex));
  document.querySelectorAll('.toggle-btn').forEach(btn=>{
    btn.classList.toggle('active', (btn.dataset.mode==='detail') === itineraryDetailMode);
  });

  const wrap = document.getElementById('itEvents');
  if(!itineraryDetailMode){
    wrap.innerHTML = day.events.map(ev => ticketHTML(ev)).join('');
    return;
  }
  const detail = DATA.detail.find(d => d.date === day.date);
  if(!detail){
    wrap.innerHTML = '<p class="empty">상세 일정 데이터가 없는 날입니다. 요약 보기를 확인해주세요.</p>';
    return;
  }
  wrap.innerHTML = detail.items.map(it => `
    <div class="ticket">
      <div class="ticket-row">
        <div class="ticket-time">${it.time || ''}</div>
        <div class="ticket-body">
          <strong>${(it.detail||'').split('\n')[0]}</strong>
          ${it.place ? `<p>${it.place}</p>` : ''}
          ${it.note ? `<p>${it.note.replace(/\n/g,' / ')}</p>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

/* ================= RESERVATIONS ================= */
function renderReservations(app){
  const data = DATA.reservations;
  app.innerHTML = `
    <p class="section-eyebrow">Bookings & payments</p>
    <p class="section-title">숙소 · 렌트 · 투어 · 버스</p>
    <div id="resCats"></div>
    <div class="cat-block">
      <div class="cat-block-head"><h3>기타 비용</h3></div>
      <div id="resEtc"></div>
    </div>
    <div class="total-strip"><span>숙소 제외 합계</span><strong>₩${fmtNum(data.grandTotalExcludingHotel)}</strong></div>
    <div class="total-strip" style="border-top:none;padding-top:0;"><span>전체 합계</span><strong>₩${fmtNum(data.grandTotal)}</strong></div>
    <p class="sync-note">예약 상태 체크는 현재 이 기기에만 저장됩니다. 가족이 함께 보려면 다음 단계에서 구글시트 연동이 필요합니다.</p>
  `;
  const catsWrap = document.getElementById('resCats');
  catsWrap.innerHTML = data.categories.map(cat => `
    <div class="cat-block">
      <div class="cat-block-head"><h3>${cat.category}</h3>${cat.subtotal ? `<span>₩${fmtNum(cat.subtotal)}</span>` : ''}</div>
      ${cat.items.map((item, idx)=> resCardHTML(cat.category, item, idx)).join('')}
    </div>
  `).join('');

  document.getElementById('resEtc').innerHTML = data.etc.map(item => `
    <div class="res-card">
      <div class="res-top">
        <div><strong>${item.brand || item.group}</strong><span class="res-sub">${[item.region, item.note].filter(Boolean).join(' · ')}</span></div>
        ${item.status ? `<span class="badge ${item.paid?'paid':'pending'}">${item.status}</span>` : ''}
      </div>
      ${item.amount || item.krw ? `<div class="res-bottom"><div class="res-price">${item.amount?item.amount+' '+item.currency:''}</div><div class="res-price">${item.krw?'₩'+fmtNum(item.krw):''}</div></div>` : ''}
    </div>
  `).join('');

  catsWrap.querySelectorAll('.badge').forEach(b=>{
    b.addEventListener('click', ()=>{
      const key = b.dataset.key;
      const cur = reservationState[key] !== undefined ? reservationState[key] : b.dataset.paid === 'true';
      reservationState[key] = !cur;
      saveLS(LS.reservations, reservationState);
      pushToSheet('setReservation', { key, paid: reservationState[key] });
      renderReservations(app);
    });
  });
}

function resCardHTML(catName, item, idx){
  const key = catName+'::'+idx;
  const override = reservationState[key];
  const paid = override !== undefined ? override : item.paid;
  return `
    <div class="res-card">
      <div class="res-top">
        <div><strong>${item.brand||''}</strong><span class="res-sub">${[item.region, item.period].filter(Boolean).join(' · ')}</span></div>
        <button class="badge ${paid?'paid':'pending'}" data-key="${key}" data-paid="${item.paid}">${paid?'완료':'예정'}</button>
      </div>
      <div class="res-bottom">
        <div class="res-price">${item.amount?item.amount+' '+item.currency:''}</div>
        <div class="res-price">${item.krw?'₩'+fmtNum(item.krw):''}</div>
      </div>
    </div>
  `;
}

/* ================= EXPLORE (food + shopping) ================= */
let exploreMode = 'food';
function renderExplore(app){
  app.innerHTML = `
    <p class="section-eyebrow">City guide</p>
    <p class="section-title">맛집 &amp; 쇼핑 정보</p>
    <div class="toggle-row">
      <button class="toggle-btn" data-mode="food">맛집</button>
      <button class="toggle-btn" data-mode="shopping">쇼핑</button>
    </div>
    <div id="exploreBody"></div>
  `;
  app.querySelectorAll('.toggle-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{ exploreMode = btn.dataset.mode; renderExploreBody(); });
  });
  renderExploreBody();
}

function renderExploreBody(){
  document.querySelectorAll('#app .toggle-btn').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.mode === exploreMode);
  });
  const wrap = document.getElementById('exploreBody');
  if(exploreMode === 'food'){
    wrap.innerHTML = DATA.food.cities.map((c, i) => foodAccordionHTML(c, i)).join('');
  } else {
    wrap.innerHTML = DATA.shopping.map((c, i) => shoppingAccordionHTML(c, i)).join('');
  }
  wrap.querySelectorAll('.accordion-head').forEach(h=>{
    h.addEventListener('click', ()=>{ h.parentElement.classList.toggle('open'); });
  });
}

function foodAccordionHTML(city, i){
  if(city.city === '프라하'){
    return `
      <div class="accordion ${i===0?'open':''}">
        <div class="accordion-head"><h3>${city.city}</h3><i class="ti ti-chevron-down"></i></div>
        <div class="accordion-body">
          <p class="theme-title">공항 → 숙소 교통수단 비교</p>
          ${city.airportTransport.map(t=>`
            <div class="food-transport-row"><div>${t.method}</div><div>${t.priceLocal}<br>${t.priceKrw}</div></div>
          `).join('')}
          <div class="food-tip">${city.localTip}</div>
          ${city.restaurantGroups.map(g=>`
            <p class="theme-title">${g.theme.replace(/^\d+\.\s*/,'')}</p>
            ${g.intro?`<p class="theme-intro">${g.intro}</p>`:''}
            ${g.venues.map(v=>`
              <div class="venue-card">
                <strong>${v.name}</strong>
                ${v.feature?`<p>${v.feature}</p>`:''}
                ${v.menu?`<p class="menu">추천: ${v.menu}</p>`:''}
              </div>
            `).join('')}
          `).join('')}
          <p class="theme-title">덜 짠 현지 음식 추천</p>
          ${city.localDishes.map(d=>`
            <div class="venue-card"><strong>${d.name}</strong><p>${d.pairing||''}</p></div>
          `).join('')}
        </div>
      </div>
    `;
  }
  return `
    <div class="accordion">
      <div class="accordion-head"><h3>${city.city}</h3><i class="ti ti-chevron-down"></i></div>
      <div class="accordion-body">
        ${city.quickTips.map(t=>`<div class="food-tip">${t}</div>`).join('')}
        <p class="theme-title">덜 짠 음식 가이드</p>
        <p class="theme-intro" style="white-space:pre-wrap;">${city.localFoodGuide}</p>
        <p class="theme-title">주문 치트키</p>
        <p class="theme-intro" style="white-space:pre-wrap;">${city.orderPhrase}</p>
        <p class="theme-title">구시가지 맛집</p>
        <p class="theme-intro" style="white-space:pre-wrap;">${city.restaurants}</p>
      </div>
    </div>
  `;
}

function shoppingAccordionHTML(country, i){
  return `
    <div class="accordion ${i===0?'open':''}">
      <div class="accordion-head"><h3>${country.country}</h3><i class="ti ti-chevron-down"></i></div>
      <div class="accordion-body">
        ${country.places.map(p=>`
          <p class="theme-title">${p.place}</p>
          ${p.items.map(it=>`<div class="shop-item">${it}</div>`).join('')}
          ${p.nearbyFood ? p.nearbyFood.map(nf=>`
            <p class="theme-title" style="margin-top:10px;">${nf.group.replace(/^\d+\.\s*/,'')}</p>
            ${nf.items.map(it=>`<div class="shop-item">${it}</div>`).join('')}
          `).join('') : ''}
        `).join('')}
      </div>
    </div>
  `;
}

/* ================= CHECKLIST ================= */
let selectedCategory = 'all';
function renderChecklist(app){
  const cp = checklistProgress();
  app.innerHTML = `
    <p class="section-eyebrow">Before you go</p>
    <p class="section-title">준비물 체크리스트 (${cp.done}/${cp.total})</p>
    <div class="progress-strip"><i style="width:${cp.pct}%"></i></div>
    <div class="cat-pills" id="catPills"></div>
    <div id="chkList"></div>
    <p class="sync-note">체크 상태는 현재 이 기기에만 저장됩니다. 가족과 공유하려면 구글시트 연동 단계가 필요합니다.</p>
  `;
  const pillsWrap = document.getElementById('catPills');
  const cats = ['all', ...DATA.checklist.map(c=>c.category)];
  pillsWrap.innerHTML = cats.map(c => `<div class="cat-pill ${c===selectedCategory?'active':''}" data-cat="${c}">${c==='all'?'전체':c}</div>`).join('');
  pillsWrap.querySelectorAll('.cat-pill').forEach(p=>{
    p.addEventListener('click', ()=>{ selectedCategory = p.dataset.cat; renderChecklist(app); });
  });
  renderChecklistList();
}

function renderChecklistList(){
  const wrap = document.getElementById('chkList');
  const cats = selectedCategory === 'all' ? DATA.checklist : DATA.checklist.filter(c=>c.category===selectedCategory);
  wrap.innerHTML = cats.map(cat => `
    <p class="theme-title">${cat.category}</p>
    ${cat.items.map(item => {
      const key = cat.category+'::'+item.name;
      const done = !!checklistState[key];
      return `
        <div class="chk-row ${done?'done':''}" data-key="${key}">
          <div class="chk-box ${done?'done':''}">${done?'<i class="ti ti-check"></i>':''}</div>
          <div class="chk-label">${item.name}</div>
          ${item.note?`<div class="chk-note">${item.note}</div>`:''}
        </div>
      `;
    }).join('')}
  `).join('');
  wrap.querySelectorAll('.chk-row').forEach(row=>{
    row.addEventListener('click', ()=>{
      const key = row.dataset.key;
      checklistState[key] = !checklistState[key];
      saveLS(LS.checklist, checklistState);
      pushToSheet('setChecklist', { key, done: checklistState[key] });
      const app = document.getElementById('app');
      const scrollY = window.scrollY;
      renderChecklist(app);
      window.scrollTo(0, scrollY);
    });
  });
}

/* ================= MEMO ================= */
function tripDateOptions(){
  return DATA.itinerary.map(d => `<option value="${d.date}">${d.dateLabel}${d.city?' · '+d.city:''}</option>`).join('');
}

function renderMemo(app){
  const today = todayISO();
  const defaultDate = DATA.itinerary.find(d=>d.date===today) ? today : TRIP_START;
  app.innerHTML = `
    <p class="section-eyebrow">On the road</p>
    <p class="section-title">현지 메모 &amp; 간이 가계부</p>

    <div class="form-card">
      <label>날짜</label>
      <select id="memoDate">${tripDateOptions()}</select>
      <div style="height:10px;"></div>
      <label>메모</label>
      <textarea id="memoText" placeholder="오늘 있었던 일, 다음 날 준비할 것 등을 적어보세요."></textarea>
      <div style="height:10px;"></div>
      <button class="btn-primary" id="saveNoteBtn">메모 저장</button>
    </div>

    <div class="form-card">
      <label>지출 기록</label>
      <div class="form-row">
        <input type="text" id="expTitle" placeholder="항목 (예: 저녁 식사)">
      </div>
      <div class="form-row">
        <input type="number" id="expAmount" placeholder="금액">
        <select id="expCurrency">
          <option>EUR</option><option>CZK</option><option>CHF</option><option>KRW</option>
        </select>
      </div>
      <button class="btn-primary" id="saveExpBtn">지출 저장</button>
    </div>

    <p class="section-eyebrow">Log</p>
    <p class="section-title">기록 모아보기</p>
    <div id="memoLog"></div>
  `;
  document.getElementById('memoDate').value = defaultDate;

  document.getElementById('saveNoteBtn').addEventListener('click', ()=>{
    const text = document.getElementById('memoText').value.trim();
    if(!text) return;
    const memo = { id: Date.now(), date: document.getElementById('memoDate').value, type: 'note', text };
    memos.push(memo);
    saveLS(LS.memos, memos);
    pushToSheet('addMemo', { memo });
    renderMemo(app);
  });
  document.getElementById('saveExpBtn').addEventListener('click', ()=>{
    const title = document.getElementById('expTitle').value.trim();
    const amount = document.getElementById('expAmount').value;
    if(!title || !amount) return;
    const memo = {
      id: Date.now(), date: document.getElementById('memoDate').value, type: 'expense',
      title, amount: parseFloat(amount), currency: document.getElementById('expCurrency').value
    };
    memos.push(memo);
    saveLS(LS.memos, memos);
    pushToSheet('addMemo', { memo });
    renderMemo(app);
  });

  renderMemoLog();
}

function memoCardHTML(m, deletable=true){
  const dayLabel = DATA.itinerary.find(d=>d.date===m.date)?.dateLabel || m.date;
  if(m.type === 'note'){
    return `
      <div class="memo-card">
        <div class="memo-date"><span>${dayLabel} · 메모</span>${deletable?`<button class="memo-del" data-id="${m.id}">삭제</button>`:''}</div>
        <div class="memo-text">${m.text}</div>
      </div>
    `;
  }
  return `
    <div class="memo-card">
      <div class="memo-date"><span>${dayLabel} · 지출</span>${deletable?`<button class="memo-del" data-id="${m.id}">삭제</button>`:''}</div>
      <div class="expense-row"><span>${m.title}</span><span>${m.amount} ${m.currency}</span></div>
    </div>
  `;
}

function renderMemoLog(){
  const wrap = document.getElementById('memoLog');
  const sorted = [...memos].sort((a,b)=> b.id - a.id);
  if(sorted.length === 0){
    wrap.innerHTML = '<p class="empty">아직 기록이 없습니다. 위에서 메모나 지출을 추가해보세요.</p>';
    return;
  }
  wrap.innerHTML = sorted.map(m => memoCardHTML(m, true)).join('');
  wrap.querySelectorAll('.memo-del').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = parseInt(btn.dataset.id);
      memos = memos.filter(m => m.id !== id);
      saveLS(LS.memos, memos);
      pushToSheet('deleteMemo', { id });
      renderMemoLog();
    });
  });
}

/* ================= SETTINGS ================= */
function renderSettings(app){
  const cfg = getSyncConfig();
  const connected = !!syncUrl();
  app.innerHTML = `
    <p class="section-eyebrow">Sync</p>
    <p class="section-title">구글시트 동기화 설정</p>
    <div class="form-card">
      <label>Apps Script 웹앱 URL</label>
      <input type="text" id="syncUrlInput" placeholder="https://script.google.com/macros/s/xxxx/exec" value="${cfg.url||''}">
      <div style="height:10px;"></div>
      <button class="btn-primary" id="saveSyncBtn">저장하고 지금 동기화</button>
      <div style="height:8px;"></div>
      <button class="toggle-btn" id="clearSyncBtn" style="width:100%;">로컬 전용으로 되돌리기</button>
    </div>
    <p class="sync-note" id="syncStatusNote">${
      connected
        ? '구글시트와 연동되어 있습니다. 가족 모두 같은 URL을 넣으면 체크리스트 · 예약 상태 · 메모가 공유됩니다.'
        : '아직 로컬 저장 모드입니다. 웹앱 URL을 입력하면 구글시트와 공유되기 시작합니다. (설정 방법은 GOOGLE_SHEETS_SETUP.md 참고)'
    }</p>
  `;
  document.getElementById('saveSyncBtn').addEventListener('click', async ()=>{
    const val = document.getElementById('syncUrlInput').value.trim();
    setSyncConfig({ url: val });
    const note = document.getElementById('syncStatusNote');
    note.textContent = '동기화 중...';
    await pullFromSheet();
    note.textContent = syncStatus === 'ok'
      ? '동기화 완료! 이제 가족 모두 같은 데이터를 봅니다.'
      : (val ? '동기화에 실패했습니다. URL을 다시 확인해주세요.' : '로컬 저장 모드로 전환했습니다.');
  });
  document.getElementById('clearSyncBtn').addEventListener('click', ()=>{
    setSyncConfig({ url: '' });
    renderSettings(app);
  });
}

/* ================= INIT ================= */
loadAllData().then(async ()=>{
  await pullFromSheet();
  if(!location.hash) location.hash = '#home';
  render();
}).catch(err=>{
  document.getElementById('app').innerHTML = `<p class="empty">데이터를 불러오지 못했습니다. 로컬 파일을 직접 열었다면, 간단한 웹서버(예: python -m http.server)로 실행해주세요.<br><br>${err}</p>`;
});
