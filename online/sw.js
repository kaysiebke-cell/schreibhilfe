/* Service Worker: legt die App im Handy ab, damit sie ohne Internet startet. */

/* Die Nummer MUSS hoch, sobald sich eine der Dateien unten ändert. Bleibt sie
   stehen, sieht der Browser keinen neuen Service Worker, füllt kein neues Lager
   und liefert die alte Fassung weiter aus — die neue Datei liegt auf dem Server
   und kommt trotzdem nie an. Beim Umbau auf das neue Layout ist genau das
   passiert: style.css, index.html und app.js waren neu, die Nummer nicht. */
const LAGER = 'schreibhilfe-v40';

const DATEIEN = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/systempruefer.js',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './manifest.webmanifest',
];

/* Beim Einrichten wird das neue Lager gefüllt — und zwar AUS DEM NETZ.

   Ohne „cache: 'reload'“ darf der Browser die Dateien aus seinem eigenen alten
   Zwischenspeicher nehmen. Dann trägt das frische Lager die alten Dateien, und
   weil unten zuerst im Lager nachgesehen wird, bleibt die alte Fassung für
   immer kleben. Genau das ist am PC passiert: Die neue Datei lag längst auf
   dem Server, im Browser kam sie nie an. */
self.addEventListener('install', (ereignis) => {
  ereignis.waitUntil(
    caches.open(LAGER)
      .then((lager) => lager.addAll(
        DATEIEN.map((datei) => new Request(datei, { cache: 'reload' }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ereignis) => {
  ereignis.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== LAGER).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ereignis) => {
  const anfrage = ereignis.request;

  // Nur eigene Dateien bedienen. Die KI-Anfragen gehen immer direkt ins Netz.
  if (anfrage.method !== 'GET' || new URL(anfrage.url).origin !== location.origin) return;

  ereignis.respondWith(
    caches.match(anfrage).then((ausLager) => {
      if (ausLager) return ausLager;
      return fetch(anfrage)
        .then((antwort) => {
          // Frisch geholte eigene Dateien mit ins Lager legen.
          if (antwort.ok) {
            const kopie = antwort.clone();
            caches.open(LAGER).then((lager) => lager.put(anfrage, kopie));
          }
          return antwort;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
