var CACHE_VERSION = 'restaurants-001';
var CACHE_FILES = [
    './',
    '/index.html',
	'/register.js',
	'/sw.js',
    '/restaurant.html',
    '/css/',
    '/css/styles.css',
    '/js/',
    '/js/restaurant_info.js',
    '/js/dbhelper.js',
    '/js/main.js',
	'/js/idb.js',
    '/img/',
    '/img/1.jpg',
    '/img/2.jpg',
    '/img/3.jpg',
    '/img/4.jpg',
    '/img/5.jpg',
    '/img/6.jpg',
    '/img/7.jpg',
    '/img/8.jpg',
    '/img/9.jpg',
    '/img/10.jpg',
    '/Icons/travel management.ico',
	'/Icons/Crpetas Coffe PAris By Canelita309 (4).png'];

    self.addEventListener('install', function (event) {
        event.waitUntil(
            caches.open(CACHE_VERSION)
                .then(function (cache) {
                    return cache.addAll(CACHE_FILES);
                })
        );
    });
    self.addEventListener('fetch', function(event) {
      event.respondWith(
        caches.match(event.request)
          .then(function(response) {
            // Cache hit - return response
            if (response) {
              console.log('Fetch cache');
              return response;
            }

            // IMPORTANT: Clone the request. A request is a stream and
            // can only be consumed once. Since we are consuming this
            // once by cache and once by the browser for fetch, we need
            // to clone the response.
            var fetchRequest = event.request.clone();

            return fetch(fetchRequest).then(
              function(response) {
                // Check if we received a valid response
                if(!response || response.status !== 200 || response.type !== 'basic') {
                  return response;
                }

                // IMPORTANT: Clone the response. A response is a stream
                // and because we want the browser to consume the response
                // as well as the cache consuming the response, we need
                // to clone it so we have two streams.
                var responseToCache = response.clone();

                caches.open(CACHE_VERSION)
                  .then(function(cache) {
                    cache.put(event.request, responseToCache);
                  });

                return response;
              }
            );
          })
        );
    });

    self.addEventListener('activate', function(event) {

      var cacheWhitelist = ['pages-cache-v1'];

      event.waitUntil(
        caches.keys().then(function(cacheNames) {
          return Promise.all(
            cacheNames.map(function(cacheName) {
              if (cacheWhitelist.indexOf(cacheName) === -1) {
                return caches.delete(cacheName);
              }
            })
          );
        })
      );
    });
