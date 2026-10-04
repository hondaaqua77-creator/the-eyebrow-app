/* THE EYEBROW お客様アプリ 設定
 * API_URL … 予約WebアプリのURL（GAS）。ここだけ変えれば別の店舗でも使えます。
 * FALLBACK … サーバーから取れないときに表示する内容（通常はスプレッドシートの「設定」から読み込みます）
 */
window.EB_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbx1xIgANz82d2jdoGcfZxN4yxGNSJYsfreuHe4sXp3wHMZ8HJHuRFo6ymO4x-up0HGD/exec',
  FALLBACK: {
    shop: 'THE EYEBROW 京都駅店',
    open: '10:00', close: '19:00', step: 30, closedDays: [], maxDays: 60,
    info: {
      tagline: '眉とまつげの専門サロン',
      address: '京都府京都市下京区七条通新町西入夷之町686-3 コタニビル802',
      access: '京都駅C6出口から徒歩10分。新町通りを北へ、ファミリーマートの交差点を渡って左折。1階が金物屋のコタニビル802号室です。',
      hours: '10:00〜19:00（不定休）',
      seats: '2席・完全予約制',
      tel: '', line: '', instagram: '',
      mapQuery: 'THE EYEBROW 京都駅店',
      features: ['完全予約制', '個室あり', '女性スタッフ', 'カード支払いOK', 'メイクルームあり', '2回目以降特典あり']
    },
    news: [
      { date: '2026-10-05', title: '公式アプリができました', body: 'ホーム画面に追加すると、次回からワンタップでご予約いただけます。' }
    ],
    coupons: [],
    menus: []
  }
};
