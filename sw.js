'use strict';

/* Service Worker
 * 方針: 起動時は常にネットワークから最新版を取得し、キャッシュを更新する。
 * ネットワークが使えないとき (オフライン) だけキャッシュから返す。
 * → デプロイ後は次の起動で必ず最新バージョンになる
 */

const CACHE = 'my-jigsaw-puzzle-v8';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './puzzle.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // HTTP キャッシュを経由せず必ずサーバーへ再検証しに行く
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'no-cache' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  const cacheKey = req.mode === 'navigate' ? './index.html' : req;

  e.respondWith(
    // ネットワーク優先: cache:'no-cache' で HTTP キャッシュも再検証させる
    fetch(req.url, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(cacheKey, copy));
        }
        return res;
      })
      // オフライン時はキャッシュから
      .catch(() => caches.match(cacheKey))
  );
});
