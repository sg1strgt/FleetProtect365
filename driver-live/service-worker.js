const CACHE_NAME = "fp365-driver-v1.11.1-message-replies-1";

const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./fedex-locations.css",
  "./messages.css",
  "./message-replies.css",
  "./app.js",
  "./fedex-locations.js",
  "./messages.js",
  "./config.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(windows => {
    const existing=windows.find(client=>"focus" in client);
    return existing ? existing.focus() : clients.openWindow("./");
  }));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response || response.status !== 200 || response.type === "opaque") return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
