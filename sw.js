/**
 * Service Worker - オフラインキャッシュ
 * バージョンを上げるとキャッシュが更新される
 */
const CACHE_NAME = 'machikoro-v4';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/js/Card.js',
  '/js/Player.js',
  '/js/GameManager.js',
  '/js/cpuTuning.js',
  '/js/CPU.js',
  '/js/RLCPU.js',
  '/js/RLModelPortfolio.js',
  '/js/confetti.js',
  '/js/audio.js',
  '/js/online.js',
  '/js/ui.js',
  '/js/storage.js',
  '/js/stats.js',
  '/js/appShell.js',
  '/js/main.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const OPTIONAL_ASSETS = [
  '/models/rl_model/portfolio/seed103-4p.browser.json',
  '/models/rl_model/portfolio/seed71-top3.browser.json',
  '/models/rl_model/portfolio/seed70.browser.json',
  '/models/rl_model/portfolio/seed69.browser.json',
];

// 「今すぐ更新」ボタンからのメッセージを受け取る
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// インストール: 全アセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS).then(() =>
        Promise.all(OPTIONAL_ASSETS.map((asset) =>
          cache.add(asset).catch(() => undefined)
        ))
      )
    )
  );
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// フェッチ戦略:
//   JS / CSS / HTML → ネットワーク優先（失敗時はキャッシュ）
//   画像・アイコン  → キャッシュ優先（失敗時はネットワーク）
//   socket.io      → キャッシュしない
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/socket.io')) return;

  const isAsset = /\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/.test(url.pathname);

  if (isAsset) {
    // キャッシュ優先（画像は変わらないので高速配信）
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  } else {
    // ネットワーク優先（JS/CSS/HTMLは常に最新を取得、オフライン時はキャッシュ）
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/');
          }
        });
      })
    );
  }
});
