/* THE EYEBROW スタッフアプリ：通信できるときは常に最新を表示し、圏外のときだけ保存分を使う */
const VER = 'eb-staff-v5.0.0';
const SHELL = ['./', 'index.html', 'style.css', 'staff.js', 'staff.css', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'cg-300.woff2', 'cg-500.woff2', 'cg-400i.woff2'];

self.addEventListener('install', e => {
  // ブラウザの一時保存を通さず、サーバーから取り直して保存する（古い画面が残らないように）
  e.waitUntil(caches.open(VER)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k)));
    await self.clients.claim();
    // 古い画面を開いたままの端末は、自動で読み込み直して新しい画面にする
    const cs = await self.clients.matchAll({ type: 'window' });
    cs.forEach(c => { try { c.navigate(c.url); } catch (err) {} });
  })());
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // GAS などの外部通信はそのまま
  e.respondWith((async () => {
    const c = await caches.open(VER);
    try {
      const r = await fetch(e.request, { cache: 'no-cache' });
      if (r.ok) c.put(e.request, r.clone());
      return r;
    } catch (err) {
      return (await c.match(e.request, { ignoreSearch: true })) || (await c.match('index.html')) || Response.error();
    }
  })());
});
