const CACHE_NAME = 'pilgrimage-quest-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/main.js',
  'https://unpkg.com/vue@3/dist/vue.global.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  '/images/stamp_base.png',
  '/images/stamp_layer_1.png',
  '/images/stamp_layer_2.png',
  '/images/stamp_layer_3.png',
  '/images/stamp_layer_4.png',
  '/images/stamp_layer_5.png',
  '/images/special_reward.png',
  // ▼▼▼ 推しキャラのアイコンをキャッシュリストに追加 ▼▼▼
  '/images/oshi_1.png',
  '/images/oshi_2.png',
  '/images/oshi_3.png',
  '/images/oshi_4.png',
  '/images/oshi_5.png'
  // ▲▲▲ ここまで追加 ▲▲▲
];

// インストール時にファイルをキャッシュする
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// リクエスト時にキャッシュを利用する
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュが見つかった場合は、それを返す
        if (response) {
          return response;
        }
        // 見つからなかった場合は、ネットワークから取得する
        return fetch(event.request);
      })
  );
});