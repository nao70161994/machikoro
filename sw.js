/**
 * Service Worker - オフラインキャッシュ
 * バージョンを上げるとキャッシュが更新される
 */
const CACHE_NAME = 'machikoro-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/js/Card.js',
  '/js/Player.js',
  '/js/GameManager.js',
  '/js/CPU.js',
  '/js/confetti.js',
  '/js/audio.js',
  '/js/online.js',
  '/js/ui.js',
  '/js/storage.js',
  '/js/main.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// 「今すぐ更新」ボタンからのメッセージを受け取る
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// インストール: 全アセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
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

// フェッチ: キャッシュ優先 → ネットワークにフォールバック
// socket.io はネットワーク専用（オフライン時はオンライン機能が使えないだけでOK）
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // socket.io はキャッシュしない
  if (url.pathname.startsWith('/socket.io')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // GETリクエストのみキャッシュに追加
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // オフライン時にHTMLリクエストが来たらルートを返す
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/');
        }
      });
    })
  );
});
