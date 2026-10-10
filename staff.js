/* THE EYEBROW スタッフ専用アプリ v5.1（ホーム・予約・カルテ・業務・売上・資料・連絡） */
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
  let route = 'home', orderTab = '依頼中', videoCat = 'すべて';

  async function call(action, extra, ms) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 30000);
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
  function logout() { auth = null; F = null; KS.clear(); store.del('auth'); store.del('feed'); route = 'home'; vLogin(); }

  /* ---------- 画面切替 ---------- */
  document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g && auth) { const k = g.dataset.go; route = GROUPS[k] ? (lastSub[k] || GROUPS[k].subs[0][0]) : k; render(); window.scrollTo(0, 0); } });
  function badges() {
    if (!F) return;
    const un = F.notices.filter(n => !n.read).length;
    const pend = F.orders.filter(o => o.status === '依頼中').length;
    const todo = F.videos.filter(v => !v.done).length;
    const set = (id, n) => { const b = $(id); if (!b) return; b.hidden = !n; b.textContent = n; };
    set('#bNotice', un); set('#bWork', isMgr() ? pend : 0); set('#bDocs', todo);
  }
  // タブ（下のナビ）と、各タブの中の切り替え
  const GROUPS = {
    rsv: { title: '予約・カルテ', subs: [['today', '本日の予約'], ['karte', 'カルテ'], ['slots', '空き状況']] },
    work: { title: '業務', subs: [['time', '勤怠'], ['shift', 'シフト'], ['check', 'チェック'], ['report', '日報'], ['stock', '備品'], ['dash', '売上', 'mgr']] },
    docs: { title: '資料', subs: [['video', '研修'], ['manual', 'マニュアル'], ['menu', 'メニュー'], ['info', 'お店']] }
  };
  const ALIAS = { order: 'stock', skill: 'video', kdetail: 'karte' }; // 画面の中の切り替え（備品＝在庫・発注、研修＝動画・技術チェック）
  const groupOf = r => { r = ALIAS[r] || r; return Object.keys(GROUPS).find(g => GROUPS[g].subs.some(x => x[0] === r)) || r; };
  const lastSub = store.get('lastSub', {});
  function hdr(g) {
    const G = GROUPS[g];
    return `<h1 class="ttl">${G.title}</h1><div class="seg sub">${G.subs.filter(x => x[2] !== 'mgr' || isMgr()).map(([k, l]) => `<button data-sub="${k}" class="${k === (ALIAS[route] || route) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  }
  view.addEventListener('click', e => { const b = e.target.closest('[data-sub]'); if (b) { route = b.dataset.sub; lastSub[groupOf(route)] = route; store.set('lastSub', lastSub); render(); window.scrollTo(0, 0); } });
  function render() {
    if (!auth) return vLogin();
    $('#tabs').hidden = false;
    $('#who').textContent = `${auth.name}${isMgr() ? '（店長）' : ''}`;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === groupOf(route)));
    if (!F) { view.innerHTML = '<div class="spin"></div>'; return; }
    if (route === 'dash' && !isMgr()) route = 'time';
    ({ home: vHome, today: vToday, slots: vSlots, time: vTime, shift: vShift, check: vCheck, report: vReport, stock: vStock, order: vOrder, video: vVideo, skill: vSkill, manual: vManual, menu: vMenu, info: vInfo, notice: vNotice, settings: vSettings, karte: vKarte, kdetail: vKDetail, dash: vDash }[route] || vHome)();
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
    view.innerHTML = `${hdr('work')}${innerSeg([['stock', '在庫'], ['order', '発注依頼']])}
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
    if ((m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]{10,})/))) return { src: `https://drive.google.com/file/d/${m[1]}/preview`, thumb: `https://drive.google.com/thumbnail?id=${m[1]}&sz=w480` };
    return null;
  }
  const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  function vVideo() {
    const vs = F.videos;
    const cats = ['すべて'].concat([...new Set(vs.map(v => v.category || 'その他'))]);
    const list = vs.filter(v => videoCat === 'すべて' || (v.category || 'その他') === videoCat);
    const done = vs.filter(v => v.done).length;
    view.innerHTML = `${hdr('docs')}${innerSeg([['video', '研修動画'], ['skill', '技術チェック']])}
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
      ${quizBlock(v)}
      ${quizOf(v.id) ? '' : `<button class="btn" id="vDone" style="margin-top:16px" ${v.done ? 'disabled' : ''}>${v.done ? '受講済みです' : '最後まで見たので受講済みにする'}</button>`}
      ${isMgr() ? `<button class="btn ghost" id="qEdit">${quizOf(v.id) ? '確認テストを編集する' : '確認テストを作る'}</button><button class="btn danger" id="vDel">この動画を一覧から外す</button>` : ''}
      <button class="btn ghost" data-close>閉じる</button>`);
    bindQuiz(v);
    if ($('#vDone')) $('#vDone').onclick = async () => {
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
    let file = null, mode = 'file';
    sheet(`<h1 class="ttl">研修動画を追加</h1>
      <div class="seg" style="margin-top:-6px"><button data-vm="file" class="on">スマホの動画</button><button data-vm="url">URLを貼る</button></div>
      <div id="v_fbox"><label class="vpick" id="v_pick"><input type="file" accept="video/*" id="v_f" hidden><b>動画を選ぶ・撮影する</b><span class="small muted">お店のGoogleドライブに保存されます（1GBまで）</span></label></div>
      <div class="field" id="v_ubox" hidden><label>動画のURL<em>必須</em></label><input id="v_u" inputmode="url" placeholder="https://youtu.be/… または https://drive.google.com/file/d/…"><p class="small muted">YouTubeは「限定公開」、Googleドライブは「リンクを知っている全員が閲覧可」にしてから貼ってください。</p></div>
      <div class="field"><label>タイトル<em>必須</em></label><input id="v_t" maxlength="80" placeholder="例）HBL施術の流れ（基本）"></div>
      <div class="two"><div class="field"><label>分類</label><input id="v_c" list="v_cl" maxlength="20" placeholder="例）施術"><datalist id="v_cl">${[...new Set(F.videos.map(v => v.category).concat(['施術', '接客', 'カウンセリング', '衛生管理', 'サロンボード']))].map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label>長さ（分）</label><input id="v_m" type="number" inputmode="numeric" min="0" max="600" placeholder="12"></div></div>
      <div class="field"><label>説明・見るポイント</label><textarea id="v_d" rows="4" maxlength="1000"></textarea></div>
      <div id="v_prog" hidden><div class="progress big"><i style="width:0%"></i></div><p class="small muted" id="v_pt"></p></div>
      <button class="btn" id="v_go">追加する</button><button class="btn ghost" data-close id="v_cancel">やめる</button>`);
    document.querySelectorAll('#sheet [data-vm]').forEach(b => b.onclick = () => { mode = b.dataset.vm; document.querySelectorAll('#sheet [data-vm]').forEach(x => x.classList.toggle('on', x === b)); $('#v_fbox').hidden = mode !== 'file'; $('#v_ubox').hidden = mode !== 'url'; });
    $('#v_f').onchange = e => {
      file = e.target.files[0]; if (!file) return;
      $('#v_pick').innerHTML = `<b>${esc(file.name)}</b><span class="small muted">${(file.size / 1048576).toFixed(1)}MB　タップして選び直す</span>`; $('#v_pick').appendChild(e.target);
      if (!$('#v_t').value) $('#v_t').value = file.name.replace(/\.[^.]+$/, '');
      const vd = document.createElement('video'); vd.preload = 'metadata'; vd.onloadedmetadata = () => { if (isFinite(vd.duration) && !$('#v_m').value) $('#v_m').value = Math.max(1, Math.round(vd.duration / 60)); URL.revokeObjectURL(vd.src); }; vd.src = URL.createObjectURL(file);
    };
    $('#v_go').onclick = async () => {
      let url = $('#v_u').value.trim(); const title = $('#v_t').value.trim();
      if (!title) return toast('タイトルを入力してください');
      if (mode === 'file') {
        if (!file) return toast('動画を選んでください');
        $('#v_go').disabled = true; $('#v_cancel').hidden = true;
        url = await uploadVideo(file, title).catch(e => { toast(e.message); return ''; });
        if (!url) { $('#v_go').disabled = false; $('#v_cancel').hidden = false; $('#v_go').textContent = 'もう一度送る'; return; }
      } else {
        if (!url) return toast('URLを入力してください');
        if (!embedOf(url)) return toast('YouTube か Googleドライブ の動画URLを貼ってください');
      }
      $('#v_go').disabled = true; $('#v_go').textContent = '追加中…';
      const r = await call('staff_video_add', { url, title, category: $('#v_c').value.trim() || 'その他', minutes: +$('#v_m').value || 0, description: $('#v_d').value }).catch(() => null);
      if (r && r.ok) { closeSheet(); toast(mode === 'file' ? '追加しました。再生できるまで数分かかることがあります' : '追加しました'); load(); } else { $('#v_go').disabled = false; $('#v_go').textContent = '追加する'; toast((r && r.message) || '追加できませんでした'); }
    };
  }
  // 動画を4MBずつに分けて送る（電波が途切れても、その部分だけ送り直す）
  async function uploadVideo(file, title) {
    const bar = document.querySelector('#v_prog i'), txt = $('#v_pt'); $('#v_prog').hidden = false;
    const show = (n, msg) => { bar.style.width = Math.round(n / file.size * 100) + '%'; txt.textContent = msg || `送信中… ${Math.round(n / file.size * 100)}%（${(n / 1048576).toFixed(1)} / ${(file.size / 1048576).toFixed(1)}MB）　この画面を閉じないでください`; };
    show(0, '準備しています…');
    const st = await call('staff_video_upload_start', { title, size: file.size, mime: file.type || 'video/mp4' }).catch(() => null);
    if (!st || !st.ok) throw new Error((st && st.message) || '送信を始められませんでした');
    const CH = st.chunk || 4194304;
    const b64 = blob => new Promise((ok, ng) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = () => ng(new Error('動画を読み込めませんでした')); fr.readAsDataURL(blob); });
    let off = 0;
    while (off < file.size) {
      const data = await b64(file.slice(off, Math.min(file.size, off + CH)));
      let r = null;
      for (let i = 0; i < 4 && !(r && r.ok); i++) { if (i) { show(off, `電波が不安定です。送り直しています（${i}回目）…`); await new Promise(z => setTimeout(z, 1500 * i)); } r = await call('staff_video_upload_chunk', { sid: st.sid, offset: off, data }, 180000).catch(() => null); if (r && !r.ok && !r.retry) break; }
      if (!r || !r.ok) throw new Error((r && r.message) || '送信できませんでした。電波の良い場所でもう一度お試しください');
      if (r.done) { show(file.size, '保存しました'); return r.url; }
      off = r.next || off + CH; show(off);
    }
    throw new Error('送信が完了しませんでした');
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
    try { const r = await getJSON({ api: 'app' }); if (r && r.ok) { SHOP = r; store.set('shop', SHOP); if (['slots', 'menu', 'info', 'today', 'home'].includes(route)) render(); } } catch (e) {}
  }

  /* ---------- 空き状況 ---------- */
  let sDate = '', sMenu = '';
  const slotCache = {};
  function vSlots() {
    if (!SHOP) { view.innerHTML = hdr('rsv') + '<div class="spin"></div>'; loadShop(); return; }
    const days = []; const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    for (let i = 0; i < Math.min(SHOP.maxDays || 60, 60); i++) { const d = new Date(t0); d.setDate(d.getDate() + i); days.push(d); }
    if (!sDate) { const nw = new Date(), late = nw.getHours() * 60 + nw.getMinutes() > toMin(SHOP.close || '19:00') - 60; sDate = ymd(days[late && days[1] ? 1 : 0]); }
    view.innerHTML = `${hdr('rsv')}
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

  /* ---------- 資料：メニュー（クーポン含む）・お店 ---------- */
  function vMenu() {
    if (!SHOP) { view.innerHTML = hdr('docs') + '<div class="spin"></div>'; loadShop(); return; }
    const cps = SHOP.coupons || [];
    view.innerHTML = `${hdr('docs')}
      ${(SHOP.menus || []).map(m => `<div class="card"><div class="row" style="align-items:flex-start"><b style="font-family:var(--mincho);font-size:14.5px;line-height:1.55">${esc(m.name)}</b><span class="price">${yen(m.price)}</span></div>
        <div class="small muted" style="margin-top:2px">約${m.min}分${m.cat ? '　' + esc(m.cat) : ''}</div>${m.desc ? `<div class="small" style="margin-top:8px">${esc(m.desc)}</div>` : ''}
        ${(() => { const ps = (F.menuPhotos || {})[m.name] || []; return ps.length || isMgr() ? `<div class="ph">${ps.map(p => `<button class="pt" data-mp="${esc(p.id)}" data-mn="${esc(m.name)}"><img alt="" data-mid="${esc(p.id)}">${p.label ? `<span>${esc(p.label)}</span>` : ''}</button>`).join('')}${isMgr() && ps.length < 12 ? `<label class="pt add">＋写真<input type="file" accept="image/*" data-mup="${esc(m.name)}" hidden></label>` : ''}</div>` : ''; })()}</div>`).join('') || '<div class="card empty">メニューが登録されていません</div>'}
      ${cps.length ? `<h2 class="sec">クーポン</h2>` + cps.map(c => `<div class="card coupon" style="cursor:default"><span class="chip ${/新規/.test(c.target || '') ? 'new' : ''}">${esc(c.target || '全員')}</span>
        <div class="t">${esc(c.title)}</div><div class="row"><span class="small muted">${esc(c.note || '')}${c.menu ? '<br>対象：' + esc(c.menu) : ''}</span><span class="price">${c.regular ? `<s>${yen(c.regular)}</s>` : ''}${yen(c.price)}</span></div></div>`).join('') : ''}
      <p class="small muted" style="margin-top:16px">メニュー・クーポンはスプレッドシートの「設定」シートで変更できます。${isMgr() ? 'メニューの写真は「＋写真」から追加できます（お客様が写っている写真は、掲載の同意をいただいたものだけにしてください）。' : ''}</p>`;
    loadMedia(view);
    view.querySelectorAll('[data-mp]').forEach(b => b.onclick = () => {
      const d = MC.get(b.dataset.mp); if (!d) return;
      const lb = bigPhoto(d, isMgr() ? '<div class="lbacts"><button class="btn danger sm" id="mp_del">この写真を外す</button></div>' : '');
      const del = lb.querySelector('#mp_del');
      if (del) del.onclick = async () => {
        if (del.dataset.c !== '1') { del.dataset.c = '1'; del.textContent = 'もう一度押すと外します'; return; }
        const name = b.dataset.mn, list = ((F.menuPhotos || {})[name] || []).filter(p => p.id !== b.dataset.mp);
        const r = await call('staff_menu_photos_set', { menu: name, photos: list }).catch(() => null);
        if (r && r.ok) { call('staff_media_delete', { id: b.dataset.mp }).catch(() => {}); F.menuPhotos[name] = list; lb.remove(); toast('写真を外しました'); vMenu(); } else toast('操作できませんでした');
      };
    });
    view.querySelectorAll('[data-mup]').forEach(inp => inp.onchange = async () => {
      const f = inp.files[0], name = inp.dataset.mup; if (!f) return;
      let label = '施術後';
      sheet(`<h1 class="ttl">メニューの写真</h1><p class="small muted" style="margin-top:-8px">${esc(name)}</p><div class="bigph"><div class="spin"></div></div>
        <div class="field"><label>写真の種類</label><div class="seg" style="margin:0">${['施術前', '施術後', 'ビフォーアフター', 'その他'].map(l => `<button data-pl="${l}" class="${l === label ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <label class="check"><input type="checkbox" id="mp_ok"> お客様が写っている場合、掲載の同意をいただいている</label>
        <button class="btn" id="mp_go" disabled>追加する</button><button class="btn ghost" data-close>やめる</button>`);
      document.querySelectorAll('#sheet [data-pl]').forEach(x => x.onclick = () => { label = x.dataset.pl; document.querySelectorAll('#sheet [data-pl]').forEach(y => y.classList.toggle('on', y === x)); });
      let data;
      try { data = await shrink(f); } catch (e) { closeSheet(); return toast(e.message); }
      const bx = document.querySelector('#sheet .bigph'); if (bx) bx.innerHTML = `<img src="${data}" alt="">`;
      const go = $('#mp_go'); go.disabled = false;
      go.onclick = async () => {
        if (!$('#mp_ok').checked) return toast('掲載の同意を確認して、チェックを入れてください');
        go.disabled = true; go.textContent = '保存中…';
        const r = await call('staff_media_upload', { data, purpose: 'menu', label: name }, 90000).catch(() => null);
        if (!r || !r.ok) { go.disabled = false; go.textContent = '追加する'; return toast((r && r.message) || '保存できませんでした'); }
        MC.set(r.id, data);
        const list = ((F.menuPhotos = F.menuPhotos || {})[name] || []).concat([{ id: r.id, label }]);
        const r2 = await call('staff_menu_photos_set', { menu: name, photos: list }).catch(() => null);
        if (r2 && r2.ok) { F.menuPhotos[name] = list; store.set('feed', F); closeSheet(); toast('写真を追加しました'); vMenu(); } else { go.disabled = false; toast('保存できませんでした'); }
      };
    });
  }
  function vInfo() {
    if (!SHOP) { view.innerHTML = hdr('docs') + '<div class="spin"></div>'; loadShop(); return; }
    const i = SHOP.info || {};
    const map = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(i.mapQuery || i.address || SHOP.shop);
    view.innerHTML = `${hdr('docs')}<div class="card"><dl class="kv"><dt>店名</dt><dd>${esc(SHOP.shop)}</dd><dt>住所</dt><dd>${esc(i.address || '')}</dd><dt>アクセス</dt><dd class="small">${esc(i.access || '')}</dd>
      <dt>営業時間</dt><dd>${esc(i.hours || (SHOP.open + '〜' + SHOP.close))}</dd>${i.seats ? `<dt>設備</dt><dd>${esc(i.seats)}</dd>` : ''}${i.tel ? `<dt>電話</dt><dd><a href="tel:${esc(i.tel)}">${esc(i.tel)}</a></dd>` : ''}</dl>
      <div class="links"><a class="btn ghost" href="${map}" target="_blank" rel="noopener">地図で見る</a><a class="btn ghost" href="https://salonboard.com/login/" target="_blank" rel="noopener">サロンボード</a></div></div>
      ${(i.features || []).length ? `<h2 class="sec">こだわり</h2><div class="tags">${i.features.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}`;
  }
  function vSettings() {
    view.innerHTML = `<h1 class="ttl">設定</h1>
      <div class="card"><dl class="kv"><dt>お名前</dt><dd>${esc(auth.name)}</dd><dt>権限</dt><dd>${isMgr() ? '店長（連絡・動画・マニュアルの編集、発注の処理、全員の日報の確認ができます）' : 'スタッフ'}</dd></dl></div>
      <button class="btn ghost" id="reload" style="margin-top:16px">最新の内容に更新する</button>
      <button class="btn danger" id="out">ログアウトする</button>
      <button class="btn ghost" data-go="home" style="margin-top:10px">ホームに戻る</button>
      <p class="small muted" style="margin-top:22px">お名前を変えたいときは、ログアウトしてから入り直してください。既読・受講・チェック・日報の記録はお名前ごとに残ります。</p>`;
    $('#reload').onclick = () => { toast('更新しています'); load(); loadShop(); };
    $('#out').onclick = logout;
  }

  /* ---------- 同期の状態（サロンボードと最後につながった時刻） ---------- */
  function syncInfo() {
    const at = [F.rsvSyncAt, F.blockSyncAt].filter(Boolean).sort().pop() || '';
    if (!at) return { ok: false, at: '', label: 'まだ同期されていません' };
    const ms = Date.now() - new Date(at.replace(' ', 'T') + '+09:00').getTime();
    const min = Math.round(ms / 60000);
    return { ok: min <= 30, at, min, label: min < 60 ? `${min}分前に同期` : min < 1440 ? `${Math.round(min / 60)}時間前に同期` : `${Math.round(min / 1440)}日前に同期` };
  }
  function syncBanner() {
    const s = syncInfo();
    if (s.ok) return '';
    return `<div class="warn"><b>サロンボードとの同期が止まっています</b><span>${esc(s.label)}。予約と空き状況が古い可能性があります。店舗のパソコンでサロンボードにログインしてください。</span></div>`;
  }

  /* ---------- ホーム ---------- */
  function vHome() {
    const t = F.today || '';
    const todays = (F.reservations || []).filter(r => r.date === t);
    const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
    const next = todays.find(r => toMin(r.end) > nowM);
    const un = F.notices.filter(n => !n.read);
    const pinned = F.notices.filter(n => n.pinned).slice(0, 1);
    const defs = F.checklist || {}, done = F.checks || [];
    const prog = l => { const all = (defs[l] || []).length, d = done.filter(c => c.list === l).length; return { all, d }; };
    const po = prog('開店'), pc = prog('閉店');
    const myRep = (F.reports || []).find(r => r.date === t && r.name === auth.name);
    const d = new Date();
    view.innerHTML = `<div class="hello"><span class="date">${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）</span><h1 class="ttl" style="margin:2px 0 0">${esc(auth.name)}さん、${d.getHours() < 11 ? 'おはようございます' : d.getHours() < 18 ? 'お疲れさまです' : '今日もお疲れさまでした'}</h1></div>
      ${punchCard()}
      ${(() => { const sh = (F.shifts || []).filter(x => x.date === t); return sh.length ? `<p class="small muted" style="margin:8px 2px 0">今日のシフト：${sh.map(x => `${esc(x.name)} ${esc(x.start)}〜${esc(x.end)}`).join('　')}</p>` : ''; })()}
      ${syncBanner()}
      ${un.length ? `<button class="card nt unread" data-go="notice"><div class="meta"><span style="color:var(--brass)">未読の連絡 ${un.length}件</span></div><b>${esc(un[0].title)}</b><div class="body">${esc(un[0].body)}</div></button>`
        : pinned.length ? `<button class="card nt" data-go="notice"><div class="meta"><span class="pin">固定</span></div><b>${esc(pinned[0].title)}</b></button>` : ''}
      <h2 class="sec">本日の予約</h2>
      <button class="card stat" data-sub="today"><div class="row"><span><span class="big">${todays.length}</span><span class="small muted"> 件</span></span>
        <span class="small" style="text-align:right">${next ? `次は <b>${esc(next.start)}</b>　${esc(next.staff)}<br><span class="muted">${esc(next.text).slice(0, 24)}</span>` : todays.length ? '本日の予約はすべて終了' : '本日の予約はありません'}</span></div></button>
      <h2 class="sec">今日の業務</h2>
      <div class="grid2">
        <button class="card stat" data-sub="check"><span class="small muted">開店チェック</span><span class="big">${po.d}<small> / ${po.all}</small></span><div class="progress"><i style="width:${po.all ? po.d / po.all * 100 : 0}%"></i></div></button>
        <button class="card stat" data-sub="check" data-list="閉店"><span class="small muted">閉店チェック</span><span class="big">${pc.d}<small> / ${pc.all}</small></span><div class="progress"><i style="width:${pc.all ? pc.d / pc.all * 100 : 0}%"></i></div></button>
      </div>
      <button class="card stat" data-sub="report" style="margin-top:10px"><div class="row"><span><span class="small muted">今日の日報</span><br><b style="font-family:var(--mincho)">${myRep ? '入力済み' : 'まだ入力していません'}</b></span><span class="small muted">${myRep ? `施術${myRep.treatments}件　${yen(myRep.sales)}` : '閉店後に1分で入力'}</span></div></button>
      ${isMgr() ? `<button class="card stat" data-sub="dash" style="margin-top:10px"><div class="row"><span><span class="small muted">店長のみ</span><br><b style="font-family:var(--mincho)">売上ダッシュボード</b></span><span class="small muted">月別の推移・リピート率</span></div></button>` : ''}
      <p class="small muted" style="margin-top:22px;text-align:right"><button class="linkbtn" data-go="settings">設定・ログアウト</button></p>`;
    view.querySelectorAll('[data-list]').forEach(b => b.addEventListener('click', () => { checkList = b.dataset.list; }, true));
    bindPunch();
  }

  /* ---------- 予約：本日の予約 ---------- */
  let rsvDay = 0;
  function vToday() {
    const t = F.today || '';
    const dates = [t, (() => { const d = new Date(t + 'T00:00:00'); d.setDate(d.getDate() + 1); return ymd(d); })()];
    const date = dates[rsvDay];
    const list = (F.reservations || []).filter(r => r.date === date);
    const staffs = [...new Set(list.map(r => r.staff))];
    const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
    const s = syncInfo();
    view.innerHTML = `${hdr('rsv')}
      <div class="seg" style="margin-top:-4px">${['今日', '明日'].map((l, i) => `<button data-rd="${i}" class="${i === rsvDay ? 'on' : ''}">${l}（${(F.reservations || []).filter(r => r.date === dates[i]).length}件）</button>`).join('')}</div>
      ${syncBanner()}
      ${list.length ? list.map(r => { const past = rsvDay === 0 && toMin(r.end) <= nowM, cur = rsvDay === 0 && toMin(r.start) <= nowM && nowM < toMin(r.end);
        return `<div class="card rv ${past ? 'past' : ''} ${cur ? 'now' : ''}"><div class="tm"><b>${esc(r.start)}</b><span>${esc(r.end)}</span></div>
          <div class="bd"><div class="meta">${staffs.length > 1 || r.staff ? `<span class="chip">${esc(r.staff)}</span>` : ''}${cur ? '<span class="nowtag">施術中</span>' : ''}</div><div class="tx">${esc(r.text)}</div></div></div>`; }).join('')
        : `<div class="card empty">${rsvDay === 0 ? '今日' : '明日'}の予約はありません</div>`}
      <p class="small muted" style="margin-top:14px">サロンボードの予約表から自動で読み込んでいます（${esc(s.label)}）。お客様の詳しい情報はサロンボードで確認してください。</p>`;
    view.querySelectorAll('[data-rd]').forEach(b => b.onclick = () => { rsvDay = +b.dataset.rd; vToday(); });
  }

  /* ---------- 業務：開店・閉店チェック ---------- */
  let checkList = new Date().getHours() >= 16 ? '閉店' : '開店';
  function vCheck() {
    const defs = F.checklist || {};
    const items = defs[checkList] || [];
    const done = (F.checks || []).filter(c => c.list === checkList);
    const by = it => done.find(c => c.item === it);
    view.innerHTML = `${hdr('work')}
      <div class="seg" style="margin-top:-4px">${['開店', '閉店'].map(l => { const n = (F.checks || []).filter(c => c.list === l).length; return `<button data-cl="${l}" class="${l === checkList ? 'on' : ''}">${l}（${n}/${(defs[l] || []).length}）</button>`; }).join('')}</div>
      <div class="card checks">${items.map((it, i) => { const c = by(it); return `<label class="ck ${c ? 'on' : ''}"><input type="checkbox" data-ci="${i}" ${c ? 'checked' : ''}><span class="box"></span><span class="lb">${esc(it)}${c ? `<small>${esc(c.name)}　${esc(String(c.at).slice(11, 16))}</small>` : ''}</span></label>`; }).join('') || '<div class="empty">項目がありません</div>'}</div>
      ${items.length && done.length === items.length ? `<p class="okline">${checkList}チェックがすべて完了しました</p>` : ''}
      ${isMgr() ? '<button class="btn ghost" id="editCk" style="margin-top:16px">チェック項目を編集する</button>' : ''}
      <p class="small muted" style="margin-top:14px">チェックした人と時刻が記録されます。毎日0時に新しい日のチェックに切り替わります。</p>`;
    view.querySelectorAll('[data-cl]').forEach(b => b.onclick = () => { checkList = b.dataset.cl; vCheck(); });
    view.querySelectorAll('[data-ci]').forEach(cb => cb.onchange = async () => {
      const item = items[+cb.dataset.ci], on = cb.checked;
      F.checks = (F.checks || []).filter(c => !(c.list === checkList && c.item === item));
      if (on) F.checks.push({ list: checkList, item, name: auth.name, at: (F.today || '') + ' ' + new Date().toTimeString().slice(0, 8) });
      vCheck();
      const r = await call('staff_check', { list: checkList, item, done: on }).catch(() => null);
      if (!r || !r.ok) { toast((r && r.message) || '記録できませんでした。もう一度お試しください'); load(true); }
    });
    const e = $('#editCk');
    if (e) e.onclick = () => {
      sheet(`<h1 class="ttl">チェック項目を編集</h1><p class="small muted" style="margin-top:-8px">1行に1項目ずつ入力してください。</p>
        <div class="field"><label>開店</label><textarea id="ck_o" rows="8">${esc((defs['開店'] || []).join('\n'))}</textarea></div>
        <div class="field"><label>閉店</label><textarea id="ck_c" rows="8">${esc((defs['閉店'] || []).join('\n'))}</textarea></div>
        <button class="btn" id="ck_go">保存する</button><button class="btn ghost" data-close>やめる</button>`);
      $('#ck_go').onclick = async () => {
        const sp = v => v.split('\n').map(x => x.trim()).filter(Boolean);
        $('#ck_go').disabled = true;
        const r = await call('staff_check_items_set', { open: sp($('#ck_o').value), close: sp($('#ck_c').value) }).catch(() => null);
        if (r && r.ok) { closeSheet(); toast('保存しました'); load(); } else { $('#ck_go').disabled = false; toast((r && r.message) || '保存できませんでした'); }
      };
    };
  }

  /* ---------- 業務：日報 ---------- */
  let repMonth = '';
  function vReport() {
    const t = F.today || ymd(new Date());
    const mine = (F.reports || []).filter(r => r.name === auth.name);
    const cur = mine.find(r => r.date === t) || {};
    let mgrHtml = '';
    if (isMgr()) {
      const months = [...new Set((F.reports || []).map(r => r.date.slice(0, 7)))].sort().reverse();
      if (!repMonth) repMonth = months[0] || t.slice(0, 7);
      const rows = (F.reports || []).filter(r => r.date.slice(0, 7) === repMonth);
      const by = {};
      rows.forEach(r => { const o = by[r.name] = by[r.name] || { days: 0, treatments: 0, sales: 0, nominations: 0, retail: 0 }; o.days++; ['treatments', 'sales', 'nominations', 'retail'].forEach(k => o[k] += r[k]); });
      const tot = Object.values(by).reduce((a, o) => { ['treatments', 'sales', 'nominations', 'retail'].forEach(k => a[k] += o[k]); return a; }, { treatments: 0, sales: 0, nominations: 0, retail: 0 });
      mgrHtml = `<h2 class="sec">月の集計（店長のみ）</h2>
        ${months.length > 1 ? `<div class="cats">${months.map(m => `<button data-rm="${m}" class="${m === repMonth ? 'on' : ''}">${+m.slice(5)}月</button>`).join('')}</div>` : ''}
        <div class="card"><div class="kpis"><div><span>売上</span><b>${yen(tot.sales + tot.retail)}</b><small>施術 ${yen(tot.sales)}／物販 ${yen(tot.retail)}</small></div><div><span>施術数</span><b>${tot.treatments}<small> 件</small></b><small>指名 ${tot.nominations}件</small></div></div></div>
        ${Object.keys(by).length ? `<div class="card"><table class="tbl"><thead><tr><th>名前</th><th>出勤</th><th>施術</th><th>指名</th><th>売上</th></tr></thead><tbody>${Object.entries(by).sort((a, b) => b[1].sales - a[1].sales).map(([n, o]) => `<tr><td>${esc(n)}</td><td>${o.days}日</td><td>${o.treatments}</td><td>${o.nominations}</td><td>${yen(o.sales + o.retail)}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${rows.length ? `<h2 class="sec">${+repMonth.slice(5)}月の日報</h2>` + rows.map(r => `<div class="card rp"><div class="row"><b>${+r.date.slice(5, 7)}/${+r.date.slice(8)}　${esc(r.name)}</b><span class="price">${yen(r.sales + r.retail)}</span></div><div class="small muted">施術${r.treatments}件・指名${r.nominations}件${r.retail ? '・物販' + yen(r.retail) : ''}</div>${r.memo ? `<div class="small" style="margin-top:6px;white-space:pre-wrap">${esc(r.memo)}</div>` : ''}</div>`).join('') : ''}`;
    }
    view.innerHTML = `${hdr('work')}
      <div class="card"><div class="row" style="margin-bottom:12px"><b style="font-family:var(--mincho)">今日の日報</b><span class="small muted">${+t.slice(5, 7)}/${+t.slice(8)}${cur.id ? '　入力済み（上書きできます）' : ''}</span></div>
        <div class="two"><div class="field"><label>施術した人数</label><input id="r_t" type="number" inputmode="numeric" min="0" max="99" value="${cur.treatments ?? ''}" placeholder="0"></div>
          <div class="field"><label>うち指名</label><input id="r_n" type="number" inputmode="numeric" min="0" max="99" value="${cur.nominations ?? ''}" placeholder="0"></div></div>
        <div class="two"><div class="field"><label>施術の売上（円）</label><input id="r_s" type="number" inputmode="numeric" min="0" value="${cur.sales ?? ''}" placeholder="0"></div>
          <div class="field"><label>物販の売上（円）</label><input id="r_r" type="number" inputmode="numeric" min="0" value="${cur.retail ?? ''}" placeholder="0"></div></div>
        <div class="field"><label>気づき・申し送り</label><textarea id="r_m" rows="3" maxlength="1000" placeholder="お客様の反応、困ったこと、明日への申し送りなど">${esc(cur.memo || '')}</textarea></div>
        <button class="btn" id="r_go">${cur.id ? '日報を更新する' : '日報を送る'}</button></div>
      ${!isMgr() && mine.length ? `<h2 class="sec">これまでの日報</h2>` + mine.slice(0, 31).map(r => `<div class="card rp"><div class="row"><b>${+r.date.slice(5, 7)}/${+r.date.slice(8)}</b><span class="price">${yen(r.sales + r.retail)}</span></div><div class="small muted">施術${r.treatments}件・指名${r.nominations}件</div></div>`).join('') : ''}
      ${mgrHtml}`;
    $('#r_go').onclick = async () => {
      const v = id => $(id).value;
      $('#r_go').disabled = true; $('#r_go').textContent = '送信中…';
      const r = await call('staff_report_save', { date: t, treatments: v('#r_t'), nominations: v('#r_n'), sales: v('#r_s'), retail: v('#r_r'), memo: v('#r_m') }).catch(() => null);
      if (r && r.ok) { toast(r.updated ? '日報を更新しました' : '日報を送りました'); load(); } else { $('#r_go').disabled = false; $('#r_go').textContent = '日報を送る'; toast((r && r.message) || '送れませんでした'); }
    };
    view.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { repMonth = b.dataset.rm; vReport(); });
  }

  /* ---------- 写真（マニュアル・メニュー）：サーバーから取得して画面を開いている間だけ保持 ---------- */
  const MC = new Map();
  const MARK = /^\[\[写真:([\w-]+)\|?([^\]]*)\]\]$/;
  const plainBody = b => String(b || '').split('\n').filter(l => !MARK.test(l.trim())).join('\n').replace(/^📷.*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  function richBody(body) {
    let html = '', buf = [];
    const flush = () => { if (buf.length) { html += `<div class="prose">${esc(buf.join('\n'))}</div>`; buf = []; } };
    String(body || '').split('\n').forEach(l => {
      const t = l.trim(), m = t.match(MARK);
      if (m) { flush(); html += `<figure class="mfig"><button class="mimg" data-big="${esc(m[1])}"><img alt="" data-mid="${esc(m[1])}"></button>${m[2] ? `<figcaption>${esc(m[2])}</figcaption>` : ''}</figure>`; }
      else if (/^📷/.test(t)) { flush(); html += `<div class="mph">${esc(t.replace(/^📷\s*/, ''))}<small>撮影して差し替える写真</small></div>`; }
      else buf.push(l);
    });
    flush();
    return html;
  }
  async function loadMedia(root) {
    if (!root) return;
    const imgs = [...root.querySelectorAll('img[data-mid]')];
    const need = [...new Set(imgs.map(i => i.dataset.mid).filter(id => !MC.has(id)))];
    for (let i = 0; i < need.length; i += 6) {
      const r = await call('staff_media_get', { ids: need.slice(i, i + 6) }).catch(() => null);
      if (r && r.ok) Object.entries(r.data || {}).forEach(([k, v]) => MC.set(k, v));
    }
    imgs.forEach(img => { const d = MC.get(img.dataset.mid); if (d) { img.src = d; img.closest('.mimg,.pt') && img.closest('.mimg,.pt').classList.add('ok'); } else img.closest('.mimg,.pt') && img.closest('.mimg,.pt').classList.add('ng'); });
    root.querySelectorAll('[data-big]').forEach(b => b.onclick = () => { const d = MC.get(b.dataset.big); if (d) bigPhoto(d); });
  }
  function bigPhoto(d, extra) {
    const box = document.createElement('div'); box.className = 'lightbox'; box.innerHTML = `<img src="${d}" alt=""><button aria-label="閉じる">×</button>${extra || ''}`;
    document.body.appendChild(box); box.onclick = e => { if (e.target === box || e.target.matches('button[aria-label]')) box.remove(); };
    return box;
  }

  /* ---------- 資料：マニュアル ---------- */
  let manQ = '', manCat = 'すべて';
  function vManual() {
    const ms = F.manuals || [];
    const cats = ['すべて'].concat([...new Set(ms.map(m => m.category || 'その他'))]);
    const q = manQ.trim();
    const list = ms.filter(m => (manCat === 'すべて' || (m.category || 'その他') === manCat) && (!q || (m.title + ' ' + m.body).includes(q)));
    view.innerHTML = `${hdr('docs')}
      <div class="field" style="margin-bottom:12px"><input id="m_q" type="search" placeholder="キーワードで探す（例：放置時間）" value="${esc(manQ)}"></div>
      ${cats.length > 2 ? `<div class="cats">${cats.map(c => `<button data-mc="${esc(c)}" class="${c === manCat ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
      <div id="m_list">${list.map(m => `<button class="card nt" data-m="${esc(m.id)}"><div class="meta"><span>${esc(m.category || 'その他')}</span><span>更新 ${esc(fmtDate(m.updated_at))}</span></div><b>${esc(m.title)}</b><div class="body">${esc(plainBody(m.body))}</div>${/\[\[写真:/.test(m.body) ? '<span class="hasph">写真あり</span>' : ''}</button>`).join('') || '<div class="card empty">該当するマニュアルはありません</div>'}</div>
      ${isMgr() ? '<button class="fab" id="newM">マニュアルを書く</button>' : ''}`;
    const qi = $('#m_q'); qi.oninput = () => { manQ = qi.value; const pos = qi.selectionStart; vManual(); const n = $('#m_q'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} };
    view.querySelectorAll('[data-mc]').forEach(b => b.onclick = () => { manCat = b.dataset.mc; vManual(); });
    view.querySelectorAll('[data-m]').forEach(b => b.onclick = () => openManual(ms.find(x => x.id === b.dataset.m)));
    const nm = $('#newM'); if (nm) nm.onclick = () => editManual(null);
  }
  function openManual(m) {
    if (!m) return;
    sheet(`<span class="meta small muted">${esc(m.category || 'その他')}　更新 ${esc(fmtDate(m.updated_at))}　${esc(m.author || '')}</span>
      <h1 class="ttl" style="margin-top:6px">${esc(m.title)}</h1>${richBody(m.body)}
      ${isMgr() ? '<button class="btn ghost" id="mEd" style="margin-top:20px">編集する</button><button class="btn danger" id="mDel">削除する</button>' : ''}
      <button class="btn ghost" data-close style="margin-top:10px">閉じる</button>`);
    loadMedia($('#sheetBody'));
    const ed = $('#mEd'); if (ed) ed.onclick = () => editManual(m);
    const d = $('#mDel');
    if (d) d.onclick = async () => {
      if (d.dataset.c !== '1') { d.dataset.c = '1'; d.textContent = 'もう一度押すと削除します'; return; }
      d.disabled = true; const r = await call('staff_manual_delete', { id: m.id }).catch(() => null);
      if (r && r.ok) { closeSheet(); toast('削除しました'); load(); } else { d.disabled = false; toast('削除できませんでした'); }
    };
  }
  function editManual(m) {
    const cats = [...new Set((F.manuals || []).map(x => x.category).concat(['薬剤', '施術', '接客', '予約', '衛生管理', 'その他']))];
    sheet(`<h1 class="ttl">${m ? 'マニュアルを編集' : 'マニュアルを書く'}</h1>
      <div class="field"><label>分類</label><input id="e_c" list="e_cl" maxlength="20" value="${esc(m ? m.category : '')}" placeholder="例）施術"><datalist id="e_cl">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="field"><label>タイトル<em>必須</em></label><input id="e_t" maxlength="80" value="${esc(m ? m.title : '')}"></div>
      <div class="field"><label>本文</label><textarea id="e_b" rows="12" maxlength="8000">${esc(m ? m.body : '')}</textarea></div>
      <div class="edtools"><label class="btn ghost sm">写真を入れる<input type="file" accept="image/*" multiple id="e_ph" hidden></label><button class="btn ghost sm" id="e_pv">プレビュー</button></div>
      <p class="small muted">写真は、本文で文字を入れている位置（カーソルの場所）に入ります。「📷」で始まる行は、撮影予定の写真の目印として点線の枠で表示されます。</p>
      <div id="e_prev" hidden></div>
      <button class="btn" id="e_go">保存する</button><button class="btn ghost" data-close>やめる</button>`);
    const ta = $('#e_b');
    $('#e_ph').onchange = async e => {
      const files = [...e.target.files]; e.target.value = '';
      for (const f of files) {
        toast('写真を保存しています…');
        try {
          const data = await shrink(f);
          const r = await call('staff_media_upload', { data, purpose: 'manual' }, 90000).catch(() => null);
          if (!r || !r.ok) { toast((r && r.message) || '写真を保存できませんでした'); continue; }
          MC.set(r.id, data);
          const pos = ta.selectionEnd || ta.value.length, before = ta.value.slice(0, pos), after = ta.value.slice(pos);
          const ins = (before && !before.endsWith('\n') ? '\n' : '') + `[[写真:${r.id}|]]` + '\n';
          ta.value = before + ins + after; ta.selectionStart = ta.selectionEnd = pos + ins.length;
          toast('写真を入れました');
        } catch (err) { toast(err.message); }
      }
    };
    $('#e_pv').onclick = () => { const pv = $('#e_prev'); pv.hidden = !pv.hidden; if (!pv.hidden) { pv.innerHTML = `<div class="card">${richBody(ta.value)}</div>`; loadMedia(pv); } $('#e_pv').textContent = pv.hidden ? 'プレビュー' : 'プレビューを閉じる'; };
    $('#e_go').onclick = async () => {
      const title = $('#e_t').value.trim(); if (!title) return toast('タイトルを入力してください');
      $('#e_go').disabled = true;
      const r = await call('staff_manual_save', { id: m ? m.id : '', category: $('#e_c').value.trim() || 'その他', title, body: $('#e_b').value }).catch(() => null);
      if (r && r.ok) { closeSheet(); toast('保存しました'); load(); } else { $('#e_go').disabled = false; toast((r && r.message) || '保存できませんでした'); }
    };
  }

  /* ========== v4：勤怠・シフト・在庫・確認テスト・技術チェック ========== */
  function innerSeg(items) { return `<div class="seg inner">${items.map(([k, l]) => `<button data-sub="${k}" class="${k === route ? 'on' : ''}">${l}</button>`).join('')}</div>`; }
  const mins = (a, b) => (a && b) ? Math.max(0, toMin(b) - toMin(a)) : 0;
  const hm = m => `${Math.floor(m / 60)}時間${m % 60 ? (m % 60) + '分' : ''}`;
  const workMin = r => Math.max(0, mins(r.in, r.out) - (r.break_min || 0));
  const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const wdOf = d => WD[new Date(d + 'T00:00:00').getDay()];
  const monthAdd = (ym, n) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); };

  /* ---------- 勤怠 ---------- */
  function myToday() { return (F.times || []).find(r => r.date === F.today && r.name === auth.name) || null; }
  function punchCard() {
    const r = myToday();
    const state = !r || !r.in ? 'none' : !r.out ? 'in' : 'out';
    const shift = (F.shifts || []).find(x => x.date === F.today && x.name === auth.name);
    return `<div class="card punch ${state}">
      <div class="row"><span><span class="small muted">${shift ? `今日のシフト ${esc(shift.start)}〜${esc(shift.end)}` : '今日のシフトは未登録'}</span><br>
        <b class="pst">${state === 'none' ? 'まだ出勤していません' : state === 'in' ? `${esc(r.in)} から勤務中` : `${esc(r.in)}〜${esc(r.out)}　${hm(workMin(r))}`}</b></span>
      ${state === 'none' ? '<button class="btn pbtn" data-punch="in">出勤する</button>' : state === 'in' ? '<button class="btn pbtn" data-punch="out">退勤する</button>' : '<span class="chip">退勤済み</span>'}</div></div>`;
  }
  function bindPunch() {
    view.querySelectorAll('[data-punch]').forEach(b => b.onclick = () => {
      const kind = b.dataset.punch;
      if (kind === 'in') return doPunch('in');
      sheet(`<h1 class="ttl">退勤する</h1><div class="field"><label>休憩した時間（分）</label><input id="p_br" type="number" inputmode="numeric" min="0" max="600" value="60"></div>
        <p class="small muted">退勤の時刻は今の時刻で記録されます。あとから「勤怠」で直せます。</p>
        <button class="btn" id="p_go">退勤を記録する</button><button class="btn ghost" data-close>やめる</button>`);
      $('#p_go').onclick = () => { closeSheet(); doPunch('out', +$('#p_br').value || 0); };
    });
  }
  async function doPunch(kind, br) {
    const r = await call('staff_time_punch', { kind, break_min: br }).catch(() => null);
    if (r && r.ok) { toast(kind === 'in' ? `出勤を記録しました（${r.time}）` : `退勤を記録しました（${r.time}）`); load(); }
    else toast((r && r.message) || '記録できませんでした。電波の良い場所でもう一度押してください');
  }
  let timeMonth = '';
  function vTime() {
    const t = F.today || ymd(new Date());
    if (!timeMonth) timeMonth = t.slice(0, 7);
    const months = [...new Set([t.slice(0, 7), monthAdd(t.slice(0, 7), -1)])];
    const rows = (F.times || []).filter(r => r.date.slice(0, 7) === timeMonth && (isMgr() || r.name === auth.name));
    const by = {};
    rows.forEach(r => { const o = by[r.name] = by[r.name] || { days: 0, min: 0 }; if (r.in) o.days++; o.min += workMin(r); });
    view.innerHTML = `${hdr('work')}${punchCard()}
      <div class="cats" style="margin-top:16px">${months.map(m => `<button data-tm="${m}" class="${m === timeMonth ? 'on' : ''}">${+m.slice(5)}月</button>`).join('')}</div>
      <div class="card"><table class="tbl"><thead><tr><th>名前</th><th>出勤日数</th><th>勤務時間</th></tr></thead><tbody>
        ${Object.entries(by).map(([n, o]) => `<tr><td>${esc(n)}</td><td>${o.days}日</td><td>${hm(o.min)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">記録はまだありません</td></tr>'}</tbody></table>
        ${isMgr() && rows.length ? '<button class="btn ghost" id="csv" style="margin-top:14px">この月の勤怠をCSVで保存（給与計算用）</button>' : ''}</div>
      <h2 class="sec">記録の一覧</h2>
      ${rows.slice().sort((a, b) => (b.date + b.name).localeCompare(a.date + a.name)).map(r => `<button class="card tr" data-tr="${esc(r.date)}|${esc(r.name)}"><div class="row"><b>${md(r.date)}（${wdOf(r.date)}）${isMgr() ? '　' + esc(r.name) : ''}</b><span class="price">${hm(workMin(r))}</span></div>
        <div class="small muted">${esc(r.in || '--:--')}〜${esc(r.out || '--:--')}　休憩${r.break_min || 0}分${r.note ? '　' + esc(r.note) : ''}</div></button>`).join('') || '<div class="card empty">この月の記録はありません</div>'}
      <button class="btn ghost" id="addT" style="margin-top:12px">打刻を忘れた日を入力する</button>`;
    bindPunch();
    view.querySelectorAll('[data-tm]').forEach(b => b.onclick = () => { timeMonth = b.dataset.tm; vTime(); });
    view.querySelectorAll('[data-tr]').forEach(b => b.onclick = () => { const [d, n] = b.dataset.tr.split('|'); editTime((F.times || []).find(r => r.date === d && r.name === n)); });
    $('#addT').onclick = () => editTime(null);
    const c = $('#csv'); if (c) c.onclick = () => {
      const lines = [['日付', '名前', '出勤', '退勤', '休憩(分)', '勤務(分)', 'メモ']].concat(rows.slice().sort((a, b) => (a.name + a.date).localeCompare(b.name + b.date)).map(r => [r.date, r.name, r.in, r.out, r.break_min, workMin(r), r.note || '']));
      const csv = '﻿' + lines.map(l => l.map(x => `"${String(x == null ? '' : x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `勤怠_${timeMonth}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 500);
    };
  }
  function editTime(r) {
    const t = F.today;
    const names = isMgr() ? (F.staffList || []) : [auth.name];
    sheet(`<h1 class="ttl">${r ? '勤怠を直す' : '勤怠を入力する'}</h1>
      ${isMgr() ? `<div class="field"><label>スタッフ</label><select id="t_n">${names.concat(r && !names.includes(r.name) ? [r.name] : []).map(n => `<option ${r && r.name === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>日付</label><input id="t_d" type="date" max="${t}" value="${r ? r.date : t}"></div>
      <div class="two"><div class="field"><label>出勤</label><input id="t_i" type="time" value="${r ? esc(r.in) : ''}"></div><div class="field"><label>退勤</label><input id="t_o" type="time" value="${r ? esc(r.out) : ''}"></div></div>
      <div class="field"><label>休憩（分）</label><input id="t_b" type="number" inputmode="numeric" min="0" max="600" value="${r ? r.break_min : 60}"></div>
      <div class="field"><label>メモ（直した理由など）</label><input id="t_m" maxlength="200" value="${r ? esc(r.note || '') : ''}" placeholder="例）打刻を忘れたため"></div>
      <p class="small muted">直した人と時刻は記録に残ります。</p>
      <button class="btn" id="t_go">保存する</button>${r && isMgr() ? '<button class="btn danger" id="t_del">この記録を消す</button>' : ''}<button class="btn ghost" data-close>やめる</button>`);
    const send = async extra => {
      const body = Object.assign({ date: $('#t_d').value, in: $('#t_i').value, out: $('#t_o').value, break_min: +$('#t_b').value || 0, note: $('#t_m').value }, isMgr() ? { target: $('#t_n').value } : {}, extra || {});
      const res = await call('staff_time_edit', body).catch(() => null);
      if (res && res.ok) { closeSheet(); toast(res.removed ? '消しました' : '保存しました'); load(); } else toast((res && res.message) || '保存できませんでした');
    };
    $('#t_go').onclick = () => send();
    const d = $('#t_del'); if (d) d.onclick = () => { if (d.dataset.c !== '1') { d.dataset.c = '1'; d.textContent = 'もう一度押すと消します'; return; } send({ remove: true }); };
  }

  /* ---------- シフト ---------- */
  let shiftMonth = '', reqMode = false, reqSel = null;
  function vShift() {
    const t = F.today || ymd(new Date());
    const m0 = t.slice(0, 7), m1 = monthAdd(m0, 1);
    if (!shiftMonth) shiftMonth = m0;
    const first = new Date(+shiftMonth.slice(0, 4), +shiftMonth.slice(5, 7) - 1, 1);
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const myReq = (F.shiftReqs || []).find(r => r.month === shiftMonth && r.name === auth.name);
    if (reqMode && !reqSel) reqSel = new Set(myReq ? myReq.dates : []);
    const reqsOn = d => (F.shiftReqs || []).filter(r => r.month === shiftMonth && r.dates.includes(d)).map(r => r.name);
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push('<div class="cd empty"></div>');
    for (let i = 1; i <= days; i++) {
      const d = shiftMonth + '-' + ('0' + i).slice(-2), wd = new Date(d + 'T00:00:00').getDay();
      const sh = (F.shifts || []).filter(x => x.date === d);
      const off = reqMode ? reqSel.has(d) : (myReq && myReq.dates.includes(d));
      const others = isMgr() ? reqsOn(d) : [];
      cells.push(`<button class="cd ${d === t ? 'today' : ''} ${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''} ${off ? 'off' : ''} ${sh.some(x => x.name === auth.name) ? 'mine' : ''}" data-cd="${d}">
        <span class="n">${i}</span>${sh.map(x => `<span class="who ${x.name === auth.name ? 'me' : ''}">${esc(x.name.slice(0, 2))}</span>`).join('')}${others.length ? `<span class="rq">休${others.length}</span>` : ''}</button>`);
    }
    const mine = (F.shifts || []).filter(x => x.name === auth.name && x.date.slice(0, 7) === shiftMonth).sort((a, b) => a.date.localeCompare(b.date));
    view.innerHTML = `${hdr('work')}
      <div class="cats">${[m0, m1].map(m => `<button data-sm="${m}" class="${m === shiftMonth ? 'on' : ''}">${+m.slice(5)}月</button>`).join('')}</div>
      ${reqMode ? `<div class="warn" style="color:var(--ink);background:var(--brass-soft);border-color:var(--brass)"><b>休み希望を選んでいます</b><span>休みたい日を押して選び、下の「希望を出す」を押してください。</span></div>` : ''}
      <div class="cal"><div class="wk">${WD.map(w => `<span>${w}</span>`).join('')}</div><div class="grid">${cells.join('')}</div></div>
      <p class="small muted" style="margin:8px 0 0">名前＝確定したシフト　<span class="lg off"></span>＝あなたの休み希望${isMgr() ? '　「休n」＝休み希望を出した人数' : ''}</p>
      ${reqMode ? `<div class="field" style="margin-top:14px"><label>店長へのメモ</label><input id="rq_n" maxlength="300" value="${esc(myReq ? myReq.note || '' : '')}" placeholder="例）午前だけなら出勤できます"></div>
          <button class="btn" id="rq_go">休み希望を出す（${reqSel.size}日）</button><button class="btn ghost" id="rq_x">やめる</button>`
        : `<button class="btn ghost" id="rq" style="margin-top:14px">${+shiftMonth.slice(5)}月の休み希望を${myReq ? '直す' : '出す'}</button>`}
      ${mine.length ? `<h2 class="sec">あなたの${+shiftMonth.slice(5)}月のシフト</h2><div class="card">${mine.map(x => `<div class="row sl"><span>${md(x.date)}（${wdOf(x.date)}）</span><b>${esc(x.start)}〜${esc(x.end)}</b></div>`).join('')}</div>` : ''}
      ${isMgr() ? `<h2 class="sec">店長メニュー</h2><p class="small muted">日付を押すと、その日のシフトを決められます。</p>
        ${(F.shiftReqs || []).filter(r => r.month === shiftMonth).map(r => `<div class="card small"><b>${esc(r.name)}</b>　休み希望 ${r.dates.length}日：${r.dates.map(md).join('、') || 'なし'}${r.note ? `<div class="muted" style="margin-top:4px">${esc(r.note)}</div>` : ''}</div>`).join('') || '<div class="card empty">まだ休み希望は出ていません</div>'}
        <button class="btn ghost" id="stf" style="margin-top:12px">スタッフの名前を編集する</button>` : ''}`;
    view.querySelectorAll('[data-sm]').forEach(b => b.onclick = () => { shiftMonth = b.dataset.sm; reqMode = false; reqSel = null; vShift(); });
    view.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => {
      const d = b.dataset.cd;
      if (reqMode) { if (d < t) return toast('過ぎた日は選べません'); reqSel.has(d) ? reqSel.delete(d) : reqSel.add(d); vShift(); return; }
      if (isMgr()) editShiftDay(d, reqsOn(d));
      else { const sh = (F.shifts || []).filter(x => x.date === d); toast(sh.length ? sh.map(x => `${x.name} ${x.start}〜${x.end}`).join(' / ') : 'この日のシフトはまだありません'); }
    });
    const rq = $('#rq'); if (rq) rq.onclick = () => { if (shiftMonth < t.slice(0, 7)) return; reqMode = true; reqSel = null; vShift(); };
    const rx = $('#rq_x'); if (rx) rx.onclick = () => { reqMode = false; reqSel = null; vShift(); };
    const rg = $('#rq_go'); if (rg) rg.onclick = async () => {
      rg.disabled = true;
      const r = await call('staff_shift_req_save', { month: shiftMonth, dates: [...reqSel].sort(), note: $('#rq_n').value }).catch(() => null);
      if (r && r.ok) { reqMode = false; reqSel = null; toast(`休み希望を出しました（${r.count}日）`); load(); } else { rg.disabled = false; toast((r && r.message) || '送れませんでした'); }
    };
    const sf = $('#stf'); if (sf) sf.onclick = () => {
      sheet(`<h1 class="ttl">スタッフの名前</h1><p class="small muted" style="margin-top:-8px">1行に1人ずつ。シフトと勤怠の一覧に使います。</p>
        <div class="field"><textarea id="sf_n" rows="6">${esc((F.staffList || []).join('\n'))}</textarea></div><button class="btn" id="sf_go">保存する</button><button class="btn ghost" data-close>やめる</button>`);
      $('#sf_go').onclick = async () => { const r = await call('staff_list_set', { names: $('#sf_n').value.split('\n').map(x => x.trim()).filter(Boolean) }).catch(() => null); if (r && r.ok) { closeSheet(); toast('保存しました'); load(); } else toast((r && r.message) || '保存できませんでした'); };
    };
  }
  function editShiftDay(d, offs) {
    const cur = (F.shifts || []).filter(x => x.date === d);
    const names = [...new Set((F.staffList || []).concat(cur.map(x => x.name)))];
    const op = (SHOP && SHOP.open) || '10:00', cl = (SHOP && SHOP.close) || '19:00';
    sheet(`<h1 class="ttl">${md(d)}（${wdOf(d)}）のシフト</h1>
      ${offs.length ? `<p class="small" style="color:var(--ng);margin-top:-8px">休み希望：${offs.map(esc).join('、')}</p>` : ''}
      ${names.map((n, i) => { const c = cur.find(x => x.name === n); return `<div class="shrow"><label class="ck ${c ? 'on' : ''}" style="border:0;padding:6px 0"><input type="checkbox" data-sn="${i}" ${c ? 'checked' : ''}><span class="box"></span><span class="lb">${esc(n)}${offs.includes(n) ? ' <small style="color:var(--ng)">休み希望</small>' : ''}</span></label>
        <input type="time" data-ss="${i}" value="${c ? esc(c.start) : op}"><span class="muted">〜</span><input type="time" data-se="${i}" value="${c ? esc(c.end) : cl}"></div>`; }).join('')}
      <button class="btn" id="sh_go" style="margin-top:16px">この日のシフトを確定する</button><button class="btn ghost" data-close>やめる</button>`);
    document.querySelectorAll('#sheet [data-sn]').forEach(cb => cb.onchange = () => cb.closest('.ck').classList.toggle('on', cb.checked));
    $('#sh_go').onclick = async () => {
      const entries = names.map((n, i) => ({ n, i })).filter(x => document.querySelector(`#sheet [data-sn="${x.i}"]`).checked)
        .map(x => ({ name: x.n, start: document.querySelector(`#sheet [data-ss="${x.i}"]`).value, end: document.querySelector(`#sheet [data-se="${x.i}"]`).value }));
      $('#sh_go').disabled = true;
      const r = await call('staff_shift_save', { date: d, entries }).catch(() => null);
      if (r && r.ok) { closeSheet(); toast('シフトを確定しました'); load(); } else { $('#sh_go').disabled = false; toast((r && r.message) || '保存できませんでした'); }
    };
  }

  /* ---------- 備品：在庫 ---------- */
  const stockTimers = {};
  function vStock() {
    const items = F.stock || [];
    const low = it => it.threshold > 0 && it.qty !== '' && it.qty <= it.threshold;
    const lows = items.filter(low).length;
    view.innerHTML = `${hdr('work')}${innerSeg([['stock', '在庫'], ['order', '発注依頼']])}
      ${lows ? `<div class="warn"><b>残りが少ない品目が${lows}件あります</b><span>決めた数を下回ると、発注依頼が自動で作られ、店長にメールが届きます。</span></div>` : ''}
      <div class="card stocks">${items.map((it, i) => `<div class="st ${low(it) ? 'low' : ''}">
        <button class="nm" data-se="${i}"><b>${esc(it.item)}</b><small>${it.threshold > 0 ? `${it.threshold}${esc(it.unit)}以下で自動発注` : '自動発注なし'}${it.updated_by ? '　' + esc(it.updated_by) + ' ' + esc(fmtDate(it.updated_at)) : ''}</small></button>
        <div class="stepper sm"><button data-sd="${i}" aria-label="減らす">−</button><input data-sq="${i}" type="number" inputmode="numeric" min="0" value="${it.qty === '' ? '' : it.qty}" placeholder="—"><button data-su="${i}" aria-label="増やす">＋</button></div>
        <span class="u">${esc(it.unit)}</span></div>`).join('') || '<div class="empty">品目がありません</div>'}</div>
      <p class="small muted" style="margin-top:12px">使ったら −、補充したら ＋ を押してください。数はすぐに保存されます。</p>
      ${isMgr() ? '<button class="fab" id="newS">品目を追加</button>' : ''}`;
    const push = i => {
      const it = items[i]; clearTimeout(stockTimers[it.item]);
      stockTimers[it.item] = setTimeout(async () => {
        const r = await call('staff_stock_update', { item: it.item, qty: it.qty }).catch(() => null);
        if (!r || !r.ok) { toast((r && r.message) || '在庫を保存できませんでした'); return; }
        if (r.autoOrder) { toast(`「${it.item}」の発注依頼を自動で作りました`); load(true); }
      }, 700);
    };
    const setQ = (i, q) => { const it = items[i]; it.qty = Math.max(0, q); it.updated_by = auth.name; store.set('feed', F); const inp = view.querySelector(`[data-sq="${i}"]`); if (inp) inp.value = it.qty; view.querySelectorAll('.st')[i].classList.toggle('low', low(it)); push(i); };
    view.querySelectorAll('[data-sd]').forEach(b => b.onclick = () => { const i = +b.dataset.sd; setQ(i, (+items[i].qty || 0) - 1); });
    view.querySelectorAll('[data-su]').forEach(b => b.onclick = () => { const i = +b.dataset.su; setQ(i, (+items[i].qty || 0) + 1); });
    view.querySelectorAll('[data-sq]').forEach(inp => inp.onchange = () => { const v = inp.value.trim(); if (v === '') return; setQ(+inp.dataset.sq, Math.round(+v || 0)); });
    view.querySelectorAll('[data-se]').forEach(b => b.onclick = () => { if (isMgr()) editStock(items[+b.dataset.se]); });
    const ns = $('#newS'); if (ns) ns.onclick = () => editStock(null);
  }
  function editStock(it) {
    sheet(`<h1 class="ttl">${it ? '品目を編集' : '品目を追加'}</h1>
      <div class="field"><label>品名<em>必須</em></label><input id="k_i" maxlength="60" value="${it ? esc(it.item) : ''}"></div>
      <div class="two"><div class="field"><label>単位</label><input id="k_u" maxlength="6" value="${it ? esc(it.unit) : '個'}"></div><div class="field"><label>今の数</label><input id="k_q" type="number" inputmode="numeric" min="0" value="${it && it.qty !== '' ? it.qty : ''}"></div></div>
      <div class="two"><div class="field"><label>この数以下で自動発注</label><input id="k_t" type="number" inputmode="numeric" min="0" value="${it ? it.threshold : 0}"></div><div class="field"><label>1回に頼む数</label><input id="k_o" type="number" inputmode="numeric" min="1" value="${it ? it.order_qty : 1}"></div></div>
      <p class="small muted">「この数以下で自動発注」を0にすると、自動では発注しません。</p>
      <button class="btn" id="k_go">保存する</button>${it ? '<button class="btn danger" id="k_del">この品目を消す</button>' : ''}<button class="btn ghost" data-close>やめる</button>`);
    $('#k_go').onclick = async () => {
      const item = $('#k_i').value.trim(); if (!item) return toast('品名を入力してください');
      const r = await call('staff_stock_save', { item, original: it ? it.item : '', unit: $('#k_u').value.trim() || '個', qty: $('#k_q').value, threshold: +$('#k_t').value || 0, order_qty: +$('#k_o').value || 1 }).catch(() => null);
      if (r && r.ok) { closeSheet(); toast('保存しました'); load(); } else toast((r && r.message) || '保存できませんでした');
    };
    const d = $('#k_del'); if (d) d.onclick = async () => {
      if (d.dataset.c !== '1') { d.dataset.c = '1'; d.textContent = 'もう一度押すと消します'; return; }
      const r = await call('staff_stock_delete', { item: it.item }).catch(() => null);
      if (r && r.ok) { closeSheet(); toast('消しました'); load(); } else toast('消せませんでした');
    };
  }

  /* ---------- 研修：確認テスト ---------- */
  const quizOf = id => (F.quizzes || []).find(q => q.video_id === id);
  function quizBlock(v) {
    const q = quizOf(v.id); if (!q) return '';
    const mine = (F.quizResults || []).filter(r => r.video_id === v.id && r.name === auth.name);
    const best = mine.find(r => r.passed);
    let mgrRes = '';
    if (isMgr()) {
      const last = {}; (F.quizResults || []).filter(r => r.video_id === v.id).forEach(r => { const p = last[r.name]; if (!p || (!p.passed && (r.passed || r.at > p.at))) last[r.name] = r; }); // 合格を優先、なければ最新
      mgrRes = Object.values(last).length ? `<p class="small muted" style="margin-top:8px">結果：${Object.values(last).map(r => `${esc(r.name)} ${r.score}/${r.total}${r.passed ? '（合格）' : ''}`).join('、')}</p>` : '';
    }
    return `<div class="card quizbox"><div class="row"><span><b style="font-family:var(--mincho)">確認テスト</b><br><span class="small muted">${q.questions.length}問・${q.pass_rate}%以上で合格。合格すると受講済みになります。</span></span>
      ${best ? `<span class="chip new">合格 ${best.score}/${best.total}</span>` : mine.length ? `<span class="chip">前回 ${mine[mine.length - 1].score}/${mine[mine.length - 1].total}</span>` : ''}</div>
      <button class="btn" id="qStart" style="margin-top:12px">${best ? 'もう一度受ける' : '確認テストを受ける'}</button>${mgrRes}</div>`;
  }
  function bindQuiz(v) {
    const st = $('#qStart'); if (st) st.onclick = () => takeQuiz(v);
    const ed = $('#qEdit'); if (ed) ed.onclick = () => editQuiz(v);
  }
  function takeQuiz(v) {
    const q = quizOf(v.id);
    sheet(`<span class="small muted">${esc(v.title)}</span><h1 class="ttl" style="margin-top:4px">確認テスト</h1>
      ${q.questions.map((x, i) => `<div class="qq"><p class="qt">問${i + 1}　${esc(x.q)}</p>${x.choices.map((c, j) => `<label class="opt"><input type="radio" name="q${i}" value="${j}"><span>${esc(c)}</span></label>`).join('')}</div>`).join('')}
      <div id="qRes"></div><button class="btn" id="qSend">採点する</button><button class="btn ghost" data-close>やめる</button>`);
    $('#qSend').onclick = async () => {
      const answers = q.questions.map((x, i) => { const c = document.querySelector(`#sheet input[name="q${i}"]:checked`); return c ? +c.value : -1; });
      if (answers.includes(-1)) return toast('すべての問題に答えてください');
      $('#qSend').disabled = true;
      const r = await call('staff_quiz_submit', { video_id: v.id, answers }).catch(() => null);
      if (!r || !r.ok) { $('#qSend').disabled = false; return toast((r && r.message) || '採点できませんでした'); }
      document.querySelectorAll('#sheet .qq').forEach((el, i) => el.classList.toggle('ng', r.wrong.includes(i)));
      $('#qRes').innerHTML = `<div class="${r.passed ? 'okbox' : 'err'}" style="${r.passed ? 'padding:8px 0' : ''}">${r.passed ? `<div class="ic">✓</div><b>合格です（${r.score}/${r.total}）</b><br><span class="small muted">受講済みになりました</span>` : `${r.score}/${r.total}問正解。合格は${r.pass_rate}%以上です。赤い問題を見直して、もう一度受けてください。`}</div>`;
      $('#qSend').textContent = r.passed ? '閉じる' : 'もう一度採点する'; $('#qSend').disabled = false;
      if (r.passed) $('#qSend').onclick = () => { closeSheet(); load(); };
      load(true);
    };
  }
  function editQuiz(v) {
    const q = quizOf(v.id);
    let qs = q ? q.questions.map(x => ({ q: x.q, choices: x.choices.slice(), answer: x.answer })) : [{ q: '', choices: ['', ''], answer: 0 }];
    const draw = () => {
      sheet(`<h1 class="ttl">確認テストを${q ? '編集' : '作る'}</h1><p class="small muted" style="margin-top:-8px">${esc(v.title)}　選択肢は1行に1つ。正解の番号を選んでください。</p>
        ${qs.map((x, i) => `<div class="qe"><div class="field"><label>問${i + 1}</label><input data-qq="${i}" maxlength="200" value="${esc(x.q)}" placeholder="例）1剤を塗ったあと、しみると言われたら？"></div>
          <div class="field"><label>選択肢</label><textarea data-qc="${i}" rows="3" placeholder="すぐに拭き取って店長に報告する&#10;そのまま放置時間を守る">${esc(x.choices.join('\n'))}</textarea></div>
          <div class="field"><label>正解</label><select data-qa="${i}">${(x.choices.length ? x.choices : ['', '']).map((c, j) => `<option value="${j}" ${j === x.answer ? 'selected' : ''}>${j + 1}番目${c ? '：' + esc(c.slice(0, 16)) : ''}</option>`).join('')}</select></div>
          <button class="linkbtn" data-qx="${i}">この問題を消す</button></div>`).join('')}
        <button class="btn ghost" id="qAdd">問題を追加する</button>
        <div class="field" style="margin-top:14px"><label>合格ライン（%）</label><input id="qPr" type="number" min="50" max="100" value="${q ? q.pass_rate : 80}"></div>
        <button class="btn" id="qSave">保存する</button>${q ? '<button class="btn danger" id="qDel">テストをなくす</button>' : ''}<button class="btn ghost" data-close>やめる</button>`);
      const read = () => { qs = qs.map((x, i) => ({ q: document.querySelector(`#sheet [data-qq="${i}"]`).value, choices: document.querySelector(`#sheet [data-qc="${i}"]`).value.split('\n').map(c => c.trim()).filter(Boolean), answer: +document.querySelector(`#sheet [data-qa="${i}"]`).value })); };
      document.querySelectorAll('#sheet [data-qc]').forEach(t => t.onchange = () => { read(); draw(); });
      document.querySelectorAll('#sheet [data-qx]').forEach(b => b.onclick = () => { read(); qs.splice(+b.dataset.qx, 1); if (!qs.length) qs.push({ q: '', choices: ['', ''], answer: 0 }); draw(); });
      $('#qAdd').onclick = () => { read(); qs.push({ q: '', choices: ['', ''], answer: 0 }); draw(); };
      $('#qSave').onclick = async () => {
        read();
        const ok = qs.filter(x => x.q.trim() && x.choices.length >= 2 && x.answer < x.choices.length);
        if (!ok.length) return toast('問題と2つ以上の選択肢を入力してください');
        const r = await call('staff_quiz_save', { video_id: v.id, questions: ok, pass_rate: +$('#qPr').value || 80 }).catch(() => null);
        if (r && r.ok) { closeSheet(); toast(`確認テストを保存しました（${r.count}問）`); load(); } else toast((r && r.message) || '保存できませんでした');
      };
      const dl = $('#qDel'); if (dl) dl.onclick = async () => { const r = await call('staff_quiz_save', { video_id: v.id, questions: [] }).catch(() => null); if (r && r.ok) { closeSheet(); toast('テストをなくしました'); load(); } };
    };
    draw();
  }

  /* ---------- 研修：技術チェック ---------- */
  function vSkill() {
    const skills = F.skillList || [];
    const checks = F.skillChecks || [];
    const latest = (n, sk) => checks.find(c => c.name === n && c.skill === sk);
    const people = isMgr() ? (F.staffList || []) : [auth.name];
    view.innerHTML = `${hdr('docs')}${innerSeg([['video', '研修動画'], ['skill', '技術チェック']])}
      <div class="card"><table class="tbl mx"><thead><tr><th>技術</th>${people.map(n => `<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>
        ${skills.map(sk => `<tr><td>${esc(sk)}</td>${people.map(n => { const c = latest(n, sk); return `<td>${c ? `<span class="res ${c.result === '合格' ? 'ok' : 'ng'}">${c.result === '合格' ? '合格' : '再'}</span>` : '<span class="muted">—</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      <h2 class="sec">${isMgr() ? 'チェックの記録' : 'あなたへのフィードバック'}</h2>
      ${checks.slice(0, 40).map(c => `<div class="card"><div class="row"><b style="font-family:var(--mincho)">${esc(c.skill)}</b><span class="res ${c.result === '合格' ? 'ok' : 'ng'}">${esc(c.result)}</span></div>
        <div class="small muted">${esc(fmtDate(c.at))}${isMgr() ? '　' + esc(c.name) : ''}　確認：${esc(c.checked_by)}</div>${c.comment ? `<div class="small" style="margin-top:6px;white-space:pre-wrap">${esc(c.comment)}</div>` : ''}</div>`).join('') || '<div class="card empty">まだ記録はありません</div>'}
      ${isMgr() ? '<button class="btn ghost" id="skL" style="margin-top:12px">技術の項目を編集する</button><button class="fab" id="newK">結果を記録</button>' : ''}`;
    const nk = $('#newK'); if (nk) nk.onclick = () => {
      let res = '合格';
      sheet(`<h1 class="ttl">技術チェックの結果</h1>
        <div class="field"><label>スタッフ</label><select id="c_n">${(F.staffList || []).map(n => `<option>${esc(n)}</option>`).join('')}</select></div>
        <div class="field"><label>技術</label><select id="c_s">${skills.map(s => `<option>${esc(s)}</option>`).join('')}</select></div>
        <div class="field"><label>結果</label><div class="seg" style="margin:0"><button data-cr="合格" class="on">合格</button><button data-cr="再チェック">再チェック</button></div></div>
        <div class="field"><label>コメント（よかった点・直す点）</label><textarea id="c_c" rows="4" maxlength="500"></textarea></div>
        <button class="btn" id="c_go">記録する</button><button class="btn ghost" data-close>やめる</button>`);
      document.querySelectorAll('#sheet [data-cr]').forEach(b => b.onclick = () => { res = b.dataset.cr; document.querySelectorAll('#sheet [data-cr]').forEach(x => x.classList.toggle('on', x === b)); });
      $('#c_go').onclick = async () => {
        const r = await call('staff_skill_save', { target: $('#c_n').value, skill: $('#c_s').value, result: res, comment: $('#c_c').value }).catch(() => null);
        if (r && r.ok) { closeSheet(); toast('記録しました'); load(); } else toast((r && r.message) || '記録できませんでした');
      };
    };
    const sl = $('#skL'); if (sl) sl.onclick = () => {
      sheet(`<h1 class="ttl">技術の項目</h1><p class="small muted" style="margin-top:-8px">1行に1つ。</p><div class="field"><textarea id="sk_t" rows="8">${esc(skills.join('\n'))}</textarea></div><button class="btn" id="sk_go">保存する</button><button class="btn ghost" data-close>やめる</button>`);
      $('#sk_go').onclick = async () => { const r = await call('staff_skills_set', { skills: $('#sk_t').value.split('\n').map(x => x.trim()).filter(Boolean) }).catch(() => null); if (r && r.ok) { closeSheet(); toast('保存しました'); load(); } else toast((r && r.message) || '保存できませんでした'); };
    };
  }

  /* ---------- お客様カルテ ----------
     個人情報なので、この端末には保存しない（画面を開いている間だけメモリに置く）。開くたびにサーバーから取得し、閲覧も記録される */
  const KS = new Map(); // 'q:検索語' → 結果 / 'c:id' → カルテ / 'p:id' → 写真
  let kQ = '', kId = '', kTimer = 0, kSeq = 0;
  const kname = c => esc(c.name) + (c.kana ? `<small class="kana">${esc(c.kana)}</small>` : '');
  const telFmt = t => { t = String(t || ''); return t.length === 11 ? t.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') : t.length === 10 ? t.replace(/(\d{2,3})(\d{3,4})(\d{4})/, '$1-$2-$3') : t; };
  function vKarte() {
    view.innerHTML = `${hdr('rsv')}
      <div class="ksearch"><input id="k_q" type="search" enterkeyhint="search" placeholder="お名前・ふりがな・電話番号で検索" value="${esc(kQ)}" autocomplete="off"></div>
      <div id="k_res"><div class="spin"></div></div>
      <button class="fab" id="k_new">新しいカルテ</button>
      <p class="small muted" style="margin-top:16px">カルテを開いた人・時刻はすべて記録されます。お客様の情報は、この端末には保存されません。</p>
      ${isMgr() ? '<button class="btn ghost" id="k_log" style="margin-top:6px">閲覧・変更の記録を見る（店長のみ）</button>' : ''}`;
    const q = $('#k_q');
    q.oninput = () => { clearTimeout(kTimer); kTimer = setTimeout(() => { kQ = q.value.trim(); kSearch(); }, 400); };
    q.onkeydown = e => { if (e.key === 'Enter') { clearTimeout(kTimer); kQ = q.value.trim(); kSearch(); q.blur(); } };
    $('#k_new').onclick = () => editKarte(null);
    const lg = $('#k_log'); if (lg) lg.onclick = karteLog;
    kSearch();
  }
  async function kSearch() {
    const box = $('#k_res'); if (!box) return;
    const key = 'q:' + kQ, seq = ++kSeq;
    const draw = rows => {
      if (seq !== kSeq || !$('#k_res')) return;
      $('#k_res').innerHTML = `<h2 class="sec">${kQ ? `「${esc(kQ)}」の検索結果` : '最近来店したお客様'}</h2>` + (rows.length ? rows.map(c => `<button class="card kc" data-kid="${esc(c.id)}">
        <span class="nm"><b>${kname(c)}</b></span><span class="small muted">${c.visits ? `来店 ${c.visits}回・前回 ${esc(fmtDate(c.last))}` : '来店記録なし'}</span></button>`).join('')
        : `<div class="card empty">${kQ ? '見つかりませんでした。右下の「新しいカルテ」から作成できます' : 'カルテはまだありません'}</div>`);
      $('#k_res').querySelectorAll('[data-kid]').forEach(b => b.onclick = () => openKarte(b.dataset.kid));
    };
    if (KS.has(key)) draw(KS.get(key)); else box.innerHTML = '<div class="spin"></div>';
    const r = await call('staff_karte_search', { q: kQ }).catch(() => null);
    if (r && r.ok) { KS.set(key, r.rows); draw(r.rows); }
    else if (seq === kSeq && !KS.has(key) && $('#k_res')) $('#k_res').innerHTML = `<div class="card empty">${esc((r && r.message) || '通信できませんでした')}</div>`;
  }
  function openKarte(id) { kId = id; route = 'kdetail'; render(); window.scrollTo(0, 0); }
  async function fetchKarte(id) {
    const r = await call('staff_karte_get', { id }).catch(() => null);
    if (r && r.ok) { KS.set('c:' + id, r.customer); return r.customer; }
    toast((r && r.message) || '読み込めませんでした'); return null;
  }
  async function vKDetail() {
    const back = `<button class="back" data-sub="karte">‹ カルテ一覧</button>`;
    let c = KS.get('c:' + kId);
    if (!c) { view.innerHTML = back + '<div class="spin"></div>'; c = await fetchKarte(kId); if (route !== 'kdetail') return; if (!c) { view.innerHTML = back + '<div class="card empty">カルテを開けませんでした</div>'; return; } }
    view.innerHTML = `${back}
      <div class="khead"><h1 class="ttl">${esc(c.name)}<span class="sama">様</span>${c.kana ? `<small class="kana">${esc(c.kana)}</small>` : ''}</h1>
        <div class="small muted">${c.tel ? `<a href="tel:${esc(c.tel)}">${esc(telFmt(c.tel))}</a>　` : ''}来店 ${c.visits.length}回${c.visits[0] ? '・前回 ' + esc(fmtDate(c.visits[0].date)) : ''}</div></div>
      ${c.caution ? `<div class="warn"><b>注意事項</b><span style="white-space:pre-wrap">${esc(c.caution)}</span></div>` : ''}
      <div class="card"><dl class="kv"><dt>写真の同意</dt><dd>${c.consent ? `<span class="res ok">同意あり</span> <span class="small muted">${esc(fmtDate(c.consent_at))}</span>` : '<span class="res ng">同意なし</span> <span class="small muted">写真は保存できません</span>'}</dd>
        ${c.memo ? `<dt>メモ</dt><dd style="white-space:pre-wrap">${esc(c.memo)}</dd>` : ''}</dl>
        <button class="btn ghost sm" id="k_edit">お客様の情報を編集</button></div>
      <h2 class="sec">施術の履歴</h2>
      ${c.visits.map(v => `<div class="card vs">
        <div class="row"><b class="dt">${esc(fmtDate(v.date))}<small>${esc(v.date.slice(0, 4))}</small></b><span class="small muted">担当 ${esc(v.staff)}</span></div>
        ${v.menu ? `<div class="mn">${esc(v.menu)}</div>` : ''}
        <dl class="kv">${v.products ? `<dt>使用した薬剤・商品</dt><dd>${esc(v.products)}</dd>` : ''}${v.process ? `<dt>放置時間・工程</dt><dd>${esc(v.process)}</dd>` : ''}${v.memo ? `<dt>メモ</dt><dd>${esc(v.memo)}</dd>` : ''}${v.next ? `<dt>次回へ</dt><dd>${esc(v.next)}</dd>` : ''}</dl>
        ${v.photos.length || c.consent ? `<div class="ph">${v.photos.map(p => `<button class="pt" data-pid="${esc(p.id)}" data-vid="${esc(v.id)}" aria-label="写真 ${esc(p.label)}"><img alt="" data-src="${esc(p.id)}">${p.label ? `<span>${esc(p.label)}</span>` : ''}</button>`).join('')}
          ${c.consent && v.photos.length < 8 ? `<label class="pt add">＋写真<input type="file" accept="image/*" data-up="${esc(v.id)}" hidden></label>` : ''}</div>` : ''}
        <div class="acts"><button class="linkbtn" data-ev="${esc(v.id)}">この記録を編集</button></div></div>`).join('') || '<div class="card empty">施術の履歴はまだありません</div>'}
      <button class="fab" id="k_visit">施術を記録</button>
      ${isMgr() ? '<button class="btn danger" id="k_del" style="margin-top:20px">このカルテを削除する（店長のみ）</button>' : ''}`;
    $('#k_edit').onclick = () => editKarte(c);
    $('#k_visit').onclick = () => editVisit(c, null);
    view.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => editVisit(c, c.visits.find(v => v.id === b.dataset.ev)));
    view.querySelectorAll('[data-up]').forEach(inp => inp.onchange = () => { if (inp.files[0]) uploadPhoto(c, inp.dataset.up, inp.files[0]); });
    view.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => viewPhoto(c, b.dataset.pid));
    view.querySelectorAll('img[data-src]').forEach(loadThumb);
    const d = $('#k_del');
    if (d) d.onclick = async () => {
      if (d.dataset.c !== '1') { d.dataset.c = '1'; d.textContent = 'もう一度押すと、履歴と写真もすべて削除します'; return; }
      d.disabled = true; const r = await call('staff_karte_delete', { id: c.id }).catch(() => null);
      if (r && r.ok) { KS.clear(); toast('カルテを削除しました'); route = 'karte'; render(); } else { d.disabled = false; toast((r && r.message) || '削除できませんでした'); }
    };
  }
  async function photoData(id) {
    if (KS.has('p:' + id)) return KS.get('p:' + id);
    const r = await call('staff_photo_get', { id }).catch(() => null);
    if (r && r.ok) { KS.set('p:' + id, r.data); return r.data; }
    return '';
  }
  async function loadThumb(img) { const d = await photoData(img.dataset.src); if (d) { img.src = d; img.parentNode.classList.add('ok'); } }
  async function viewPhoto(c, id) {
    let vis = null, ph = null; c.visits.forEach(v => v.photos.forEach(p => { if (p.id === id) { vis = v; ph = p; } }));
    if (!ph) return;
    sheet(`<div class="small muted">${esc(fmtDate(vis.date))}　${esc(ph.label || '')}</div><div class="bigph"><div class="spin"></div></div>
      ${isMgr() ? '<button class="btn danger" id="p_del">この写真を削除する（店長のみ）</button>' : ''}<button class="btn ghost" data-close style="margin-top:10px">閉じる</button>`);
    const d = await photoData(id);
    const box = document.querySelector('#sheet .bigph'); if (box) box.innerHTML = d ? `<img src="${d}" alt="">` : '<div class="empty">写真を読み込めませんでした</div>';
    const del = $('#p_del');
    if (del) del.onclick = async () => {
      if (del.dataset.c !== '1') { del.dataset.c = '1'; del.textContent = 'もう一度押すと削除します'; return; }
      del.disabled = true; const r = await call('staff_photo_delete', { id }).catch(() => null);
      if (r && r.ok) { closeSheet(); toast('写真を削除しました'); KS.delete('p:' + id); await fetchKarte(c.id); render(); } else { del.disabled = false; toast('削除できませんでした'); }
    };
  }
  // 写真は端末で長い辺1280pxのJPEGに縮めてから送る（通信量と保存容量を抑える）
  function shrink(file) {
    return new Promise((ok, ng) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1280 / Math.max(im.naturalWidth, im.naturalHeight));
        const cv = document.createElement('canvas'); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        ok(cv.toDataURL('image/jpeg', 0.82));
      };
      im.onerror = () => { URL.revokeObjectURL(url); ng(new Error('この画像は読み込めませんでした')); };
      im.src = url;
    });
  }
  function uploadPhoto(c, vid, file) {
    let label = '施術後';
    sheet(`<h1 class="ttl">写真を保存する</h1>
      <div class="bigph"><div class="spin"></div></div>
      <div class="field"><label>写真の種類</label><div class="seg" style="margin:0">${['施術前', '施術後', 'デザイン', 'その他'].map(l => `<button data-pl="${l}" class="${l === label ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <p class="small muted">写真はお店のGoogleドライブ（非公開のフォルダ）に保存され、このアプリからだけ見られます。</p>
      <button class="btn" id="p_go" disabled>保存する</button><button class="btn ghost" data-close>やめる</button>`);
    document.querySelectorAll('#sheet [data-pl]').forEach(b => b.onclick = () => { label = b.dataset.pl; document.querySelectorAll('#sheet [data-pl]').forEach(x => x.classList.toggle('on', x === b)); });
    shrink(file).then(data => {
      const box = document.querySelector('#sheet .bigph'); if (box) box.innerHTML = `<img src="${data}" alt="">`;
      const go = $('#p_go'); go.disabled = false;
      go.onclick = async () => {
        go.disabled = true; go.textContent = '保存中…';
        const r = await call('staff_photo_upload', { customer_id: c.id, visit_id: vid, data, label }).catch(() => null);
        if (r && r.ok) { KS.set('p:' + r.photo.id, data); closeSheet(); toast('写真を保存しました'); await fetchKarte(c.id); if (route === 'kdetail') render(); }
        else { go.disabled = false; go.textContent = '保存する'; toast((r && r.message) || '保存できませんでした'); }
      };
    }).catch(e => { closeSheet(); toast(e.message); });
  }
  function editKarte(c) {
    const n = !c; c = c || {};
    sheet(`<h1 class="ttl">${n ? '新しいカルテ' : 'お客様の情報'}</h1>
      <div class="field"><label>お名前<em>必須</em></label><input id="k_n" maxlength="40" value="${esc(c.name || '')}" placeholder="例）山田 花子"></div>
      <div class="field"><label>ふりがな</label><input id="k_k" maxlength="40" value="${esc(c.kana || '')}" placeholder="やまだ はなこ"></div>
      <div class="field"><label>電話番号</label><input id="k_t" type="tel" inputmode="tel" maxlength="15" value="${esc(c.tel || '')}" placeholder="09012345678"></div>
      <div class="field"><label>注意事項（肌が弱い・アレルギーなど）</label><textarea id="k_c" rows="3" maxlength="500" placeholder="施術の前に必ず目に入る場所に表示されます">${esc(c.caution || '')}</textarea></div>
      <div class="field"><label>メモ（好み・会話など）</label><textarea id="k_m" rows="3" maxlength="1000">${esc(c.memo || '')}</textarea></div>
      <div class="consent"><label class="check"><input type="checkbox" id="k_ok" ${c.consent ? 'checked' : ''}> 写真の保存に同意をいただいた</label>
        <p class="small muted">お客様に「施術の記録として眉の写真をお店で保管します。外部には公開しません」とお伝えし、同意をいただいた場合だけオンにしてください。同意がないカルテには写真を保存できません。</p></div>
      <button class="btn" id="k_go">${n ? 'カルテを作る' : '保存する'}</button><button class="btn ghost" data-close>やめる</button>`);
    $('#k_go').onclick = async () => {
      const cname = $('#k_n').value.trim(); if (!cname) return toast('お名前を入力してください');
      $('#k_go').disabled = true;
      const r = await call('staff_karte_save', { id: c.id || '', cname, kana: $('#k_k').value, tel: $('#k_t').value, caution: $('#k_c').value, memo: $('#k_m').value, consent: $('#k_ok').checked }).catch(() => null);
      if (r && r.ok) { closeSheet(); [...KS.keys()].filter(k => k.startsWith('q:')).forEach(k => KS.delete(k)); toast(n ? 'カルテを作りました' : '保存しました'); await fetchKarte(r.id); openKarte(r.id); }
      else { $('#k_go').disabled = false; toast((r && r.message) || '保存できませんでした'); }
    };
  }
  function editVisit(c, v) {
    const n = !v; v = v || { date: F.today || ymd(new Date()), staff: auth.name };
    const staffs = [...new Set((F.staffList || []).concat([auth.name, v.staff]).filter(Boolean))];
    const menus = ((SHOP && SHOP.menus) || []).map(m => m.name);
    const last = c.visits[0];
    sheet(`<h1 class="ttl">${n ? '施術を記録' : '施術の記録を編集'}</h1><p class="small muted" style="margin-top:-8px">${esc(c.name)} 様</p>
      <div class="two"><div class="field"><label>日付</label><input id="v_d" type="date" value="${esc(v.date)}"></div>
        <div class="field"><label>担当</label><select id="v_s">${staffs.map(s => `<option ${s === v.staff ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div></div>
      <div class="field"><label>メニュー</label><input id="v_m" list="v_ml" maxlength="80" value="${esc(v.menu || '')}"><datalist id="v_ml">${menus.map(m => `<option value="${esc(m)}">`).join('')}</datalist></div>
      <div class="field"><label>使用した薬剤・商品</label><textarea id="v_p" rows="2" maxlength="300" placeholder="例）1剤：○○ / 2剤：○○ / ワックス：○○">${esc(v.products || '')}</textarea></div>
      <div class="field"><label>放置時間・工程</label><textarea id="v_r" rows="2" maxlength="500" placeholder="例）1剤 8分 → 2剤 6分 → ティント 3分">${esc(v.process || '')}</textarea></div>
      <div class="field"><label>メモ（仕上がり・肌の状態・会話）</label><textarea id="v_o" rows="3" maxlength="1500">${esc(v.memo || '')}</textarea></div>
      <div class="field"><label>次回への申し送り</label><textarea id="v_n" rows="2" maxlength="500" placeholder="例）左眉尻をもう少し伸ばす。4週間後のご来店をおすすめ">${esc(v.next || '')}</textarea></div>
      ${n && last && (last.products || last.process) ? '<button class="btn ghost sm" id="v_cp">前回の薬剤・工程をコピー</button>' : ''}
      <button class="btn" id="v_go">${n ? '記録する' : '保存する'}</button><button class="btn ghost" data-close>やめる</button>
      ${n && c.consent ? '<p class="small muted">写真は、記録したあとに履歴の「＋写真」から追加できます。</p>' : ''}`);
    const cp = $('#v_cp'); if (cp) cp.onclick = () => { $('#v_p').value = last.products || ''; $('#v_r').value = last.process || ''; if (!$('#v_m').value) $('#v_m').value = last.menu || ''; };
    $('#v_go').onclick = async () => {
      $('#v_go').disabled = true;
      const r = await call('staff_visit_save', { customer_id: c.id, id: v.id || '', date: $('#v_d').value, staff: $('#v_s').value, menu: $('#v_m').value, products: $('#v_p').value, process: $('#v_r').value, memo: $('#v_o').value, next: $('#v_n').value }).catch(() => null);
      if (r && r.ok) { closeSheet(); [...KS.keys()].filter(k => k.startsWith('q:')).forEach(k => KS.delete(k)); toast(n ? '記録しました' : '保存しました'); await fetchKarte(c.id); if (route === 'kdetail') render(); }
      else { $('#v_go').disabled = false; toast((r && r.message) || '保存できませんでした'); }
    };
  }
  async function karteLog() {
    sheet('<h1 class="ttl">閲覧・変更の記録</h1><div class="spin"></div>');
    const r = await call('staff_karte_log').catch(() => null);
    const rows = (r && r.ok && r.rows) || [];
    $('#sheetBody').innerHTML = `<h1 class="ttl">閲覧・変更の記録</h1><p class="small muted" style="margin-top:-8px">新しい順に最大200件</p>
      <div class="card"><table class="tbl"><thead><tr><th>日時</th><th>スタッフ</th><th>内容</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(fmtDate(x.at))}</td><td>${esc(x.name)}</td><td>${esc(x.action)}<br><span class="small muted">${esc(x.detail)}</span></td></tr>`).join('') || '<tr><td colspan="3" class="muted">記録はありません</td></tr>'}</tbody></table></div>
      <button class="btn ghost" data-close>閉じる</button>`;
  }

  /* ---------- 売上ダッシュボード（店長のみ） ---------- */
  let dMonth = '', dTable = false;
  const DS = {};
  const man = n => { n = Number(n || 0); return n >= 10000 ? (Math.round(n / 1000) / 10).toLocaleString('ja-JP') + '万' : n.toLocaleString('ja-JP'); };
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  async function vDash() {
    const t = F.today || ymd(new Date());
    if (!dMonth) dMonth = t.slice(0, 7);
    const key = dMonth;
    if (!DS[key]) {
      view.innerHTML = hdr('work') + '<div class="spin"></div>';
      const r = await call('staff_dashboard', { month: key }).catch(() => null);
      if (route !== 'dash' || dMonth !== key) return;
      if (!r || !r.ok) { view.innerHTML = hdr('work') + `<div class="card empty">${esc((r && r.message) || '読み込めませんでした')}</div>`; return; }
      DS[key] = r;
    }
    const d = DS[key], ms = d.monthly, cur = ms.find(x => x.month === key) || { total: 0, sales: 0, retail: 0, treatments: 0, nominations: 0, days: 0 };
    const i = ms.indexOf(cur), prev = i > 0 ? ms[i - 1] : null;
    const diff = prev && prev.total ? Math.round((cur.total - prev.total) / prev.total * 100) : null;
    const k = d.karte;
    const thisM = t.slice(0, 7), canNext = key < thisM;
    const mLabel = m => `${+m.slice(5)}月`;
    view.innerHTML = `${hdr('work')}
      <div class="mnav"><button id="d_prev" aria-label="前の月">‹</button><b>${key.slice(0, 4)}年${+key.slice(5)}月</b><button id="d_next" aria-label="次の月" ${canNext ? '' : 'disabled'}>›</button></div>
      <div class="tiles">
        <div class="tile wide"><span>売上（施術＋物販）</span><b>${yen(cur.total)}</b><small>${diff == null ? '前月のデータなし' : `前月比 ${diff >= 0 ? '+' : ''}${diff}%`}　施術 ${yen(cur.sales)}／物販 ${yen(cur.retail)}</small></div>
        <div class="tile"><span>施術数</span><b>${cur.treatments}<small> 件</small></b><small>営業 ${cur.days}日</small></div>
        <div class="tile"><span>客単価</span><b>${cur.treatments ? yen(Math.round(cur.sales / cur.treatments)) : '—'}</b><small>施術売上 ÷ 施術数</small></div>
        <div class="tile"><span>指名率</span><b>${pct(cur.nominations, cur.treatments)}</b><small>指名 ${cur.nominations}件</small></div>
        <div class="tile"><span>リピート率</span><b>${pct(k.repeat90, k.customers90)}</b><small>直近90日 ${k.customers90}名中 ${k.repeat90}名</small></div>
      </div>
      <h2 class="sec">月別の売上<button class="linkbtn" id="d_tbl" style="float:right">${dTable ? 'グラフで見る' : '表で見る'}</button></h2>
      <div class="card">${dTable ? `<table class="tbl"><thead><tr><th>月</th><th>施術数</th><th>指名率</th><th>売上</th></tr></thead><tbody>${ms.slice().reverse().map(m => `<tr><td>${m.month.slice(0, 4)}/${+m.month.slice(5)}</td><td>${m.treatments}</td><td>${pct(m.nominations, m.treatments)}</td><td>${yen(m.total)}</td></tr>`).join('')}</tbody></table>`
        : barChart(ms.map(m => ({ k: m.month, l: mLabel(m.month), v: m.total, tip: `${m.month.slice(0, 4)}年${+m.month.slice(5)}月<br><b>${yen(m.total)}</b><br>施術 ${m.treatments}件・指名率 ${pct(m.nominations, m.treatments)}` })), key)}</div>
      <h2 class="sec">${+key.slice(5)}月の日別売上</h2>
      <div class="card">${d.daily.length ? lineChart(d.daily, key) : '<div class="empty">この月の日報はまだありません</div>'}</div>
      <h2 class="sec">スタッフ別（${+key.slice(5)}月）</h2>
      ${Object.keys(d.staff).length ? `<div class="card"><table class="tbl"><thead><tr><th>名前</th><th>出勤</th><th>施術</th><th>指名率</th><th>売上</th></tr></thead><tbody>${Object.entries(d.staff).sort((a, b) => (b[1].sales + b[1].retail) - (a[1].sales + a[1].retail)).map(([n, o]) => `<tr><td>${esc(n)}</td><td>${o.days}日</td><td>${o.treatments}</td><td>${pct(o.nominations, o.treatments)}</td><td>${yen(o.sales + o.retail)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="card empty">この月の日報はまだありません</div>'}
      <p class="small muted" style="margin-top:14px">売上・施術数・指名はスタッフの「日報」から集計しています。リピート率は、カルテに施術の記録がある方のうち、直近90日に来店した方で2回以上来店している割合です（今月の新規カルテ ${k.newThisMonth}名）。</p>`;
    $('#d_prev').onclick = () => { dMonth = addM(key, -1); vDash(); };
    $('#d_next').onclick = () => { if (canNext) { dMonth = addM(key, 1); vDash(); } };
    $('#d_tbl').onclick = () => { dTable = !dTable; vDash(); };
    view.querySelectorAll('.chart').forEach(bindChart);
  }
  const addM = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5) - 1 + n, 1); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); };
  function niceMax(v) { if (v <= 0) return 10000; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
  function axisY(W, H, pl, pt, ph, max) {
    let g = '';
    const n = String(max)[0] === '2' ? 4 : 5; // 目盛りがきりのよい数字になるように
    for (let i = 0; i <= n; i++) { const y = pt + ph - ph * i / n; g += `<line x1="${pl}" x2="${W}" y1="${y}" y2="${y}" class="gl${i ? '' : ' base'}"/><text x="${pl - 6}" y="${y + 3.5}" class="yl">${i ? man(max * i / n) : '0'}</text>`; }
    return g;
  }
  // 棒グラフ：1色（真鍮）。選んでいる月だけ墨色にする。棒の上下左右を広めに触れるようにして、触れると数値が出る
  function barChart(items, focus) {
    const W = 340, H = 190, pl = 34, pt = 10, pb = 22, ph = H - pt - pb, n = items.length, cw = (W - pl) / n, bw = Math.min(16, cw - 6);
    const max = niceMax(Math.max(...items.map(x => x.v)));
    let s = axisY(W, H, pl, pt, ph, max);
    items.forEach((x, i) => {
      const h = x.v ? Math.max(2, ph * x.v / max) : 0, cx = pl + cw * i + cw / 2, y = pt + ph - h, r = Math.min(4, bw / 2, h);
      if (h) s += `<path class="bar${x.k === focus ? ' on' : ''}" d="M${cx - bw / 2},${pt + ph}V${y + r}a${r},${r} 0 0 1 ${r},${-r}H${cx + bw / 2 - r}a${r},${r} 0 0 1 ${r},${r}V${pt + ph}Z"/>`;
      if (i % 2 === (n - 1) % 2 || x.k === focus) s += `<text x="${cx}" y="${H - 6}" class="xl${x.k === focus ? ' on' : ''}">${x.l}</text>`;
      s += `<rect class="hit" x="${pl + cw * i}" y="${pt}" width="${cw}" height="${ph + pb}" data-tip="${esc(x.tip)}" data-x="${cx}" data-y="${y}"/>`;
    });
    return `<div class="chart" role="img" aria-label="月別の売上の棒グラフ"><svg viewBox="0 0 ${W} ${H}">${s}</svg><div class="tip" hidden></div></div>`;
  }
  // 折れ線：日別の売上。日報のある日だけを点で結ぶ
  function lineChart(days, month) {
    const W = 340, H = 170, pl = 34, pt = 12, pb = 22, ph = H - pt - pb;
    const last = new Date(+month.slice(0, 4), +month.slice(5), 0).getDate();
    const X = dd => pl + 6 + (W - pl - 12) * (dd - 1) / (last - 1), max = niceMax(Math.max(...days.map(x => x.total)));
    const Y = v => pt + ph - ph * v / max;
    let s = axisY(W, H, pl, pt, ph, max);
    [1, 10, 20, last].forEach(dd => { s += `<text x="${X(dd)}" y="${H - 6}" class="xl">${dd}日</text>`; });
    const pts = days.map(x => ({ x: X(+x.date.slice(8)), y: Y(x.total), d: x }));
    s += `<path class="ln" d="${pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join('')}"/>`;
    s += `<line class="xh" x1="0" x2="0" y1="${pt}" y2="${pt + ph}" hidden/>`;
    pts.forEach(p => { s += `<circle class="dot" cx="${p.x}" cy="${p.y}" r="4"/>`; });
    pts.forEach((p, i) => { const a = i ? (p.x + pts[i - 1].x) / 2 : pl, b = i < pts.length - 1 ? (p.x + pts[i + 1].x) / 2 : W;
      s += `<rect class="hit" x="${a}" y="${pt}" width="${b - a}" height="${ph + pb}" data-tip="${esc(`${+p.d.date.slice(5, 7)}/${+p.d.date.slice(8)}<br><b>${yen(p.d.total)}</b><br>施術 ${p.d.treatments}件`)}" data-x="${p.x}" data-y="${p.y}" data-xh="1"/>`; });
    return `<div class="chart" role="img" aria-label="日別の売上の折れ線グラフ"><svg viewBox="0 0 ${W} ${H}">${s}</svg><div class="tip" hidden></div></div>`;
  }
  function bindChart(el) {
    const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), xh = el.querySelector('.xh');
    const show = r => {
      const k = svg.clientWidth / 340, x = +r.dataset.x * k, y = +r.dataset.y * k;
      tip.innerHTML = r.dataset.tip; tip.hidden = false;
      const w = tip.offsetWidth; tip.style.left = Math.max(0, Math.min(el.clientWidth - w, x - w / 2)) + 'px'; tip.style.top = Math.max(0, y - tip.offsetHeight - 10) + 'px';
      if (xh && r.dataset.xh) { xh.setAttribute('x1', r.dataset.x); xh.setAttribute('x2', r.dataset.x); xh.removeAttribute('hidden'); }
      el.querySelectorAll('.hit.cur').forEach(h => h.classList.remove('cur')); r.classList.add('cur');
    };
    el.querySelectorAll('.hit').forEach(r => { r.addEventListener('pointerenter', () => show(r)); r.addEventListener('click', () => show(r)); });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { tip.hidden = true; if (xh) xh.setAttribute('hidden', ''); } });
  }

  function boot() { render(); load(); loadShop(); }
  if (auth && auth.pass) boot(); else vLogin();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && auth) load(true); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__EBS = { get F() { return F; } };
})();
