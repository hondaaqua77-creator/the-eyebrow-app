/* THE EYEBROW スタッフ専用アプリ v2.0（社内連絡・備品発注・空き状況・研修動画・お店情報） */
(function () {
  'use strict';
  const API = window.EB_CONFIG.API_URL;
  const $ = s => document.querySelector(s);
  const view = $('#view');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ebs_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ebs_' + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem('ebs_' + k); } catch (e) {} }
  };
  let auth = store.get('auth', null); // { name, pass, role }
  let F = store.get('feed', null);    // 最後に読み込んだ内容（電波が悪くても表示できるように）
  let route = 'notice', orderTab = '依頼中', videoCat = 'すべて';

  async function call(action, extra) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
    try {
      const r = await fetch(API, { method: 'POST', body: JSON.stringify(Object.assign({ action, pass: auth && auth.pass, name: auth && auth.name }, extra || {})), signal: ctl.signal });
      const j = JSON.parse(await r.text());
      if (j && j.error === 'auth' && action !== 'staff_auth') { logout(); throw new Error('合言葉が変更されました。もう一度ログインしてください'); }
      return j;
    } finally { clearTimeout(t); }
  }
  async function load(silent) {
    try {
      const r = await call('staff_feed');
      if (r && r.ok) { F = r; auth.role = r.role; store.set('auth', auth); store.set('feed', F); badges(); if (!silent || $('#sheet').hidden) render(); }
      else if (!silent) toast((r && r.message) || '読み込めませんでした');
    } catch (e) { if (!silent) toast(e.message === 'Failed to fetch' ? '通信できませんでした' : e.message); }
  }
  function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2600); }
  function sheet(h) { $('#sheetBody').innerHTML = h; $('#sheet').hidden = false; }
  function closeSheet() { $('#sheet').hidden = true; }
  $('#sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
  const isMgr = () => auth && auth.role === 'manager';
  const fmtDate = s => { const m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2})?:?(\d{2})?/); return m ? `${+m[2]}/${+m[3]}${m[4] ? ' ' + m[4] + ':' + m[5] : ''}` : ''; };

  /* ---------- ログイン ---------- */
  function vLogin(msg, typed) {
    $('#tabs').hidden = true; $('#who').textContent = '';
    view.innerHTML = `<div class="login">
      <div class="wm"><i>Staff only</i>The Eyebrow</div>
      <p class="muted small">スタッフ専用のページです。店長から伝えられた合言葉を入力してください。</p>
      <div class="field"><label>お名前</label><input id="l_name" autocomplete="nickname" placeholder="例）千田" value="${esc(typed || (auth && auth.name) || store.get('lastName', ''))}"></div>
      <div class="field"><label>合言葉</label><input id="l_pass" type="password" autocomplete="current-password"></div>
      ${msg ? `<div class="err" style="margin:0 0 14px">${esc(msg)}</div>` : ''}
      <button class="btn" id="l_go">ログインする</button>
      <p class="small muted" style="margin-top:18px">この端末にログイン状態が保存されます。共用の端末では、使い終わったら「設定」からログアウトしてください。</p></div>`;
    $('#l_go').onclick = async () => {
      const name = $('#l_name').value.trim(), pass = $('#l_pass').value;
      if (!name || !pass) return vLogin('お名前と合言葉を入力してください', name);
      $('#l_go').disabled = true; $('#l_go').textContent = '確認中…';
      auth = { name, pass };
      try {
        const r = await call('staff_auth');
        if (r && r.ok) { auth.role = r.role; store.set('auth', auth); store.set('lastName', name); boot(); }
        else { auth = null; vLogin((r && r.message) || '合言葉が違います', name); }
      } catch (e) { auth = null; vLogin('通信できませんでした。電波の良い場所でお試しください', name); }
    };
  }
  function logout() { auth = null; F = null; store.del('auth'); store.del('feed'); route = 'notice'; vLogin(); }

  /* ---------- 画面切替 ---------- */
  document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g && auth) { route = g.dataset.go; render(); window.scrollTo(0, 0); } });
  function badges() {
    if (!F) return;
    const un = F.notices.filter(n => !n.read).length;
    const pend = F.orders.filter(o => o.status === '依頼中').length;
    const todo = F.videos.filter(v => !v.done).length;
    const set = (id, n) => { const b = $(id); b.hidden = !n; b.textContent = n; };
    set('#bNotice', un); set('#bOrder', isMgr() ? pend : 0); set('#bVideo', todo);
  }
  function render() {
    if (!auth) return vLogin();
    $('#tabs').hidden = false;
    $('#who').textContent = `${auth.name}${isMgr() ? '（店長）' : ''}`;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === route));
    if (!F) { view.innerHTML = '<div class="spin"></div>'; return; }
    ({ notice: vNotice, order: vOrder, slots: vSlots, video: vVideo, shop: vShop, me: vShop }[route] || vNotice)();
    badges();
  }

  /* ---------- 社内連絡 ---------- */
  function vNotice() {
    const list = F.notices.slice().sort((a, b) => (b.pinned - a.pinned) || String(b.created_at).localeCompare(String(a.created_at)));
    view.innerHTML = `<h1 class="ttl">社内連絡</h1>
      ${list.map(n => `<button class="card nt ${n.read ? '' : 'unread'}" data-n="${esc(n.id)}">
        <div class="meta">${n.pinned ? '<span class="pin">固定</span>' : ''}<span>${esc(fmtDate(n.created_at))}</span><span>${esc(n.author)}</span>${n.read ? '' : '<span style="color:var(--brass)">未読</span>'}</div>
        <b>${esc(n.title)}</b><div class="body">${esc(n.body)}</div></button>`).join('') || '<div class="card empty">連絡はまだありません</div>'}
      ${isMgr() ? '<button class="fab" id="newN">連絡を書く</button>' : ''}`;
    view.querySelectorAll('[data-n]').forEach(el => el.onclick = () => openNotice(F.notices.find(x => x.id === el.dataset.n)));
    const nb = $('#newN'); if (nb) nb.onclick = composeNotice;
  }
  function openNotice(n) {
    if (!n) return;
    sheet(`<div class="meta small muted">${n.pinned ? '<span class="pin">固定</span> ' : ''}${esc(fmtDate(n.created_at))}　${esc(n.author)}</div>
      <h1 class="ttl" style="margin-top:8px">${esc(n.title)}</h1>
      <div class="prose">${esc(n.body)}</div>
      <p class="small muted" style="margin-top:20px">既読 ${n.readers.length}名${isMgr() && n.readers.length ? '：' + n.readers.map(esc).join('、') : ''}</p>
      ${isMgr() ? '<button class="btn danger" id="delN">この連絡を削除する</button>' : ''}
      <button class="btn ghost" data-close style="margin-top:10px">閉じる</button>`);
    if (!n.read) { n.read = true; n.readers.push(auth.name); store.set('feed', F); badges(); render(); call('staff_notice_read', { id: n.id }).catch(() => {}); }
    const d = $('#delN');
    if (d) d.onclick = async () => {
      if (d.dataset.c !== '1') { d.dataset.c = '1'; d.textContent = 'もう一度押すと削除します'; return; }
      d.disabled = true; const r = await call('staff_notice_delete', { id: n.id }).catch(() => null);
      if (r && r.ok) { closeSheet(); toast('削除しました'); load(); } else { d.disabled = false; toast('削除できませんでした'); }
    };
  }
  function composeNotice() {
    sheet(`<h1 class="ttl">連絡を書く</h1>
      <div class="field"><label>件名<em>必須</em></label><input id="n_t" maxlength="80" placeholder="例）10月の営業時間の変更"></div>
      <div class="field"><label>本文</label><textarea id="n_b" rows="7" placeholder="スタッフ全員に伝えたい内容"></textarea></div>
      <label class="check"><input type="checkbox" id="n_p"> 一覧の一番上に固定する</label>
      <button class="btn" id="n_go">投稿する</button><button class="btn ghost" data-close>やめる</button>`);
    $('#n_go').onclick = async () => {
      const title = $('#n_t').value.trim(); if (!title) return toast('件名を入力してください');
      $('#n_go').disabled = true; $('#n_go').textContent = '投稿中…';
      const r = await call('staff_notice_post', { title, body: $('#n_b').value, pinned: $('#n_p').checked }).catch(() => null);
      if (r && r.ok) { closeSheet(); toast('投稿しました'); load(); } else { $('#n_go').disabled = false; $('#n_go').textContent = '投稿する'; toast((r && r.message) || '投稿できませんでした'); }
    };
  }

  /* ---------- 備品発注 ---------- */
  const SCLS = { '依頼中': 's1', '発注済': 's2', '納品済': 's3', '取り下げ': 's4' };
  function vOrder() {
    const tabs = ['依頼中', '発注済', '納品済'];
    const list = F.orders.filter(o => orderTab === '納品済' ? (o.status === '納品済' || o.status === '取り下げ') : o.status === orderTab);
    view.innerHTML = `<h1 class="ttl">備品発注</h1>
      <button class="btn" id="newO">備品を依頼する</button>
      <h2 class="sec">依頼の一覧</h2>
      <div class="seg">${tabs.map(t => `<button data-ot="${t}" class="${t === orderTab ? 'on' : ''}">${t === '納品済' ? '完了' : t}（${F.orders.filter(o => t === '納品済' ? (o.status === '納品済' || o.status === '取り下げ') : o.status === t).length}）</button>`).join('')}</div>
      ${list.map(o => `<div class="card od">
        <b>${esc(o.item)}${o.urgency === '至急' ? '<span class="urg">至急</span>' : ''}</b><span class="q">×${o.qty}</span>
        <div class="meta">${esc(fmtDate(o.created_at))}　依頼：${esc(o.requester)}　<span class="stt ${SCLS[o.status] || ''}">${esc(o.status)}</span>${o.handled_by && o.status !== '依頼中' ? '　対応：' + esc(o.handled_by) : ''}</div>
        ${o.note ? `<div class="meta" style="color:var(--ink-2)">${esc(o.note)}</div>` : ''}
        ${isMgr() ? `<div class="acts">${['依頼中', '発注済', '納品済', '取り下げ'].map(s => `<button data-os="${s}" data-oid="${esc(o.id)}" class="${s === o.status ? 'on' : ''}">${s}</button>`).join('')}</div>`
          : (o.requester === auth.name && o.status === '依頼中' ? `<div class="acts"><button data-os="取り下げ" data-oid="${esc(o.id)}">依頼を取り下げる</button></div>` : '')}
      </div>`).join('') || `<div class="card empty">${orderTab === '依頼中' ? '未対応の依頼はありません' : '該当する依頼はありません'}</div>`}`;
    $('#newO').onclick = composeOrder;
    view.querySelectorAll('[data-ot]').forEach(b => b.onclick = () => { orderTab = b.dataset.ot; vOrder(); });
    view.querySelectorAll('[data-os]').forEach(b => b.onclick = async () => {
      const o = F.orders.find(x => x.id === b.dataset.oid); if (!o || o.status === b.dataset.os) return;
      const prev = o.status; o.status = b.dataset.os; o.handled_by = auth.name; vOrder();
      const r = await call('staff_order_update', { id: o.id, status: o.status }).catch(() => null);
      if (r && r.ok) toast(`「${o.item}」を${o.status}にしました`); else { o.status = prev; vOrder(); toast((r && r.message) || '更新できませんでした'); }
    });
  }
  function composeOrder() {
    const items = (F.items || []).map(i => typeof i === 'string' ? { name: i } : i);
    sheet(`<h1 class="ttl">備品を依頼する</h1>
      <div class="field"><label>品名<em>必須</em></label><input id="o_i" list="o_list" maxlength="60" placeholder="例）眉用ワックス"><datalist id="o_list">${items.map(i => `<option value="${esc(i.name)}">`).join('')}</datalist></div>
      ${items.length ? `<div class="quick">${items.slice(0, 12).map(i => `<button data-q="${esc(i.name)}">${esc(i.name)}</button>`).join('')}</div>` : ''}
      <div class="two"><div class="field"><label>数量</label><div class="stepper"><button id="o_m" aria-label="減らす">−</button><input id="o_q" type="number" inputmode="numeric" value="1" min="1" max="999"><button id="o_p" aria-label="増やす">＋</button></div></div>
        <div class="field"><label>急ぎ度</label><div class="seg" style="margin:0"><button data-u="通常" class="on">通常</button><button data-u="至急">至急</button></div></div></div>
      <div class="field"><label>メモ</label><textarea id="o_n" rows="3" maxlength="300" placeholder="型番・色・残りの数など"></textarea></div>
      <p class="small muted">依頼すると店長にメールで届きます。</p>
      <button class="btn" id="o_go">依頼する</button><button class="btn ghost" data-close>やめる</button>`);
    let urg = '通常';
    document.querySelectorAll('#sheet [data-u]').forEach(b => b.onclick = () => { urg = b.dataset.u; document.querySelectorAll('#sheet [data-u]').forEach(x => x.classList.toggle('on', x === b)); });
    document.querySelectorAll('#sheet [data-q]').forEach(b => b.onclick = () => { $('#o_i').value = b.dataset.q; });
    const q = $('#o_q'); $('#o_m').onclick = () => q.value = Math.max(1, (+q.value || 1) - 1); $('#o_p').onclick = () => q.value = Math.min(999, (+q.value || 0) + 1);
    $('#o_go').onclick = async () => {
      const item = $('#o_i').value.trim(); if (!item) return toast('品名を入力してください');
      $('#o_go').disabled = true; $('#o_go').textContent = '送信中…';
      const r = await call('staff_order_create', { item, qty: +q.value || 1, urgency: urg, note: $('#o_n').value }).catch(() => null);
      if (r && r.ok) { closeSheet(); orderTab = '依頼中'; toast('依頼しました'); load(); } else { $('#o_go').disabled = false; $('#o_go').textContent = '依頼する'; toast((r && r.message) || '依頼できませんでした'); }
    };
  }

  /* ---------- 研修動画 ---------- */
  function embedOf(url) {
    const u = String(url || ''); let m;
    if ((m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{6,})/))) return { src: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&playsinline=1`, thumb: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` };
    if ((m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]{10,})/))) return { src: `https://drive.google.com/file/d/${m[1]}/preview`, thumb: '' };
    return null;
  }
  const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  function vVideo() {
    const vs = F.videos;
    const cats = ['すべて'].concat([...new Set(vs.map(v => v.category || 'その他'))]);
    const list = vs.filter(v => videoCat === 'すべて' || (v.category || 'その他') === videoCat);
    const done = vs.filter(v => v.done).length;
    view.innerHTML = `<h1 class="ttl">研修動画</h1>
      ${vs.length ? `<div class="card"><div class="row"><span class="small">あなたの受講状況</span><span class="price">${done} / ${vs.length}</span></div><div class="progress"><i style="width:${vs.length ? Math.round(done / vs.length * 100) : 0}%"></i></div></div>` : ''}
      ${cats.length > 2 ? `<div class="cats" style="margin-top:16px">${cats.map(c => `<button data-vc="${esc(c)}" class="${c === videoCat ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : '<div style="height:14px"></div>'}
      ${list.map(v => { const e = embedOf(v.url); return `<div class="card vd" data-v="${esc(v.id)}">
        <div class="th" ${e && e.thumb ? `style="background-image:url('${esc(e.thumb)}')"` : ''}>${PLAY}${v.done ? '<span class="ok">✓</span>' : ''}</div>
        <div style="min-width:0"><span class="meta">${esc(v.category || 'その他')}${v.minutes ? '　約' + v.minutes + '分' : ''}</span><b>${esc(v.title)}</b>
        <span class="meta">${v.done ? '受講済み' : '未受講'}${isMgr() ? `　受講 ${v.watchers.length}名` : ''}</span></div></div>`; }).join('') || '<div class="card empty">研修動画はまだありません</div>'}
      ${isMgr() ? '<button class="fab" id="newV">動画を追加</button>' : ''}`;
    view.querySelectorAll('[data-vc]').forEach(b => b.onclick = () => { videoCat = b.dataset.vc; vVideo(); });
    view.querySelectorAll('[data-v]').forEach(el => el.onclick = () => openVideo(F.videos.find(x => x.id === el.dataset.v)));
    const nv = $('#newV'); if (nv) nv.onclick = composeVideo;
  }
  function openVideo(v) {
    if (!v) return;
    const e = embedOf(v.url);
    sheet(`${e ? `<div class="player"><iframe src="${esc(e.src)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="${esc(v.title)}"></iframe></div>` : `<p class="err">この動画は埋め込み表示できません。<a href="${esc(v.url)}" target="_blank" rel="noopener">別の画面で開く</a></p>`}
      <span class="meta small muted">${esc(v.category || 'その他')}${v.minutes ? '　約' + v.minutes + '分' : ''}</span>
      <h1 class="ttl" style="margin-top:4px">${esc(v.title)}</h1>
      ${v.description ? `<div class="prose small">${esc(v.description)}</div>` : ''}
      ${isMgr() ? `<p class="small muted" style="margin-top:14px">受講済み：${v.watchers.length ? v.watchers.map(esc).join('、') : 'まだいません'}</p>` : ''}
      <button class="btn" id="vDone" style="margin-top:16px" ${v.done ? 'disabled' : ''}>${v.done ? '受講済みです' : '最後まで見たので受講済みにする'}</button>
      ${isMgr() ? '<button class="btn danger" id="vDel">この動画を一覧から外す</button>' : ''}
      <button class="btn ghost" data-close>閉じる</button>`);
    $('#vDone').onclick = async () => {
      $('#vDone').disabled = true;
      const r = await call('staff_video_done', { id: v.id }).catch(() => null);
      if (r && r.ok) { v.done = true; if (!v.watchers.includes(auth.name)) v.watchers.push(auth.name); store.set('feed', F); $('#vDone').textContent = '受講済みです'; toast('受講済みにしました'); render(); }
      else { $('#vDone').disabled = false; toast('記録できませんでした'); }
    };
    const d = $('#vDel');
    if (d) d.onclick = async () => {
      if (d.dataset.c !== '1') { d.dataset.c = '1'; d.textContent = 'もう一度押すと一覧から外します'; return; }
      d.disabled = true; const r = await call('staff_video_delete', { id: v.id }).catch(() => null);
      if (r && r.ok) { closeSheet(); toast('一覧から外しました'); load(); } else { d.disabled = false; toast('操作できませんでした'); }
    };
  }
  function composeVideo() {
    sheet(`<h1 class="ttl">研修動画を追加</h1>
      <p class="small muted" style="margin-top:-8px">YouTubeは「限定公開」、Googleドライブは「リンクを知っている全員が閲覧可」にしてからURLを貼ってください。</p>
      <div class="field"><label>動画のURL<em>必須</em></label><input id="v_u" inputmode="url" placeholder="https://youtu.be/… または https://drive.google.com/file/d/…"></div>
      <div class="field"><label>タイトル<em>必須</em></label><input id="v_t" maxlength="80" placeholder="例）HBL施術の流れ（基本）"></div>
      <div class="two"><div class="field"><label>分類</label><input id="v_c" list="v_cl" maxlength="20" placeholder="例）施術"><datalist id="v_cl">${[...new Set(F.videos.map(v => v.category).concat(['施術', '接客', 'カウンセリング', '衛生管理', 'サロンボード']))].map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label>長さ（分）</label><input id="v_m" type="number" inputmode="numeric" min="0" max="600" placeholder="12"></div></div>
      <div class="field"><label>説明・見るポイント</label><textarea id="v_d" rows="4" maxlength="1000"></textarea></div>
      <button class="btn" id="v_go">追加する</button><button class="btn ghost" data-close>やめる</button>`);
    $('#v_go').onclick = async () => {
      const url = $('#v_u').value.trim(), title = $('#v_t').value.trim();
      if (!url || !title) return toast('URLとタイトルを入力してください');
      if (!embedOf(url)) return toast('YouTube か Googleドライブ の動画URLを貼ってください');
      $('#v_go').disabled = true; $('#v_go').textContent = '追加中…';
      const r = await call('staff_video_add', { url, title, category: $('#v_c').value.trim() || 'その他', minutes: +$('#v_m').value || 0, description: $('#v_d').value }).catch(() => null);
      if (r && r.ok) { closeSheet(); toast('追加しました'); load(); } else { $('#v_go').disabled = false; $('#v_go').textContent = '追加する'; toast((r && r.message) || '追加できませんでした'); }
    };
  }

  /* ---------- 設定 ---------- */
  /* ---------- お店の情報（メニュー・クーポン・空き状況のもと） ---------- */
  let SHOP = store.get('shop', null);
  const yen = n => '¥' + Number(n || 0).toLocaleString('ja-JP');
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const toMin = t => { const p = String(t).split(':'); return (+p[0]) * 60 + (+p[1] || 0); };
  const fmt = m => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
  const ymd = d => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  async function getJSON(params) {
    for (let i = 0; i < 3; i++) {
      try { const r = await fetch(API + '?' + new URLSearchParams(params)); return JSON.parse(await r.text()); }
      catch (e) { await new Promise(r => setTimeout(r, 600 * (i + 1))); }
    }
    throw new Error('通信できませんでした');
  }
  async function loadShop() {
    try { const r = await getJSON({ api: 'app' }); if (r && r.ok) { SHOP = r; store.set('shop', SHOP); if (route === 'shop' || route === 'slots') render(); } } catch (e) {}
  }

  /* ---------- 空き状況 ---------- */
  let sDate = '', sMenu = '';
  const slotCache = {};
  function vSlots() {
    if (!SHOP) { view.innerHTML = '<h1 class="ttl">空き状況</h1><div class="spin"></div>'; loadShop(); return; }
    const days = []; const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    for (let i = 0; i < Math.min(SHOP.maxDays || 60, 60); i++) { const d = new Date(t0); d.setDate(d.getDate() + i); days.push(d); }
    if (!sDate) { const nw = new Date(), late = nw.getHours() * 60 + nw.getMinutes() > toMin(SHOP.close || '19:00') - 60; sDate = ymd(days[late && days[1] ? 1 : 0]); }
    view.innerHTML = `<h1 class="ttl">空き状況</h1>
      <div class="field"><label>メニュー（所要時間で入れる時間を表示）</label><select id="s_menu"><option value="">時間枠だけを見る（30分ごと）</option>${(SHOP.menus || []).map(m => `<option value="${esc(m.name)}" ${m.name === sMenu ? 'selected' : ''}>${esc(m.name)}（${m.min}分）</option>`).join('')}</select></div>
      <div class="days">${days.map(d => { const v = ymd(d), off = (SHOP.closedDays || []).includes(d.getDay());
        return `<button class="day ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''} ${off ? 'off' : ''} ${v === sDate ? 'sel' : ''}" data-day="${v}" ${off ? 'disabled' : ''}><span class="m">${d.getMonth() + 1}月</span><span class="n">${d.getDate()}</span><span class="w">${WD[d.getDay()]}</span></button>`; }).join('')}</div>
      <div id="slotArea"><div class="spin"></div></div>
      <p class="small muted" style="margin-top:16px">サロンボードの予約表と10分ごとに同期した空き状況です。直前の予約は反映されていないことがあるので、確定前にサロンボードでも確認してください。</p>`;
    const sel = view.querySelector('.day.sel'); if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
    view.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { sDate = b.dataset.day; vSlots(); });
    $('#s_menu').onchange = e => { sMenu = e.target.value; drawSlots(); };
    drawSlots();
  }
  async function drawSlots(force) {
    const date = sDate, area = $('#slotArea'); if (!area) return;
    try {
      let c = slotCache[date];
      if (force || !c || Date.now() - c.at > 60000) { c = { at: Date.now(), data: await getJSON({ api: 'slots', date }) }; slotCache[date] = c; }
      if (date !== sDate || route !== 'slots') return;
      const slots = (c.data && c.data.slots) || [];
      const a = $('#slotArea'); if (!a) return;
      if (c.data && c.data.closed) { a.innerHTML = '<div class="card empty">この日は定休日です</div>'; return; }
      const avail = {}; slots.forEach(x => avail[x.time] = x.available);
      const m = (SHOP.menus || []).find(x => x.name === sMenu);
      const step = SHOP.step || 30;
      const ok = t => { if (!m) return avail[t]; for (let x = toMin(t); x < toMin(t) + m.min; x += step) if (!avail[fmt(x)]) return false; return true; };
      const n = slots.filter(x => ok(x.time)).length;
      a.innerHTML = `<div class="row" style="margin:14px 0 2px"><span class="small">${m ? `「${esc(m.name)}」を始められる時間` : '空いている時間枠'}</span><span class="price">${n}<span class="small muted"> 枠</span></span></div>
        ${n ? '' : '<div class="small muted" style="margin:6px 0 0">この日は空きがありません。</div>'}<div class="slots">${slots.map(x => `<button disabled class="${ok(x.time) ? 'open' : ''}">${x.time}</button>`).join('')}</div>
        <button class="btn ghost" id="sRe" style="margin-top:14px">最新に更新する</button>`;
      $('#sRe').onclick = () => { a.innerHTML = '<div class="spin"></div>'; drawSlots(true); };
    } catch (e) {
      const a = $('#slotArea'); if (a) a.innerHTML = '<div class="err">空き状況を読み込めませんでした。電波の良い場所で「空き状況」を開き直してください。</div>';
    }
  }

  /* ---------- お店（メニュー・クーポン・店舗情報・設定） ---------- */
  let shopTab = 'メニュー';
  function vShop() {
    const tabs = ['メニュー', 'クーポン', '店舗情報', '設定'];
    let body = '';
    if (shopTab === '設定') {
      body = `<div class="card"><dl class="kv"><dt>お名前</dt><dd>${esc(auth.name)}</dd><dt>権限</dt><dd>${isMgr() ? '店長（連絡・動画の追加、発注の処理ができます）' : 'スタッフ'}</dd></dl></div>
        <button class="btn ghost" id="reload" style="margin-top:16px">最新の内容に更新する</button>
        <button class="btn danger" id="out">ログアウトする</button>
        <p class="small muted" style="margin-top:22px">お名前を変えたいときは、ログアウトしてから入り直してください。既読や受講の記録はお名前ごとに残ります。メニュー・クーポン・店舗情報は、スプレッドシートの「設定」シートで変更できます。</p>`;
    } else if (!SHOP) { body = '<div class="spin"></div>'; loadShop(); }
    else if (shopTab === 'メニュー') {
      body = (SHOP.menus || []).map(m => `<div class="card"><div class="row" style="align-items:flex-start"><b style="font-family:var(--mincho);font-size:14.5px;line-height:1.55">${esc(m.name)}</b><span class="price">${yen(m.price)}</span></div>
        <div class="small muted" style="margin-top:2px">約${m.min}分${m.cat ? '　' + esc(m.cat) : ''}</div>${m.desc ? `<div class="small" style="margin-top:8px">${esc(m.desc)}</div>` : ''}</div>`).join('') || '<div class="card empty">メニューが登録されていません</div>';
    } else if (shopTab === 'クーポン') {
      body = (SHOP.coupons || []).map(c => `<div class="card coupon" style="cursor:default"><span class="chip ${/新規/.test(c.target || '') ? 'new' : ''}">${esc(c.target || '全員')}</span>
        <div class="t">${esc(c.title)}</div><div class="row"><span class="small muted">${esc(c.note || '')}${c.menu ? '<br>対象：' + esc(c.menu) : ''}</span><span class="price">${c.regular ? `<s>${yen(c.regular)}</s>` : ''}${yen(c.price)}</span></div></div>`).join('') || '<div class="card empty">クーポンは登録されていません</div>';
    } else {
      const i = SHOP.info || {};
      const map = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(i.mapQuery || i.address || SHOP.shop);
      body = `<div class="card"><dl class="kv"><dt>店名</dt><dd>${esc(SHOP.shop)}</dd><dt>住所</dt><dd>${esc(i.address || '')}</dd><dt>アクセス</dt><dd class="small">${esc(i.access || '')}</dd>
        <dt>営業時間</dt><dd>${esc(i.hours || (SHOP.open + '〜' + SHOP.close))}</dd>${i.seats ? `<dt>設備</dt><dd>${esc(i.seats)}</dd>` : ''}${i.tel ? `<dt>電話</dt><dd><a href="tel:${esc(i.tel)}">${esc(i.tel)}</a></dd>` : ''}</dl>
        <div class="links"><a class="btn ghost" href="${map}" target="_blank" rel="noopener">地図で見る</a><a class="btn ghost" href="https://salonboard.com/login/" target="_blank" rel="noopener">サロンボード</a></div></div>
        ${(i.features || []).length ? `<h2 class="sec">こだわり</h2><div class="tags">${i.features.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}`;
    }
    view.innerHTML = `<h1 class="ttl">お店</h1><div class="seg">${tabs.map(t => `<button data-st="${t}" class="${t === shopTab ? 'on' : ''}">${t}</button>`).join('')}</div>${body}`;
    view.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { shopTab = b.dataset.st; vShop(); });
    const rl = $('#reload'); if (rl) rl.onclick = () => { toast('更新しています'); load(); loadShop(); };
    const out = $('#out'); if (out) out.onclick = logout;
  }

  function boot() { render(); load(); loadShop(); }
  if (auth && auth.pass) boot(); else vLogin();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && auth) load(true); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__EBS = { get F() { return F; } };
})();
