/* THE EYEBROW お客様アプリ v1.0 */
(function () {
  'use strict';
  const CFG = window.EB_CONFIG;
  const API = CFG.API_URL;
  const $ = s => document.querySelector(s);
  const view = $('#view');
  const WD = ['日', '月', '火', '水', '木', '金', '土'];

  /* ---------- 保存（この端末内） ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('eb_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('eb_' + k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------- 通信 ---------- */
  async function fetchJSON(url, opt, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms || 20000);
    try {
      const r = await fetch(url, Object.assign({ signal: ctl.signal, redirect: 'follow' }, opt || {}));
      const txt = await r.text();
      try { return JSON.parse(txt); } catch (e) { const err = new Error('bad_response'); err.code = 'bad_response'; throw err; }
    } finally { clearTimeout(t); }
  }
  async function apiGet(params, tries) {
    const url = API + '?' + new URLSearchParams(params).toString();
    let last;
    for (let i = 0; i < (tries || 3); i++) {
      try { return await fetchJSON(url); } catch (e) { last = e; await new Promise(r => setTimeout(r, 600 * (i + 1))); }
    }
    throw last;
  }
  // POST は二重送信を避けるため再送しない
  function apiPost(body) {
    return fetchJSON(API, { method: 'POST', body: JSON.stringify(body) }, 30000);
  }

  /* ---------- データ ---------- */
  let D = Object.assign({}, CFG.FALLBACK, store.get('data', {}));
  let hasV12 = !!store.get('v12', false);

  async function loadData() {
    try {
      const r = await apiGet({ api: 'app' }, 2);
      if (r && r.ok && r.menus) { hasV12 = true; store.set('v12', true); apply(r); return; }
    } catch (e) { /* v1.1 のサーバーでは api=app が無い → settings にフォールバック */ }
    try {
      const r = await apiGet({ api: 'settings' });
      if (r && r.menus) { hasV12 = false; store.set('v12', false); apply(r); }
    } catch (e) { setOffline(true); }
  }
  function apply(r) {
    const fb = CFG.FALLBACK;
    D = Object.assign({}, fb, r);
    D.info = Object.assign({}, fb.info, r.info || {});
    D.news = (r.news && r.news.length) ? r.news : fb.news;
    D.coupons = r.coupons || fb.coupons || [];
    store.set('data', D);
    $('#shopName').textContent = (D.shop || '').replace(/^THE EYEBROW\s*/, '');
    render();
  }
  function setOffline(on) { $('#net').hidden = !on; }
  window.addEventListener('online', () => setOffline(false));
  window.addEventListener('offline', () => setOffline(true));

  /* ---------- 便利関数 ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const yen = n => '¥' + Number(n || 0).toLocaleString('ja-JP');
  const toMin = t => { const p = String(t).split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
  const fmt = m => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
  const ymd = d => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  const parseD = s => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const jpDate = s => { const d = parseD(s); return `${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`; };
  const todayStr = () => ymd(new Date());
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2600); }
  function sheet(html) { $('#sheetBody').innerHTML = html; $('#sheet').hidden = false; }
  function closeSheet() { $('#sheet').hidden = true; }
  $('#sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });

  function catOf(m) {
    if (m.cat) return m.cat;
    const n = m.name || '';
    if (/メンズ/.test(n)) return 'メンズ';
    if (/[＋+]/.test(n)) return 'セット';
    if (/まつげ|まつ毛|パリジェンヌ|ラッシュ/.test(n)) return 'まつげ';
    return '眉';
  }
  const BROW = '<svg viewBox="0 0 100 40"><path d="M6 30C25 10 60 4 94 16"/><path d="M30 34c10-6 26-8 40-4"/></svg>';
  const menuByName = n => (D.menus || []).find(m => m.name === n);

  /* ---------- マイ予約（端末内） ---------- */
  const mine = () => store.get('mine', []);
  const saveMine = v => store.set('mine', v);
  function upcoming() {
    const t = todayStr();
    return mine().filter(b => b.status !== 'cancelled' && b.date >= t).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }

  /* ---------- 画面切替 ---------- */
  let route = 'home';
  function go(r) { if (location.hash !== '#' + r) location.hash = r; else { route = r; render(); } }
  window.addEventListener('hashchange', () => { route = (location.hash || '#home').slice(1).split('/')[0] || 'home'; render(); window.scrollTo(0, 0); });
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); if (g.dataset.go === 'book' && !g.dataset.keep) resetDraft(); go(g.dataset.go); }
  });

  function render() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === route));
    ({ home: vHome, menu: vMenu, book: vBook, mine: vMine, shop: vShop }[route] || vHome)();
  }

  /* ---------- ホーム ---------- */
  function vHome() {
    const nx = upcoming()[0];
    const cps = D.coupons || [];
    view.innerHTML = `
      <section class="hero">${BROW.replace('<svg', '<svg class="brow"')}
        <div class="en">EYEBROW &amp; EYELASH SALON</div>
        <h1>${esc(D.shop)}</h1>
        <p>${esc(D.info.tagline || '')}　${esc(D.info.hours || '')}</p>
        <button class="btn" data-go="book">空き時間を見て予約する</button>
      </section>
      ${installBanner()}
      ${nx ? `<h2 class="sec">次回のご予約</h2>
        <div class="card next" data-go="mine">
          <div class="d"><span>${parseD(nx.date).getMonth() + 1}月</span><b>${parseD(nx.date).getDate()}</b><span>${WD[parseD(nx.date).getDay()]}曜</span></div>
          <div><div style="font-weight:600">${esc(nx.time)}〜</div><div class="small">${esc(nx.menu)}</div></div>
        </div>` : ''}
      ${cps.length ? `<h2 class="sec">クーポン</h2><div class="coupons">${cps.map((c, i) => couponCard(c, i)).join('')}</div>` : ''}
      <h2 class="sec">お知らせ</h2>
      <div class="card news">${(D.news || []).map(n => `<div class="item"><span class="muted small">${esc(n.date || '')}</span><b>${esc(n.title)}</b>${n.body ? `<div class="small">${esc(n.body)}</div>` : ''}</div>`).join('') || '<div class="empty">お知らせはありません</div>'}</div>
      <h2 class="sec">人気メニュー</h2>
      ${(D.menus || []).slice(0, 3).map(menuCard).join('')}
      <button class="btn ghost" style="margin-top:12px" data-go="menu">メニューをすべて見る</button>`;
    bindMenuCards(); bindCoupons(); bindInstall();
  }
  function couponCard(c, i) {
    return `<div class="coupon" data-cp="${i}">
      <span class="chip ${/新規/.test(c.target || '') ? 'new' : ''}">${esc(c.target || '全員')}</span>
      <div class="t">${esc(c.title)}</div>
      <div class="row"><span class="small muted">${esc(c.note || '')}</span><span class="price">${c.regular ? `<s>${yen(c.regular)}</s>` : ''}${yen(c.price)}</span></div>
    </div>`;
  }
  function bindCoupons() {
    view.querySelectorAll('[data-cp]').forEach(el => el.onclick = () => {
      const c = D.coupons[+el.dataset.cp];
      sheet(`<span class="chip ${/新規/.test(c.target || '') ? 'new' : ''}">${esc(c.target || '全員')}</span>
        <h1 class="ttl" style="margin-top:8px">${esc(c.title)}</h1>
        <div class="sum"><div><span>価格</span><span>${c.regular ? `<s class="muted" style="font-weight:400">${yen(c.regular)}</s> ` : ''}${yen(c.price)}</span></div>
        ${c.menu ? `<div><span>対象メニュー</span><span>${esc(c.menu)}</span></div>` : ''}
        ${c.note ? `<div><span>条件</span><span>${esc(c.note)}</span></div>` : ''}</div>
        <p class="small muted">ご予約時にこのクーポンが自動で適用されます。ご来店時にお申し付けいただく必要はありません。</p>
        <button class="btn" id="useCp">このクーポンで予約する</button>
        <button class="btn ghost" data-close>閉じる</button>`);
      $('#useCp').onclick = () => { resetDraft(); draft.coupon = c; if (c.menu && menuByName(c.menu)) { draft.menu = c.menu; draft.step = 2; } closeSheet(); go('book'); };
    });
  }

  /* ---------- ホーム画面に追加 ---------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; if (route === 'home') render(); });
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  function installBanner() {
    if (isStandalone() || store.get('hideInstall', false)) return '';
    if (!deferredPrompt && !isIOS()) return '';
    return `<div class="install"><span style="font-size:22px">📲</span><div><b>ホーム画面に追加</b><br><span class="muted">次回からアプリのようにワンタップで開けます</span></div>
      <button class="btn" id="instBtn" style="width:auto;padding:8px 14px;font-size:13px;margin-left:auto">追加</button><button class="x" id="instX" aria-label="閉じる">×</button></div>`;
  }
  function bindInstall() {
    const b = $('#instBtn'), x = $('#instX');
    if (x) x.onclick = () => { store.set('hideInstall', true); render(); };
    if (!b) return;
    b.onclick = async () => {
      if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice.catch(() => {}); deferredPrompt = null; render(); return; }
      sheet(`<h1 class="ttl">ホーム画面に追加する方法</h1>
        <div class="card"><b>iPhone（Safari）</b><ol class="small" style="padding-left:18px;margin:8px 0 0">
          <li>画面下の <b>共有ボタン</b>（□から↑が出ているマーク）を押す</li>
          <li>メニューを下へずらして <b>「ホーム画面に追加」</b> を押す</li>
          <li>右上の <b>「追加」</b> を押す</li></ol></div>
        <div class="card"><b>Android（Chrome）</b><ol class="small" style="padding-left:18px;margin:8px 0 0">
          <li>右上の <b>︙</b> を押す</li><li><b>「ホーム画面に追加」</b>（または「アプリをインストール」）を押す</li></ol></div>
        <button class="btn" data-close style="margin-top:14px">わかりました</button>`);
    };
  }

  /* ---------- メニュー ---------- */
  let menuCat = 'すべて';
  function menuCard(m) {
    return `<div class="card mcard" data-menu="${esc(m.name)}">
      <div class="ph" ${m.photo ? `style="background-image:url('${esc(m.photo)}')"` : ''}>${m.photo ? '' : BROW}</div>
      <div class="bd"><div class="nm">${esc(m.name)}</div>
        <div class="ds">${esc(m.desc || '')}</div>
        <div class="row"><span class="small muted">${m.min}分</span><span class="price">${yen(m.price)}</span></div></div></div>`;
  }
  function bindMenuCards() {
    view.querySelectorAll('[data-menu]').forEach(el => el.onclick = () => {
      const m = menuByName(el.dataset.menu); if (!m) return;
      sheet(`${m.photo ? `<div style="height:180px;border-radius:14px;background:url('${esc(m.photo)}') center/cover;margin-bottom:14px"></div>` : ''}
        <span class="chip">${esc(catOf(m))}</span>
        <h1 class="ttl" style="margin-top:8px">${esc(m.name)}</h1>
        <p class="small" style="white-space:pre-wrap">${esc(m.desc || '')}</p>
        <div class="sum"><div><span>所要時間</span><span>約${m.min}分</span></div><div><span>料金</span><span>${yen(m.price)}</span></div></div>
        <button class="btn" id="bookThis" style="margin-top:14px">このメニューで予約する</button>
        <button class="btn ghost" data-close>閉じる</button>`);
      $('#bookThis').onclick = () => { resetDraft(); draft.menu = m.name; draft.step = 2; closeSheet(); go('book'); };
    });
  }
  function vMenu() {
    const ms = D.menus || [];
    const cats = ['すべて'].concat([...new Set(ms.map(catOf))]);
    const list = ms.filter(m => menuCat === 'すべて' || catOf(m) === menuCat);
    view.innerHTML = `<h1 class="ttl">メニュー・料金</h1>
      <div class="cats">${cats.map(c => `<button data-cat="${esc(c)}" class="${c === menuCat ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>
      ${list.map(menuCard).join('') || '<div class="empty">メニューを読み込み中…</div>'}
      <p class="small muted" style="margin-top:14px">表示価格は税込です。</p>`;
    view.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { menuCat = b.dataset.cat; vMenu(); });
    bindMenuCards();
  }

  /* ---------- 予約 ---------- */
  let draft;
  function resetDraft() { draft = { step: 1, menu: '', coupon: null, date: '', time: '', sending: false, error: '' }; }
  resetDraft();
  const slotCache = {};

  function vBook() {
    if (draft.step === 5) return vDone();
    const steps = `<div class="steps">${[1, 2, 3, 4].map(i => `<span class="${i <= draft.step ? 'on' : ''}"></span>`).join('')}</div>`;
    const back = draft.step > 1 ? `<button class="back" id="back">‹ 戻る</button>` : '';
    if (draft.step === 1) {
      view.innerHTML = `${steps}<h1 class="ttl">メニューを選ぶ</h1>
        ${(D.menus || []).map(m => `<button class="pick ${draft.menu === m.name ? 'sel' : ''}" data-pick="${esc(m.name)}">
          <div class="row"><b style="font-size:14.5px;line-height:1.45">${esc(m.name)}</b><span class="price">${yen(m.price)}</span></div>
          <div class="small muted">約${m.min}分</div></button>`).join('') || '<div class="spin"></div>'}`;
      view.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
        draft.menu = b.dataset.pick;
        if (draft.coupon && draft.coupon.menu && draft.coupon.menu !== draft.menu) draft.coupon = null;
        draft.step = 2; draft.time = ''; vBook(); window.scrollTo(0, 0);
      });
    } else if (draft.step === 2) {
      const m = menuByName(draft.menu);
      const days = [];
      const start = new Date(); start.setHours(0, 0, 0, 0);
      for (let i = 0; i < (D.maxDays || 60); i++) { const d = new Date(start); d.setDate(d.getDate() + i); days.push(d); }
      if (!draft.date) {
        // 本日の受付が終わっている時間なら翌日から
        const now = new Date(), late = now.getHours() * 60 + now.getMinutes() > toMin(D.close || '19:00') - (m ? m.min : 60) - 60;
        const first = days.find((d, i) => !(D.closedDays || []).includes(d.getDay()) && !(i === 0 && late));
        draft.date = first ? ymd(first) : '';
      }
      view.innerHTML = `${back}${steps}<h1 class="ttl">日時を選ぶ</h1>
        <div class="card small" style="margin-bottom:12px"><b>${esc(draft.menu)}</b>　約${m ? m.min : ''}分 ${draft.coupon ? `<br><span class="chip">クーポン</span> ${esc(draft.coupon.title)}` : ''}</div>
        <div class="days" id="days">${days.map(d => {
          const s = ymd(d), off = (D.closedDays || []).includes(d.getDay());
          return `<button class="day ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''} ${off ? 'off' : ''} ${s === draft.date ? 'sel' : ''}" data-day="${s}" ${off ? 'disabled' : ''}>
            <span class="m">${d.getMonth() + 1}月</span><span class="n">${d.getDate()}</span><span class="w">${WD[d.getDay()]}</span></button>`;
        }).join('')}</div>
        <div id="slotArea"><div class="spin"></div></div>`;
      const selEl = view.querySelector('.day.sel'); if (selEl) selEl.scrollIntoView({ inline: 'center', block: 'nearest' });
      view.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { draft.date = b.dataset.day; draft.time = ''; vBook(); });
      loadSlots();
    } else if (draft.step === 3) {
      const p = store.get('profile', {});
      view.innerHTML = `${back}${steps}<h1 class="ttl">お客様情報</h1>
        <div class="field"><label>お名前<em>必須</em></label><input id="f_name" autocomplete="name" placeholder="例）京都 花子" value="${esc(p.name || '')}"></div>
        <div class="field"><label>フリガナ<em>必須</em></label><input id="f_kana" placeholder="例）キョウト ハナコ" value="${esc(p.kana || '')}"></div>
        <div class="field"><label>電話番号<em>必須</em></label><input id="f_tel" type="tel" inputmode="numeric" autocomplete="tel" placeholder="例）09012345678" value="${esc(p.tel || '')}"></div>
        <div class="field"><label>メールアドレス</label><input id="f_email" type="email" autocomplete="email" placeholder="任意" value="${esc(p.email || '')}"></div>
        <div class="field"><label>ご要望・ご質問</label><textarea id="f_note" rows="3" placeholder="任意（初めてのご来店、気になる点など）">${esc(draft.note || '')}</textarea></div>
        <label class="check"><input type="checkbox" id="f_save" ${p.name || !store.get('profileAsked', false) ? 'checked' : ''}> この端末に入力内容を保存する（次回の入力が不要に）</label>
        <div id="ferr"></div>
        <button class="btn" id="toConfirm">確認画面へ</button>`;
      $('#toConfirm').onclick = () => {
        const v = id => $('#' + id).value.trim();
        const f = { name: v('f_name'), kana: v('f_kana'), tel: v('f_tel').replace(/[^\d]/g, ''), email: v('f_email') };
        draft.note = v('f_note');
        const errs = [];
        if (!f.name) errs.push('お名前を入力してください');
        if (!f.kana) errs.push('フリガナを入力してください');
        if (!/^0\d{9,10}$/.test(f.tel)) errs.push('電話番号は数字10〜11桁で入力してください');
        if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) errs.push('メールアドレスの形式をご確認ください');
        if (errs.length) { $('#ferr').innerHTML = `<div class="err" style="margin:0 0 12px">${errs.map(esc).join('<br>')}</div>`; return; }
        draft.cust = f;
        store.set('profileAsked', true);
        store.set('profile', $('#f_save').checked ? f : {});
        draft.step = 4; vBook(); window.scrollTo(0, 0);
      };
    } else if (draft.step === 4) {
      const m = menuByName(draft.menu) || {}, c = draft.cust, cp = draft.coupon;
      const end = fmt(toMin(draft.time) + (m.min || 60));
      view.innerHTML = `${back}${steps}<h1 class="ttl">ご予約内容の確認</h1>
        <div class="sum">
          <div><span>日時</span><span>${jpDate(draft.date)}<br>${draft.time}〜${end}</span></div>
          <div><span>メニュー</span><span>${esc(draft.menu)}</span></div>
          ${cp ? `<div><span>クーポン</span><span>${esc(cp.title)}</span></div>` : ''}
          <div><span>料金</span><span>${cp && cp.price ? yen(cp.price) : yen(m.price)}</span></div>
          <div><span>お名前</span><span>${esc(c.name)}（${esc(c.kana)}）様</span></div>
          <div><span>電話番号</span><span>${esc(c.tel)}</span></div>
          ${c.email ? `<div><span>メール</span><span>${esc(c.email)}</span></div>` : ''}
          ${draft.note ? `<div><span>ご要望</span><span>${esc(draft.note)}</span></div>` : ''}
        </div>
        <p class="small muted">ご予約のキャンセル・変更は「マイ予約」から行えます。</p>
        <div id="serr">${draft.error ? `<div class="err">${esc(draft.error)}</div>` : ''}</div>
        <button class="btn" id="send" ${draft.sending ? 'disabled' : ''}>${draft.sending ? '送信中…' : 'この内容で予約する'}</button>`;
      $('#send').onclick = submitBooking;
    }
    const b = $('#back'); if (b) b.onclick = () => { draft.step--; draft.error = ''; vBook(); window.scrollTo(0, 0); };
  }

  async function loadSlots(force) {
    const date = draft.date, area = $('#slotArea');
    if (!area) return;
    if (!date) { area.innerHTML = '<div class="empty">予約可能な日がありません</div>'; return; }
    try {
      let r = slotCache[date];
      if (force || !r || Date.now() - r.at > 60000) { r = { at: Date.now(), data: await apiGet({ api: 'slots', date }) }; slotCache[date] = r; }
      if (draft.date !== date || draft.step !== 2) return;
      setOffline(false);
      const m = menuByName(draft.menu) || { min: 60 };
      const step = D.step || 30;
      const avail = {}; (r.data.slots || []).forEach(s => avail[s.time] = s.available);
      const starts = (r.data.slots || []).map(s => s.time).filter(t => {
        for (let x = toMin(t); x < toMin(t) + m.min; x += step) if (!avail[fmt(x)]) return false;
        return true;
      });
      const all = (r.data.slots || []).map(s => s.time);
      const a = $('#slotArea'); if (!a) return;
      if (r.data.closed) { a.innerHTML = '<div class="empty">この日は定休日です</div>'; return; }
      a.innerHTML = starts.length
        ? `<div class="slots">${all.map(t => `<button data-t="${t}" ${starts.includes(t) ? '' : 'disabled'} class="${draft.time === t ? 'sel' : ''}">${t}</button>`).join('')}</div>
           <p class="small muted" style="margin-top:10px">選べる時間：${starts.length}枠（所要 約${m.min}分）</p>
           <button class="btn" id="toInfo" ${draft.time ? '' : 'disabled'} style="margin-top:12px">次へ</button>`
        : `<div class="empty">この日は空きがありません。<br><button class="btn ghost" id="nextDay" style="margin-top:12px">翌日を見る</button></div>`;
      a.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { draft.time = b.dataset.t; a.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('sel', x === b)); $('#toInfo').disabled = false; });
      const nd = $('#nextDay'); if (nd) nd.onclick = () => { const d = parseD(date); d.setDate(d.getDate() + 1); draft.date = ymd(d); draft.time = ''; vBook(); };
      const n = $('#toInfo'); if (n) n.onclick = () => { draft.step = 3; vBook(); window.scrollTo(0, 0); };
    } catch (e) {
      setOffline(!navigator.onLine);
      const a = $('#slotArea'); if (a) { a.innerHTML = `<div class="err">空き状況を読み込めませんでした。通信環境をご確認ください。</div><button class="btn ghost" id="retry" style="margin-top:10px">再読み込み</button>`; $('#retry').onclick = () => { a.innerHTML = '<div class="spin"></div>'; loadSlots(true); }; }
    }
  }

  async function submitBooking() {
    if (draft.sending) return;
    draft.sending = true; draft.error = ''; vBook();
    const m = menuByName(draft.menu) || {}, c = draft.cust, cp = draft.coupon;
    const note = [draft.note, cp ? `クーポン:${cp.title}${cp.price ? '(' + yen(cp.price) + ')' : ''}` : '', 'アプリ予約'].filter(Boolean).join(' / ');
    const body = { action: 'book', date: draft.date, time: draft.time, menu: draft.menu, name: c.name, kana: c.kana, tel: c.tel, email: c.email, note };
    let r = null;
    try { r = await apiPost(body); }
    catch (e) {
      // 応答が読めなかった場合：本当に入ったかを照会（v1.2 サーバーのみ）
      if (hasV12) {
        try {
          const q = await apiPost({ action: 'my_bookings', tel: c.tel, name: c.name });
          const hit = q && q.ok && (q.rows || []).find(x => x.date === draft.date && x.time === draft.time && x.status !== 'cancelled');
          if (hit) r = { ok: true, id: hit.id, cancel_token: '', recovered: true };
        } catch (e2) {}
      }
      if (!r) { draft.sending = false; draft.error = '通信エラーのため、予約が完了したか確認できませんでした。「マイ予約」に表示されない場合は、もう一度お試しください。'; return vBook(); }
    }
    draft.sending = false;
    if (r && r.ok) {
      const rec = { id: r.id, token: r.cancel_token || '', date: draft.date, time: draft.time, menu: draft.menu, min: m.min, price: cp && cp.price ? cp.price : m.price, coupon: cp ? cp.title : '', status: 'pending', created: new Date().toISOString() };
      saveMine([rec].concat(mine().filter(x => x.id !== rec.id)));
      draft.done = rec; draft.message = r.message || ''; draft.step = 5;
      delete slotCache[draft.date];
      return vBook();
    }
    if (r && r.error === 'slot_taken') {
      delete slotCache[draft.date]; draft.time = ''; draft.step = 2;
      vBook(); toast('その時間は埋まってしまいました。別の時間をお選びください');
      return;
    }
    draft.error = (r && (r.message || r.error)) || '予約できませんでした。時間をおいてお試しください。';
    vBook();
  }

  function calLinks(b) {
    const s = b.date.replace(/-/g, '') + 'T' + b.time.replace(':', '') + '00';
    const e = b.date.replace(/-/g, '') + 'T' + fmt(toMin(b.time) + (b.min || 60)).replace(':', '') + '00';
    const g = 'https://calendar.google.com/calendar/render?' + new URLSearchParams({ action: 'TEMPLATE', text: D.shop + '：' + b.menu, dates: s + '/' + e, ctz: 'Asia/Tokyo', location: D.info.address || '' });
    return g.toString();
  }
  function icsHref(b) {
    const s = b.date.replace(/-/g, '') + 'T' + b.time.replace(':', '') + '00';
    const e = b.date.replace(/-/g, '') + 'T' + fmt(toMin(b.time) + (b.min || 60)).replace(':', '') + '00';
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//THE EYEBROW//JP', 'BEGIN:VEVENT', 'UID:' + b.id + '@the-eyebrow',
      'DTSTART;TZID=Asia/Tokyo:' + s, 'DTEND;TZID=Asia/Tokyo:' + e, 'SUMMARY:' + D.shop + ' ' + b.menu, 'LOCATION:' + (D.info.address || ''),
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:ご予約のお時間が近づいています', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  }

  function vDone() {
    const b = draft.done;
    view.innerHTML = `<div class="okbox"><div class="ic">✓</div><h1 class="ttl" style="margin:0">ご予約を承りました</h1>
      <p class="small muted">${esc(draft.message || '')}</p></div>
      <div class="sum"><div><span>日時</span><span>${jpDate(b.date)} ${b.time}〜</span></div><div><span>メニュー</span><span>${esc(b.menu)}</span></div>
      <div><span>料金</span><span>${yen(b.price)}</span></div><div><span>予約番号</span><span>${esc(b.id)}</span></div></div>
      <a class="btn ghost" style="margin-top:14px" href="${esc(calLinks(b))}" target="_blank" rel="noopener">Googleカレンダーに追加</a>
      <a class="btn ghost" href="${icsHref(b)}" download="the-eyebrow-${b.date}.ics">iPhoneのカレンダーに追加</a>
      <button class="btn" data-go="mine" style="margin-top:10px">マイ予約を見る</button>
      ${installBanner()}`;
    bindInstall();
  }

  /* ---------- マイ予約 ---------- */
  async function refreshMine(cred) {
    const p = cred || store.get('profile', {});
    if (!hasV12 || !p.tel || !p.name) return false;
    try {
      const q = await apiPost({ action: 'my_bookings', tel: p.tel, name: p.name });
      if (!q || !q.ok) return false;
      const local = mine();
      (q.rows || []).forEach(r => {
        const l = local.find(x => x.id === r.id);
        if (l) { l.status = r.status === 'cancelled' ? 'cancelled' : (r.status || l.status); }
        else local.push({ id: r.id, token: '', date: r.date, time: r.time, menu: r.menu, min: r.duration_min, price: r.price, status: r.status, remote: true });
      });
      saveMine(local);
      return true;
    } catch (e) { return false; }
  }
  function vMine(skipRefresh) {
    const t = todayStr();
    const all = mine().slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const up = all.filter(b => b.date >= t && b.status !== 'cancelled').reverse();
    const past = all.filter(b => !(b.date >= t && b.status !== 'cancelled')).slice(0, 10);
    const card = (b, isPast) => `<div class="card bk ${isPast ? 'past' : ''}" ${isPast ? '' : `data-bk="${esc(b.id)}"`}>
      <div class="d"><span>${parseD(b.date).getMonth() + 1}月</span><b>${parseD(b.date).getDate()}</b><span>${WD[parseD(b.date).getDay()]}曜</span></div>
      <div style="flex:1;min-width:0"><div class="row"><b>${esc(b.time)}〜</b>${b.status === 'cancelled' ? '<span class="st cancelled">キャンセル済</span>' : isPast ? '<span class="st muted">ご来店済</span>' : '<span class="chip">予約中</span>'}</div>
        <div class="small">${esc(b.menu)}</div><div class="small muted">${yen(b.price)}${b.coupon ? '・クーポン利用' : ''}</div></div></div>`;
    view.innerHTML = `<h1 class="ttl">マイ予約</h1>
      ${up.length ? up.map(b => card(b, false)).join('') : `<div class="card empty">現在のご予約はありません<br><button class="btn" data-go="book" style="margin-top:14px">予約する</button></div>`}
      ${past.length ? `<h2 class="sec">これまでのご予約</h2>${past.map(b => card(b, true)).join('')}` : ''}
      ${hasV12 ? `<h2 class="sec">別の端末で予約した場合</h2>
        <div class="card"><div class="small muted" style="margin-bottom:10px">ご予約時のお名前と電話番号で呼び出せます。</div>
          <div class="field"><input id="q_name" placeholder="お名前（例：京都 花子）"></div>
          <div class="field"><input id="q_tel" type="tel" inputmode="numeric" placeholder="電話番号"></div>
          <button class="btn ghost" id="qBtn">予約を呼び出す</button></div>` : ''}`;
    view.querySelectorAll('[data-bk]').forEach(el => el.onclick = () => bookingSheet(mine().find(x => x.id === el.dataset.bk)));
    const qb = $('#qBtn');
    if (qb) qb.onclick = async () => {
      const name = $('#q_name').value.trim(), tel = $('#q_tel').value.replace(/[^\d]/g, '');
      if (!name || !tel) return toast('お名前と電話番号を入力してください');
      qb.disabled = true; qb.textContent = '確認中…';
      const ok = await refreshMine({ name, tel });
      toast(ok ? '予約を読み込みました' : '見つかりませんでした');
      vMine(true);
    };
    if (!skipRefresh) refreshMine().then(ok => { if (ok && route === 'mine') vMine(true); });
  }
  function bookingSheet(b) {
    if (!b) return;
    const canCancel = !!b.token;
    sheet(`<h1 class="ttl">ご予約内容</h1>
      <div class="sum"><div><span>日時</span><span>${jpDate(b.date)} ${b.time}〜</span></div><div><span>メニュー</span><span>${esc(b.menu)}</span></div>
      <div><span>料金</span><span>${yen(b.price)}</span></div>${b.coupon ? `<div><span>クーポン</span><span>${esc(b.coupon)}</span></div>` : ''}<div><span>予約番号</span><span>${esc(b.id)}</span></div></div>
      <a class="btn ghost" style="margin-top:14px" href="${esc(calLinks(b))}" target="_blank" rel="noopener">カレンダーに追加</a>
      <a class="btn ghost" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(D.info.mapQuery || D.info.address || D.shop)}" target="_blank" rel="noopener">お店までの道順</a>
      ${canCancel ? `<button class="btn danger" id="cxl">この予約をキャンセルする</button>`
        : `<p class="small muted" style="margin-top:12px">この予約は別の端末で行われたため、ここからはキャンセルできません。ご予約いただいた端末から操作するか、お店へご連絡ください。</p>`}
      <button class="btn ghost" data-close>閉じる</button>`);
    const x = $('#cxl');
    if (x) x.onclick = async () => {
      if (x.dataset.confirm !== '1') { x.dataset.confirm = '1'; x.textContent = 'もう一度押すとキャンセルします'; x.style.background = 'var(--ng)'; x.style.color = '#fff'; return; }
      x.disabled = true; x.textContent = 'キャンセル中…';
      try {
        const r = await apiPost({ action: 'cancel', id: b.id, cancel_token: b.token });
        if (r && r.ok) {
          saveMine(mine().map(m => m.id === b.id ? Object.assign(m, { status: 'cancelled' }) : m));
          closeSheet(); toast('キャンセルしました'); vMine(true);
        } else { x.disabled = false; x.textContent = 'キャンセルできませんでした（再試行）'; delete x.dataset.confirm; }
      } catch (e) { x.disabled = false; x.textContent = '通信エラー（再試行）'; delete x.dataset.confirm; }
    };
  }

  /* ---------- お店 ---------- */
  function vShop() {
    const i = D.info || {};
    const map = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(i.mapQuery || i.address || D.shop);
    view.innerHTML = `<h1 class="ttl">${esc(D.shop)}</h1>
      <div class="card"><dl class="kv">
        <dt>住所</dt><dd>${esc(i.address || '')}</dd>
        <dt>アクセス</dt><dd class="small">${esc(i.access || '')}</dd>
        <dt>営業時間</dt><dd>${esc(i.hours || (D.open + '〜' + D.close))}</dd>
        ${i.seats ? `<dt>設備</dt><dd>${esc(i.seats)}</dd>` : ''}
        ${i.tel ? `<dt>電話</dt><dd><a href="tel:${esc(i.tel)}">${esc(i.tel)}</a></dd>` : ''}
      </dl>
      <div class="links"><a class="btn ghost" href="${map}" target="_blank" rel="noopener">地図で見る</a>
        ${i.tel ? `<a class="btn ghost" href="tel:${esc(i.tel)}">電話する</a>` : `<button class="btn ghost" data-go="book">予約する</button>`}</div></div>
      ${(i.features || []).length ? `<h2 class="sec">こだわり</h2><div class="tags">${i.features.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}
      ${(i.line || i.instagram) ? `<h2 class="sec">SNS</h2><div class="links">
        ${i.line ? `<a class="btn ghost" href="${esc(i.line)}" target="_blank" rel="noopener">LINE</a>` : ''}
        ${i.instagram ? `<a class="btn ghost" href="${esc(i.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ''}</div>` : ''}
      <p class="small muted" style="text-align:center;margin-top:28px">© ${new Date().getFullYear()} ${esc(D.shop)}</p>`;
  }

  /* ---------- 起動 ---------- */
  route = (location.hash || '#home').slice(1) || 'home';
  render();
  loadData();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.__EB = { go, get draft() { return draft; } }; // テスト用
})();
