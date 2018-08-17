(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

(function() {
  function toArray(arr) {
    return Array.prototype.slice.call(arr);
  }

  function promisifyRequest(request) {
    return new Promise(function(resolve, reject) {
      request.onsuccess = function() {
        resolve(request.result);
      };

      request.onerror = function() {
        reject(request.error);
      };
    });
  }

  function promisifyRequestCall(obj, method, args) {
    var request;
    var p = new Promise(function(resolve, reject) {
      request = obj[method].apply(obj, args);
      promisifyRequest(request).then(resolve, reject);
    });

    p.request = request;
    return p;
  }

  function promisifyCursorRequestCall(obj, method, args) {
    var p = promisifyRequestCall(obj, method, args);
    return p.then(function(value) {
      if (!value) return;
      return new Cursor(value, p.request);
    });
  }

  function proxyProperties(ProxyClass, targetProp, properties) {
    properties.forEach(function(prop) {
      Object.defineProperty(ProxyClass.prototype, prop, {
        get: function() {
          return this[targetProp][prop];
        },
        set: function(val) {
          this[targetProp][prop] = val;
        }
      });
    });
  }

  function proxyRequestMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return promisifyRequestCall(this[targetProp], prop, arguments);
      };
    });
  }

  function proxyMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return this[targetProp][prop].apply(this[targetProp], arguments);
      };
    });
  }

  function proxyCursorRequestMethods(ProxyClass, targetProp, Constructor, properties) {
    properties.forEach(function(prop) {
      if (!(prop in Constructor.prototype)) return;
      ProxyClass.prototype[prop] = function() {
        return promisifyCursorRequestCall(this[targetProp], prop, arguments);
      };
    });
  }

  function Index(index) {
    this._index = index;
  }

  proxyProperties(Index, '_index', [
    'name',
    'keyPath',
    'multiEntry',
    'unique'
  ]);

  proxyRequestMethods(Index, '_index', IDBIndex, [
    'get',
    'getKey',
    'getAll',
    'getAllKeys',
    'count'
  ]);

  proxyCursorRequestMethods(Index, '_index', IDBIndex, [
    'openCursor',
    'openKeyCursor'
  ]);

  function Cursor(cursor, request) {
    this._cursor = cursor;
    this._request = request;
  }

  proxyProperties(Cursor, '_cursor', [
    'direction',
    'key',
    'primaryKey',
    'value'
  ]);

  proxyRequestMethods(Cursor, '_cursor', IDBCursor, [
    'update',
    'delete'
  ]);

  // proxy 'next' methods
  ['advance', 'continue', 'continuePrimaryKey'].forEach(function(methodName) {
    if (!(methodName in IDBCursor.prototype)) return;
    Cursor.prototype[methodName] = function() {
      var cursor = this;
      var args = arguments;
      return Promise.resolve().then(function() {
        cursor._cursor[methodName].apply(cursor._cursor, args);
        return promisifyRequest(cursor._request).then(function(value) {
          if (!value) return;
          return new Cursor(value, cursor._request);
        });
      });
    };
  });

  function ObjectStore(store) {
    this._store = store;
  }

  ObjectStore.prototype.createIndex = function() {
    return new Index(this._store.createIndex.apply(this._store, arguments));
  };

  ObjectStore.prototype.index = function() {
    return new Index(this._store.index.apply(this._store, arguments));
  };

  proxyProperties(ObjectStore, '_store', [
    'name',
    'keyPath',
    'indexNames',
    'autoIncrement'
  ]);

  proxyRequestMethods(ObjectStore, '_store', IDBObjectStore, [
    'put',
    'add',
    'delete',
    'clear',
    'get',
    'getAll',
    'getKey',
    'getAllKeys',
    'count'
  ]);

  proxyCursorRequestMethods(ObjectStore, '_store', IDBObjectStore, [
    'openCursor',
    'openKeyCursor'
  ]);

  proxyMethods(ObjectStore, '_store', IDBObjectStore, [
    'deleteIndex'
  ]);

  function Transaction(idbTransaction) {
    this._tx = idbTransaction;
    this.complete = new Promise(function(resolve, reject) {
      idbTransaction.oncomplete = function() {
        resolve();
      };
      idbTransaction.onerror = function() {
        reject(idbTransaction.error);
      };
      idbTransaction.onabort = function() {
        reject(idbTransaction.error);
      };
    });
  }

  Transaction.prototype.objectStore = function() {
    return new ObjectStore(this._tx.objectStore.apply(this._tx, arguments));
  };

  proxyProperties(Transaction, '_tx', [
    'objectStoreNames',
    'mode'
  ]);

  proxyMethods(Transaction, '_tx', IDBTransaction, [
    'abort'
  ]);

  function UpgradeDB(db, oldVersion, transaction) {
    this._db = db;
    this.oldVersion = oldVersion;
    this.transaction = new Transaction(transaction);
  }

  UpgradeDB.prototype.createObjectStore = function() {
    return new ObjectStore(this._db.createObjectStore.apply(this._db, arguments));
  };

  proxyProperties(UpgradeDB, '_db', [
    'name',
    'version',
    'objectStoreNames'
  ]);

  proxyMethods(UpgradeDB, '_db', IDBDatabase, [
    'deleteObjectStore',
    'close'
  ]);

  function DB(db) {
    this._db = db;
  }

  DB.prototype.transaction = function() {
    return new Transaction(this._db.transaction.apply(this._db, arguments));
  };

  proxyProperties(DB, '_db', [
    'name',
    'version',
    'objectStoreNames'
  ]);

  proxyMethods(DB, '_db', IDBDatabase, [
    'close'
  ]);

  // Add cursor iterators
  // TODO: remove this once browsers do the right thing with promises
  ['openCursor', 'openKeyCursor'].forEach(function(funcName) {
    [ObjectStore, Index].forEach(function(Constructor) {
      // Don't create iterateKeyCursor if openKeyCursor doesn't exist.
      if (!(funcName in Constructor.prototype)) return;

      Constructor.prototype[funcName.replace('open', 'iterate')] = function() {
        var args = toArray(arguments);
        var callback = args[args.length - 1];
        var nativeObject = this._store || this._index;
        var request = nativeObject[funcName].apply(nativeObject, args.slice(0, -1));
        request.onsuccess = function() {
          callback(request.result);
        };
      };
    });
  });

  // polyfill getAll
  [Index, ObjectStore].forEach(function(Constructor) {
    if (Constructor.prototype.getAll) return;
    Constructor.prototype.getAll = function(query, count) {
      var instance = this;
      var items = [];

      return new Promise(function(resolve) {
        instance.iterateCursor(query, function(cursor) {
          if (!cursor) {
            resolve(items);
            return;
          }
          items.push(cursor.value);

          if (count !== undefined && items.length == count) {
            resolve(items);
            return;
          }
          cursor.continue();
        });
      });
    };
  });

  var exp = {
    open: function(name, version, upgradeCallback) {
      var p = promisifyRequestCall(indexedDB, 'open', [name, version]);
      var request = p.request;

      if (request) {
        request.onupgradeneeded = function(event) {
          if (upgradeCallback) {
            upgradeCallback(new UpgradeDB(request.result, event.oldVersion, request.transaction));
          }
        };
      }

      return p.then(function(db) {
        return new DB(db);
      });
    },
    delete: function(name) {
      return promisifyRequestCall(indexedDB, 'deleteDatabase', [name]);
    }
  };

  if (typeof module !== 'undefined') {
    module.exports = exp;
    module.exports.default = module.exports;
  }
  else {
    self.idb = exp;
  }
}());

},{}],2:[function(require,module,exports){
"use strict";

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

var _idb = require("idb");

var _idb2 = _interopRequireDefault(_idb);

var cacheID = "mws-restaruant-001";
var dbReady = false;

var dbPromise = _idb2["default"].open("fm-udacity-restaurant", 3, function (upgradeDB) {
  switch (upgradeDB.oldVersion) {
    case 0:
      upgradeDB.createObjectStore("restaurants", { keyPath: "id" });
    case 1:
      {
        var reviewsStore = upgradeDB.createObjectStore("reviews", { keyPath: "id" });
        reviewsStore.createIndex("restaurant_id", "restaurant_id");
      }
    case 2:
      upgradeDB.createObjectStore("pending", {
        keyPath: "id",
        autoIncrement: true
      });
  }
});

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(cacheID).then(function (cache) {
    return cache.addAll(["/", "/index.html", "/restaurant.html", "/review.html", "/css/basestyles.css", "/css/mainstyles.css", "/js/dbhelper.js", "/js/main.js", "/js/restaurant_info.js", "/js/review.js", "/img/na.png", "/js/register.js"])["catch"](function (error) {
      console.log("Caches open failed: " + error);
    });
  }));
});

self.addEventListener("fetch", function (event) {
  var cacheRequest = event.request;
  var cacheUrlObj = new URL(event.request.url);
  if (event.request.url.indexOf("restaurant.html") > -1) {
    var cacheURL = "restaurant.html";
    cacheRequest = new Request(cacheURL);
  }

  // Requests going to the API get handled separately from those going to other
  // destinations
  var checkURL = new URL(event.request.url);
  if (checkURL.port === "1337") {
    var parts = checkURL.pathname.split("/");
    var id = checkURL.searchParams.get("restaurant_id") - 0;
    if (!id) {
      if (checkURL.pathname.indexOf("restaurants")) {
        id = parts[parts.length - 1] === "restaurants" ? "-1" : parts[parts.length - 1];
      } else {
        id = checkURL.searchParams.get("restaurant_id");
      }
    }
    handleAJAXEvent(event, id);
  } else {
    handleNonAJAXEvent(event, cacheRequest);
  }
});

var handleAJAXEvent = function handleAJAXEvent(event, id) {
  // Only use caching for GET events
  if (event.request.method !== "GET") {
    return fetch(event.request).then(function (fetchResponse) {
      return fetchResponse.json();
    }).then(function (json) {
      return json;
    });
  }

  // Split these request for handling restaurants vs reviews
  if (event.request.url.indexOf("reviews") > -1) {
    handleReviewsEvent(event, id);
  } else {
    handleRestaurantEvent(event, id);
  }
};

var handleReviewsEvent = function handleReviewsEvent(event, id) {
  event.respondWith(dbPromise.then(function (db) {
    return db.transaction("reviews").objectStore("reviews").index("restaurant_id").getAll(id);
  }).then(function (data) {
    return data.length && data || fetch(event.request).then(function (fetchResponse) {
      return fetchResponse.json();
    }).then(function (data) {
      return dbPromise.then(function (idb) {
        var itx = idb.transaction("reviews", "readwrite");
        var store = itx.objectStore("reviews");
        data.forEach(function (review) {
          store.put({ id: review.id, "restaurant_id": review["restaurant_id"], data: review });
        });
        return data;
      });
    });
  }).then(function (finalResponse) {
    if (finalResponse[0].data) {
      // Need to transform the data to the proper format
      var mapResponse = finalResponse.map(function (review) {
        return review.data;
      });
      return new Response(JSON.stringify(mapResponse));
    }
    return new Response(JSON.stringify(finalResponse));
  })["catch"](function (error) {
    return new Response("Error fetching data", { status: 500 });
  }));
};

var handleRestaurantEvent = function handleRestaurantEvent(event, id) {
  // Check the IndexedDB to see if the JSON for the API has already been stored
  // there. If so, return that. If not, request it from the API, store it, and
  // then return it back.
  event.respondWith(dbPromise.then(function (db) {
    return db.transaction("restaurants").objectStore("restaurants").get(id);
  }).then(function (data) {
    return data && data.data || fetch(event.request).then(function (fetchResponse) {
      return fetchResponse.json();
    }).then(function (json) {
      return dbPromise.then(function (db) {
        var tx = db.transaction("restaurants", "readwrite");
        var store = tx.objectStore("restaurants");
        store.put({ id: id, data: json });
        return json;
      });
    });
  }).then(function (finalResponse) {
    return new Response(JSON.stringify(finalResponse));
  })["catch"](function (error) {
    return new Response("Error fetching data", { status: 500 });
  }));
};

var handleNonAJAXEvent = function handleNonAJAXEvent(event, cacheRequest) {
  // Check if the HTML request has previously been cached. If so, return the
  // response from the cache. If not, fetch the request, cache it, and then return
  // it.
  event.respondWith(caches.match(cacheRequest).then(function (response) {
    return response || fetch(event.request).then(function (fetchResponse) {
      return caches.open(cacheID).then(function (cache) {
        if (fetchResponse.url.indexOf("browser-sync") === -1) {
          cache.put(event.request, fetchResponse.clone());
        }
        return fetchResponse;
      });
    })["catch"](function (error) {
      if (event.request.url.indexOf(".jpg") > -1) {
        return caches.match("/img/na.png");
      }
      return new Response("Application is not connected to the internet", {
        status: 404,
        statusText: "Application is not connected to the internet"
      });
    });
  }));
};

},{"idb":1}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaWRiL2xpYi9pZGIuanMiLCJDOi9Vc2Vycy9tYTdtb3VkL0RvY3VtZW50cy9HaXRIdWIvbXdzLXJlc3RhdXJhbnQtc3RhZ2UtMi9zdGFnZVR3by9zdy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7OzttQkM1VGdCLEtBQUs7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QUFhLENBQUMsQ0FBQztPQUNwQztBQUNELGFBQU8sSUFBSSxRQUFRLENBQUMsOENBQThDLEVBQUU7QUFDbEUsY0FBTSxFQUFFLEdBQUc7QUFDWCxrQkFBVSxFQUFFLDhDQUE4QztPQUMzRCxDQUFDLENBQUM7S0FDSixDQUFDLENBQUU7R0FDTCxDQUFDLENBQUMsQ0FBQztDQUNMLENBQUMiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIndXNlIHN0cmljdCc7XG5cbihmdW5jdGlvbigpIHtcbiAgZnVuY3Rpb24gdG9BcnJheShhcnIpIHtcbiAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJyKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb21pc2lmeVJlcXVlc3QocmVxdWVzdCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgIHJlcXVlc3Qub25zdWNjZXNzID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlc29sdmUocmVxdWVzdC5yZXN1bHQpO1xuICAgICAgfTtcblxuICAgICAgcmVxdWVzdC5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlamVjdChyZXF1ZXN0LmVycm9yKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm9taXNpZnlSZXF1ZXN0Q2FsbChvYmosIG1ldGhvZCwgYXJncykge1xuICAgIHZhciByZXF1ZXN0O1xuICAgIHZhciBwID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICByZXF1ZXN0ID0gb2JqW21ldGhvZF0uYXBwbHkob2JqLCBhcmdzKTtcbiAgICAgIHByb21pc2lmeVJlcXVlc3QocmVxdWVzdCkudGhlbihyZXNvbHZlLCByZWplY3QpO1xuICAgIH0pO1xuXG4gICAgcC5yZXF1ZXN0ID0gcmVxdWVzdDtcbiAgICByZXR1cm4gcDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb21pc2lmeUN1cnNvclJlcXVlc3RDYWxsKG9iaiwgbWV0aG9kLCBhcmdzKSB7XG4gICAgdmFyIHAgPSBwcm9taXNpZnlSZXF1ZXN0Q2FsbChvYmosIG1ldGhvZCwgYXJncyk7XG4gICAgcmV0dXJuIHAudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgaWYgKCF2YWx1ZSkgcmV0dXJuO1xuICAgICAgcmV0dXJuIG5ldyBDdXJzb3IodmFsdWUsIHAucmVxdWVzdCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm94eVByb3BlcnRpZXMoUHJveHlDbGFzcywgdGFyZ2V0UHJvcCwgcHJvcGVydGllcykge1xuICAgIHByb3BlcnRpZXMuZm9yRWFjaChmdW5jdGlvbihwcm9wKSB7XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoUHJveHlDbGFzcy5wcm90b3R5cGUsIHByb3AsIHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICByZXR1cm4gdGhpc1t0YXJnZXRQcm9wXVtwcm9wXTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICB0aGlzW3RhcmdldFByb3BdW3Byb3BdID0gdmFsO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb3h5UmVxdWVzdE1ldGhvZHMoUHJveHlDbGFzcywgdGFyZ2V0UHJvcCwgQ29uc3RydWN0b3IsIHByb3BlcnRpZXMpIHtcbiAgICBwcm9wZXJ0aWVzLmZvckVhY2goZnVuY3Rpb24ocHJvcCkge1xuICAgICAgaWYgKCEocHJvcCBpbiBDb25zdHJ1Y3Rvci5wcm90b3R5cGUpKSByZXR1cm47XG4gICAgICBQcm94eUNsYXNzLnByb3RvdHlwZVtwcm9wXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gcHJvbWlzaWZ5UmVxdWVzdENhbGwodGhpc1t0YXJnZXRQcm9wXSwgcHJvcCwgYXJndW1lbnRzKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcm94eU1ldGhvZHMoUHJveHlDbGFzcywgdGFyZ2V0UHJvcCwgQ29uc3RydWN0b3IsIHByb3BlcnRpZXMpIHtcbiAgICBwcm9wZXJ0aWVzLmZvckVhY2goZnVuY3Rpb24ocHJvcCkge1xuICAgICAgaWYgKCEocHJvcCBpbiBDb25zdHJ1Y3Rvci5wcm90b3R5cGUpKSByZXR1cm47XG4gICAgICBQcm94eUNsYXNzLnByb3RvdHlwZVtwcm9wXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpc1t0YXJnZXRQcm9wXVtwcm9wXS5hcHBseSh0aGlzW3RhcmdldFByb3BdLCBhcmd1bWVudHMpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb3h5Q3Vyc29yUmVxdWVzdE1ldGhvZHMoUHJveHlDbGFzcywgdGFyZ2V0UHJvcCwgQ29uc3RydWN0b3IsIHByb3BlcnRpZXMpIHtcbiAgICBwcm9wZXJ0aWVzLmZvckVhY2goZnVuY3Rpb24ocHJvcCkge1xuICAgICAgaWYgKCEocHJvcCBpbiBDb25zdHJ1Y3Rvci5wcm90b3R5cGUpKSByZXR1cm47XG4gICAgICBQcm94eUNsYXNzLnByb3RvdHlwZVtwcm9wXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gcHJvbWlzaWZ5Q3Vyc29yUmVxdWVzdENhbGwodGhpc1t0YXJnZXRQcm9wXSwgcHJvcCwgYXJndW1lbnRzKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBJbmRleChpbmRleCkge1xuICAgIHRoaXMuX2luZGV4ID0gaW5kZXg7XG4gIH1cblxuICBwcm94eVByb3BlcnRpZXMoSW5kZXgsICdfaW5kZXgnLCBbXG4gICAgJ25hbWUnLFxuICAgICdrZXlQYXRoJyxcbiAgICAnbXVsdGlFbnRyeScsXG4gICAgJ3VuaXF1ZSdcbiAgXSk7XG5cbiAgcHJveHlSZXF1ZXN0TWV0aG9kcyhJbmRleCwgJ19pbmRleCcsIElEQkluZGV4LCBbXG4gICAgJ2dldCcsXG4gICAgJ2dldEtleScsXG4gICAgJ2dldEFsbCcsXG4gICAgJ2dldEFsbEtleXMnLFxuICAgICdjb3VudCdcbiAgXSk7XG5cbiAgcHJveHlDdXJzb3JSZXF1ZXN0TWV0aG9kcyhJbmRleCwgJ19pbmRleCcsIElEQkluZGV4LCBbXG4gICAgJ29wZW5DdXJzb3InLFxuICAgICdvcGVuS2V5Q3Vyc29yJ1xuICBdKTtcblxuICBmdW5jdGlvbiBDdXJzb3IoY3Vyc29yLCByZXF1ZXN0KSB7XG4gICAgdGhpcy5fY3Vyc29yID0gY3Vyc29yO1xuICAgIHRoaXMuX3JlcXVlc3QgPSByZXF1ZXN0O1xuICB9XG5cbiAgcHJveHlQcm9wZXJ0aWVzKEN1cnNvciwgJ19jdXJzb3InLCBbXG4gICAgJ2RpcmVjdGlvbicsXG4gICAgJ2tleScsXG4gICAgJ3ByaW1hcnlLZXknLFxuICAgICd2YWx1ZSdcbiAgXSk7XG5cbiAgcHJveHlSZXF1ZXN0TWV0aG9kcyhDdXJzb3IsICdfY3Vyc29yJywgSURCQ3Vyc29yLCBbXG4gICAgJ3VwZGF0ZScsXG4gICAgJ2RlbGV0ZSdcbiAgXSk7XG5cbiAgLy8gcHJveHkgJ25leHQnIG1ldGhvZHNcbiAgWydhZHZhbmNlJywgJ2NvbnRpbnVlJywgJ2NvbnRpbnVlUHJpbWFyeUtleSddLmZvckVhY2goZnVuY3Rpb24obWV0aG9kTmFtZSkge1xuICAgIGlmICghKG1ldGhvZE5hbWUgaW4gSURCQ3Vyc29yLnByb3RvdHlwZSkpIHJldHVybjtcbiAgICBDdXJzb3IucHJvdG90eXBlW21ldGhvZE5hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgY3Vyc29yID0gdGhpcztcbiAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIGN1cnNvci5fY3Vyc29yW21ldGhvZE5hbWVdLmFwcGx5KGN1cnNvci5fY3Vyc29yLCBhcmdzKTtcbiAgICAgICAgcmV0dXJuIHByb21pc2lmeVJlcXVlc3QoY3Vyc29yLl9yZXF1ZXN0KS50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgaWYgKCF2YWx1ZSkgcmV0dXJuO1xuICAgICAgICAgIHJldHVybiBuZXcgQ3Vyc29yKHZhbHVlLCBjdXJzb3IuX3JlcXVlc3QpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIE9iamVjdFN0b3JlKHN0b3JlKSB7XG4gICAgdGhpcy5fc3RvcmUgPSBzdG9yZTtcbiAgfVxuXG4gIE9iamVjdFN0b3JlLnByb3RvdHlwZS5jcmVhdGVJbmRleCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgSW5kZXgodGhpcy5fc3RvcmUuY3JlYXRlSW5kZXguYXBwbHkodGhpcy5fc3RvcmUsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIE9iamVjdFN0b3JlLnByb3RvdHlwZS5pbmRleCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgSW5kZXgodGhpcy5fc3RvcmUuaW5kZXguYXBwbHkodGhpcy5fc3RvcmUsIGFyZ3VtZW50cykpO1xuICB9O1xuXG4gIHByb3h5UHJvcGVydGllcyhPYmplY3RTdG9yZSwgJ19zdG9yZScsIFtcbiAgICAnbmFtZScsXG4gICAgJ2tleVBhdGgnLFxuICAgICdpbmRleE5hbWVzJyxcbiAgICAnYXV0b0luY3JlbWVudCdcbiAgXSk7XG5cbiAgcHJveHlSZXF1ZXN0TWV0aG9kcyhPYmplY3RTdG9yZSwgJ19zdG9yZScsIElEQk9iamVjdFN0b3JlLCBbXG4gICAgJ3B1dCcsXG4gICAgJ2FkZCcsXG4gICAgJ2RlbGV0ZScsXG4gICAgJ2NsZWFyJyxcbiAgICAnZ2V0JyxcbiAgICAnZ2V0QWxsJyxcbiAgICAnZ2V0S2V5JyxcbiAgICAnZ2V0QWxsS2V5cycsXG4gICAgJ2NvdW50J1xuICBdKTtcblxuICBwcm94eUN1cnNvclJlcXVlc3RNZXRob2RzKE9iamVjdFN0b3JlLCAnX3N0b3JlJywgSURCT2JqZWN0U3RvcmUsIFtcbiAgICAnb3BlbkN1cnNvcicsXG4gICAgJ29wZW5LZXlDdXJzb3InXG4gIF0pO1xuXG4gIHByb3h5TWV0aG9kcyhPYmplY3RTdG9yZSwgJ19zdG9yZScsIElEQk9iamVjdFN0b3JlLCBbXG4gICAgJ2RlbGV0ZUluZGV4J1xuICBdKTtcblxuICBmdW5jdGlvbiBUcmFuc2FjdGlvbihpZGJUcmFuc2FjdGlvbikge1xuICAgIHRoaXMuX3R4ID0gaWRiVHJhbnNhY3Rpb247XG4gICAgdGhpcy5jb21wbGV0ZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgaWRiVHJhbnNhY3Rpb24ub25jb21wbGV0ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXNvbHZlKCk7XG4gICAgICB9O1xuICAgICAgaWRiVHJhbnNhY3Rpb24ub25lcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZWplY3QoaWRiVHJhbnNhY3Rpb24uZXJyb3IpO1xuICAgICAgfTtcbiAgICAgIGlkYlRyYW5zYWN0aW9uLm9uYWJvcnQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVqZWN0KGlkYlRyYW5zYWN0aW9uLmVycm9yKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBUcmFuc2FjdGlvbi5wcm90b3R5cGUub2JqZWN0U3RvcmUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IE9iamVjdFN0b3JlKHRoaXMuX3R4Lm9iamVjdFN0b3JlLmFwcGx5KHRoaXMuX3R4LCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBwcm94eVByb3BlcnRpZXMoVHJhbnNhY3Rpb24sICdfdHgnLCBbXG4gICAgJ29iamVjdFN0b3JlTmFtZXMnLFxuICAgICdtb2RlJ1xuICBdKTtcblxuICBwcm94eU1ldGhvZHMoVHJhbnNhY3Rpb24sICdfdHgnLCBJREJUcmFuc2FjdGlvbiwgW1xuICAgICdhYm9ydCdcbiAgXSk7XG5cbiAgZnVuY3Rpb24gVXBncmFkZURCKGRiLCBvbGRWZXJzaW9uLCB0cmFuc2FjdGlvbikge1xuICAgIHRoaXMuX2RiID0gZGI7XG4gICAgdGhpcy5vbGRWZXJzaW9uID0gb2xkVmVyc2lvbjtcbiAgICB0aGlzLnRyYW5zYWN0aW9uID0gbmV3IFRyYW5zYWN0aW9uKHRyYW5zYWN0aW9uKTtcbiAgfVxuXG4gIFVwZ3JhZGVEQi5wcm90b3R5cGUuY3JlYXRlT2JqZWN0U3RvcmUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IE9iamVjdFN0b3JlKHRoaXMuX2RiLmNyZWF0ZU9iamVjdFN0b3JlLmFwcGx5KHRoaXMuX2RiLCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBwcm94eVByb3BlcnRpZXMoVXBncmFkZURCLCAnX2RiJywgW1xuICAgICduYW1lJyxcbiAgICAndmVyc2lvbicsXG4gICAgJ29iamVjdFN0b3JlTmFtZXMnXG4gIF0pO1xuXG4gIHByb3h5TWV0aG9kcyhVcGdyYWRlREIsICdfZGInLCBJREJEYXRhYmFzZSwgW1xuICAgICdkZWxldGVPYmplY3RTdG9yZScsXG4gICAgJ2Nsb3NlJ1xuICBdKTtcblxuICBmdW5jdGlvbiBEQihkYikge1xuICAgIHRoaXMuX2RiID0gZGI7XG4gIH1cblxuICBEQi5wcm90b3R5cGUudHJhbnNhY3Rpb24gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IFRyYW5zYWN0aW9uKHRoaXMuX2RiLnRyYW5zYWN0aW9uLmFwcGx5KHRoaXMuX2RiLCBhcmd1bWVudHMpKTtcbiAgfTtcblxuICBwcm94eVByb3BlcnRpZXMoREIsICdfZGInLCBbXG4gICAgJ25hbWUnLFxuICAgICd2ZXJzaW9uJyxcbiAgICAnb2JqZWN0U3RvcmVOYW1lcydcbiAgXSk7XG5cbiAgcHJveHlNZXRob2RzKERCLCAnX2RiJywgSURCRGF0YWJhc2UsIFtcbiAgICAnY2xvc2UnXG4gIF0pO1xuXG4gIC8vIEFkZCBjdXJzb3IgaXRlcmF0b3JzXG4gIC8vIFRPRE86IHJlbW92ZSB0aGlzIG9uY2UgYnJvd3NlcnMgZG8gdGhlIHJpZ2h0IHRoaW5nIHdpdGggcHJvbWlzZXNcbiAgWydvcGVuQ3Vyc29yJywgJ29wZW5LZXlDdXJzb3InXS5mb3JFYWNoKGZ1bmN0aW9uKGZ1bmNOYW1lKSB7XG4gICAgW09iamVjdFN0b3JlLCBJbmRleF0uZm9yRWFjaChmdW5jdGlvbihDb25zdHJ1Y3Rvcikge1xuICAgICAgLy8gRG9uJ3QgY3JlYXRlIGl0ZXJhdGVLZXlDdXJzb3IgaWYgb3BlbktleUN1cnNvciBkb2Vzbid0IGV4aXN0LlxuICAgICAgaWYgKCEoZnVuY05hbWUgaW4gQ29uc3RydWN0b3IucHJvdG90eXBlKSkgcmV0dXJuO1xuXG4gICAgICBDb25zdHJ1Y3Rvci5wcm90b3R5cGVbZnVuY05hbWUucmVwbGFjZSgnb3BlbicsICdpdGVyYXRlJyldID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBhcmdzID0gdG9BcnJheShhcmd1bWVudHMpO1xuICAgICAgICB2YXIgY2FsbGJhY2sgPSBhcmdzW2FyZ3MubGVuZ3RoIC0gMV07XG4gICAgICAgIHZhciBuYXRpdmVPYmplY3QgPSB0aGlzLl9zdG9yZSB8fCB0aGlzLl9pbmRleDtcbiAgICAgICAgdmFyIHJlcXVlc3QgPSBuYXRpdmVPYmplY3RbZnVuY05hbWVdLmFwcGx5KG5hdGl2ZU9iamVjdCwgYXJncy5zbGljZSgwLCAtMSkpO1xuICAgICAgICByZXF1ZXN0Lm9uc3VjY2VzcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgIGNhbGxiYWNrKHJlcXVlc3QucmVzdWx0KTtcbiAgICAgICAgfTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIHBvbHlmaWxsIGdldEFsbFxuICBbSW5kZXgsIE9iamVjdFN0b3JlXS5mb3JFYWNoKGZ1bmN0aW9uKENvbnN0cnVjdG9yKSB7XG4gICAgaWYgKENvbnN0cnVjdG9yLnByb3RvdHlwZS5nZXRBbGwpIHJldHVybjtcbiAgICBDb25zdHJ1Y3Rvci5wcm90b3R5cGUuZ2V0QWxsID0gZnVuY3Rpb24ocXVlcnksIGNvdW50KSB7XG4gICAgICB2YXIgaW5zdGFuY2UgPSB0aGlzO1xuICAgICAgdmFyIGl0ZW1zID0gW107XG5cbiAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlKSB7XG4gICAgICAgIGluc3RhbmNlLml0ZXJhdGVDdXJzb3IocXVlcnksIGZ1bmN0aW9uKGN1cnNvcikge1xuICAgICAgICAgIGlmICghY3Vyc29yKSB7XG4gICAgICAgICAgICByZXNvbHZlKGl0ZW1zKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgaXRlbXMucHVzaChjdXJzb3IudmFsdWUpO1xuXG4gICAgICAgICAgaWYgKGNvdW50ICE9PSB1bmRlZmluZWQgJiYgaXRlbXMubGVuZ3RoID09IGNvdW50KSB7XG4gICAgICAgICAgICByZXNvbHZlKGl0ZW1zKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgY3Vyc29yLmNvbnRpbnVlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfTtcbiAgfSk7XG5cbiAgdmFyIGV4cCA9IHtcbiAgICBvcGVuOiBmdW5jdGlvbihuYW1lLCB2ZXJzaW9uLCB1cGdyYWRlQ2FsbGJhY2spIHtcbiAgICAgIHZhciBwID0gcHJvbWlzaWZ5UmVxdWVzdENhbGwoaW5kZXhlZERCLCAnb3BlbicsIFtuYW1lLCB2ZXJzaW9uXSk7XG4gICAgICB2YXIgcmVxdWVzdCA9IHAucmVxdWVzdDtcblxuICAgICAgaWYgKHJlcXVlc3QpIHtcbiAgICAgICAgcmVxdWVzdC5vbnVwZ3JhZGVuZWVkZWQgPSBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAgIGlmICh1cGdyYWRlQ2FsbGJhY2spIHtcbiAgICAgICAgICAgIHVwZ3JhZGVDYWxsYmFjayhuZXcgVXBncmFkZURCKHJlcXVlc3QucmVzdWx0LCBldmVudC5vbGRWZXJzaW9uLCByZXF1ZXN0LnRyYW5zYWN0aW9uKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcC50aGVuKGZ1bmN0aW9uKGRiKSB7XG4gICAgICAgIHJldHVybiBuZXcgREIoZGIpO1xuICAgICAgfSk7XG4gICAgfSxcbiAgICBkZWxldGU6IGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIHJldHVybiBwcm9taXNpZnlSZXF1ZXN0Q2FsbChpbmRleGVkREIsICdkZWxldGVEYXRhYmFzZScsIFtuYW1lXSk7XG4gICAgfVxuICB9O1xuXG4gIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZXhwO1xuICAgIG1vZHVsZS5leHBvcnRzLmRlZmF1bHQgPSBtb2R1bGUuZXhwb3J0cztcbiAgfVxuICBlbHNlIHtcbiAgICBzZWxmLmlkYiA9IGV4cDtcbiAgfVxufSgpKTtcbiIsImltcG9ydCBpZGIgZnJvbSBcImlkYlwiO1xuXG52YXIgY2FjaGVJRCA9IFwibXdzLXJlc3RhcnVhbnQtMDAxXCI7XG5sZXQgZGJSZWFkeSA9IGZhbHNlO1xuXG5jb25zdCBkYlByb21pc2UgPSBpZGIub3BlbihcImZtLXVkYWNpdHktcmVzdGF1cmFudFwiLCAzLCB1cGdyYWRlREIgPT4ge1xuICBzd2l0Y2ggKHVwZ3JhZGVEQi5vbGRWZXJzaW9uKSB7XG4gICAgY2FzZSAwOlxuICAgICAgdXBncmFkZURCLmNyZWF0ZU9iamVjdFN0b3JlKFwicmVzdGF1cmFudHNcIiwge2tleVBhdGg6IFwiaWRcIn0pO1xuICAgIGNhc2UgMTpcbiAgICAgIHtcbiAgICAgICAgY29uc3QgcmV2aWV3c1N0b3JlID0gdXBncmFkZURCLmNyZWF0ZU9iamVjdFN0b3JlKFwicmV2aWV3c1wiLCB7a2V5UGF0aDogXCJpZFwifSk7XG4gICAgICAgIHJldmlld3NTdG9yZS5jcmVhdGVJbmRleChcInJlc3RhdXJhbnRfaWRcIiwgXCJyZXN0YXVyYW50X2lkXCIpO1xuICAgICAgfVxuICAgIGNhc2UgMjpcbiAgICAgIHVwZ3JhZGVEQi5jcmVhdGVPYmplY3RTdG9yZShcInBlbmRpbmdcIiwge1xuICAgICAgICBrZXlQYXRoOiBcImlkXCIsXG4gICAgICAgIGF1dG9JbmNyZW1lbnQ6IHRydWVcbiAgICAgIH0pO1xuICB9XG59KTtcblxuc2VsZi5hZGRFdmVudExpc3RlbmVyKFwiaW5zdGFsbFwiLCBldmVudCA9PiB7XG4gIGV2ZW50LndhaXRVbnRpbChjYWNoZXMub3BlbihjYWNoZUlEKS50aGVuKGNhY2hlID0+IHtcbiAgICByZXR1cm4gY2FjaGVcbiAgICAgIC5hZGRBbGwoW1xuICAgICAgXCIvXCIsXG4gICAgICBcIi9pbmRleC5odG1sXCIsXG4gICAgICBcIi9yZXN0YXVyYW50Lmh0bWxcIixcbiAgICAgIFwiL3Jldmlldy5odG1sXCIsXG4gICAgICBcIi9jc3MvYmFzZXN0eWxlcy5jc3NcIixcbiAgICAgIFwiL2Nzcy9tYWluc3R5bGVzLmNzc1wiLFxuICAgICAgXCIvanMvZGJoZWxwZXIuanNcIixcbiAgICAgIFwiL2pzL21haW4uanNcIixcbiAgICAgIFwiL2pzL3Jlc3RhdXJhbnRfaW5mby5qc1wiLFxuICAgICAgXCIvanMvcmV2aWV3LmpzXCIsXG4gICAgICBcIi9pbWcvbmEucG5nXCIsXG4gICAgICBcIi9qcy9yZWdpc3Rlci5qc1wiXG4gICAgXSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiQ2FjaGVzIG9wZW4gZmFpbGVkOiBcIiArIGVycm9yKTtcbiAgICAgIH0pO1xuICB9KSk7XG59KTtcblxuc2VsZi5hZGRFdmVudExpc3RlbmVyKFwiZmV0Y2hcIiwgZXZlbnQgPT4ge1xuICBsZXQgY2FjaGVSZXF1ZXN0ID0gZXZlbnQucmVxdWVzdDtcbiAgbGV0IGNhY2hlVXJsT2JqID0gbmV3IFVSTChldmVudC5yZXF1ZXN0LnVybCk7XG4gIGlmIChldmVudC5yZXF1ZXN0LnVybC5pbmRleE9mKFwicmVzdGF1cmFudC5odG1sXCIpID4gLTEpIHtcbiAgICBjb25zdCBjYWNoZVVSTCA9IFwicmVzdGF1cmFudC5odG1sXCI7XG4gICAgY2FjaGVSZXF1ZXN0ID0gbmV3IFJlcXVlc3QoY2FjaGVVUkwpO1xuICB9XG5cbiAgLy8gUmVxdWVzdHMgZ29pbmcgdG8gdGhlIEFQSSBnZXQgaGFuZGxlZCBzZXBhcmF0ZWx5IGZyb20gdGhvc2UgZ29pbmcgdG8gb3RoZXJcbiAgLy8gZGVzdGluYXRpb25zXG4gIGNvbnN0IGNoZWNrVVJMID0gbmV3IFVSTChldmVudC5yZXF1ZXN0LnVybCk7XG4gIGlmIChjaGVja1VSTC5wb3J0ID09PSBcIjEzMzdcIikge1xuICAgIGNvbnN0IHBhcnRzID0gY2hlY2tVUkxcbiAgICAgIC5wYXRobmFtZVxuICAgICAgLnNwbGl0KFwiL1wiKTtcbiAgICBsZXQgaWQgPSBjaGVja1VSTFxuICAgICAgLnNlYXJjaFBhcmFtc1xuICAgICAgLmdldChcInJlc3RhdXJhbnRfaWRcIikgLSAwO1xuICAgIGlmICghaWQpIHtcbiAgICAgIGlmIChjaGVja1VSTC5wYXRobmFtZS5pbmRleE9mKFwicmVzdGF1cmFudHNcIikpIHtcbiAgICAgICAgaWQgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXSA9PT0gXCJyZXN0YXVyYW50c1wiXG4gICAgICAgICAgPyBcIi0xXCJcbiAgICAgICAgICA6IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWQgPSBjaGVja1VSTFxuICAgICAgICAgIC5zZWFyY2hQYXJhbXNcbiAgICAgICAgICAuZ2V0KFwicmVzdGF1cmFudF9pZFwiKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaGFuZGxlQUpBWEV2ZW50KGV2ZW50LCBpZCk7XG4gIH0gZWxzZSB7XG4gICAgaGFuZGxlTm9uQUpBWEV2ZW50KGV2ZW50LCBjYWNoZVJlcXVlc3QpO1xuICB9XG59KTtcblxuY29uc3QgaGFuZGxlQUpBWEV2ZW50ID0gKGV2ZW50LCBpZCkgPT4ge1xuICAvLyBPbmx5IHVzZSBjYWNoaW5nIGZvciBHRVQgZXZlbnRzXG4gIGlmIChldmVudC5yZXF1ZXN0Lm1ldGhvZCAhPT0gXCJHRVRcIikge1xuICAgIHJldHVybiBmZXRjaChldmVudC5yZXF1ZXN0KVxuICAgICAgLnRoZW4oZmV0Y2hSZXNwb25zZSA9PiBmZXRjaFJlc3BvbnNlLmpzb24oKSlcbiAgICAgIC50aGVuKGpzb24gPT4ge1xuICAgICAgICByZXR1cm4ganNvblxuICAgICAgfSk7XG4gIH1cblxuICAvLyBTcGxpdCB0aGVzZSByZXF1ZXN0IGZvciBoYW5kbGluZyByZXN0YXVyYW50cyB2cyByZXZpZXdzXG4gIGlmIChldmVudC5yZXF1ZXN0LnVybC5pbmRleE9mKFwicmV2aWV3c1wiKSA+IC0xKSB7XG4gICAgaGFuZGxlUmV2aWV3c0V2ZW50KGV2ZW50LCBpZCk7XG4gIH0gZWxzZSB7XG4gICAgaGFuZGxlUmVzdGF1cmFudEV2ZW50KGV2ZW50LCBpZCk7XG4gIH1cbn1cblxuY29uc3QgaGFuZGxlUmV2aWV3c0V2ZW50ID0gKGV2ZW50LCBpZCkgPT4ge1xuICBldmVudC5yZXNwb25kV2l0aChkYlByb21pc2UudGhlbihkYiA9PiB7XG4gICAgcmV0dXJuIGRiXG4gICAgICAudHJhbnNhY3Rpb24oXCJyZXZpZXdzXCIpXG4gICAgICAub2JqZWN0U3RvcmUoXCJyZXZpZXdzXCIpXG4gICAgICAuaW5kZXgoXCJyZXN0YXVyYW50X2lkXCIpXG4gICAgICAuZ2V0QWxsKGlkKTtcbiAgfSkudGhlbihkYXRhID0+IHtcbiAgICByZXR1cm4gKGRhdGEubGVuZ3RoICYmIGRhdGEpIHx8IGZldGNoKGV2ZW50LnJlcXVlc3QpXG4gICAgICAudGhlbihmZXRjaFJlc3BvbnNlID0+IGZldGNoUmVzcG9uc2UuanNvbigpKVxuICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgIHJldHVybiBkYlByb21pc2UudGhlbihpZGIgPT4ge1xuICAgICAgICAgIGNvbnN0IGl0eCA9IGlkYi50cmFuc2FjdGlvbihcInJldmlld3NcIiwgXCJyZWFkd3JpdGVcIik7XG4gICAgICAgICAgY29uc3Qgc3RvcmUgPSBpdHgub2JqZWN0U3RvcmUoXCJyZXZpZXdzXCIpO1xuICAgICAgICAgIGRhdGEuZm9yRWFjaChyZXZpZXcgPT4ge1xuICAgICAgICAgICAgc3RvcmUucHV0KHtpZDogcmV2aWV3LmlkLCBcInJlc3RhdXJhbnRfaWRcIjogcmV2aWV3W1wicmVzdGF1cmFudF9pZFwiXSwgZGF0YTogcmV2aWV3fSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICByZXR1cm4gZGF0YTtcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gIH0pLnRoZW4oZmluYWxSZXNwb25zZSA9PiB7XG4gICAgaWYgKGZpbmFsUmVzcG9uc2VbMF0uZGF0YSkge1xuICAgICAgLy8gTmVlZCB0byB0cmFuc2Zvcm0gdGhlIGRhdGEgdG8gdGhlIHByb3BlciBmb3JtYXRcbiAgICAgIGNvbnN0IG1hcFJlc3BvbnNlID0gZmluYWxSZXNwb25zZS5tYXAocmV2aWV3ID0+IHJldmlldy5kYXRhKTtcbiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkobWFwUmVzcG9uc2UpKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeShmaW5hbFJlc3BvbnNlKSk7XG4gIH0pLmNhdGNoKGVycm9yID0+IHtcbiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKFwiRXJyb3IgZmV0Y2hpbmcgZGF0YVwiLCB7c3RhdHVzOiA1MDB9KVxuICB9KSlcbn1cblxuY29uc3QgaGFuZGxlUmVzdGF1cmFudEV2ZW50ID0gKGV2ZW50LCBpZCkgPT4ge1xuICAvLyBDaGVjayB0aGUgSW5kZXhlZERCIHRvIHNlZSBpZiB0aGUgSlNPTiBmb3IgdGhlIEFQSSBoYXMgYWxyZWFkeSBiZWVuIHN0b3JlZFxuICAvLyB0aGVyZS4gSWYgc28sIHJldHVybiB0aGF0LiBJZiBub3QsIHJlcXVlc3QgaXQgZnJvbSB0aGUgQVBJLCBzdG9yZSBpdCwgYW5kXG4gIC8vIHRoZW4gcmV0dXJuIGl0IGJhY2suXG4gIGV2ZW50LnJlc3BvbmRXaXRoKGRiUHJvbWlzZS50aGVuKGRiID0+IHtcbiAgICByZXR1cm4gZGJcbiAgICAgIC50cmFuc2FjdGlvbihcInJlc3RhdXJhbnRzXCIpXG4gICAgICAub2JqZWN0U3RvcmUoXCJyZXN0YXVyYW50c1wiKVxuICAgICAgLmdldChpZCk7XG4gIH0pLnRoZW4oZGF0YSA9PiB7XG4gICAgcmV0dXJuIChkYXRhICYmIGRhdGEuZGF0YSkgfHwgZmV0Y2goZXZlbnQucmVxdWVzdClcbiAgICAgIC50aGVuKGZldGNoUmVzcG9uc2UgPT4gZmV0Y2hSZXNwb25zZS5qc29uKCkpXG4gICAgICAudGhlbihqc29uID0+IHtcbiAgICAgICAgcmV0dXJuIGRiUHJvbWlzZS50aGVuKGRiID0+IHtcbiAgICAgICAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKFwicmVzdGF1cmFudHNcIiwgXCJyZWFkd3JpdGVcIik7XG4gICAgICAgICAgY29uc3Qgc3RvcmUgPSB0eC5vYmplY3RTdG9yZShcInJlc3RhdXJhbnRzXCIpO1xuICAgICAgICAgIHN0b3JlLnB1dCh7aWQ6IGlkLCBkYXRhOiBqc29ufSk7XG4gICAgICAgICAgcmV0dXJuIGpzb247XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH0pLnRoZW4oZmluYWxSZXNwb25zZSA9PiB7XG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeShmaW5hbFJlc3BvbnNlKSk7XG4gIH0pLmNhdGNoKGVycm9yID0+IHtcbiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKFwiRXJyb3IgZmV0Y2hpbmcgZGF0YVwiLCB7c3RhdHVzOiA1MDB9KTtcbiAgfSkpO1xufTtcblxuY29uc3QgaGFuZGxlTm9uQUpBWEV2ZW50ID0gKGV2ZW50LCBjYWNoZVJlcXVlc3QpID0+IHtcbiAgLy8gQ2hlY2sgaWYgdGhlIEhUTUwgcmVxdWVzdCBoYXMgcHJldmlvdXNseSBiZWVuIGNhY2hlZC4gSWYgc28sIHJldHVybiB0aGVcbiAgLy8gcmVzcG9uc2UgZnJvbSB0aGUgY2FjaGUuIElmIG5vdCwgZmV0Y2ggdGhlIHJlcXVlc3QsIGNhY2hlIGl0LCBhbmQgdGhlbiByZXR1cm5cbiAgLy8gaXQuXG4gIGV2ZW50LnJlc3BvbmRXaXRoKGNhY2hlcy5tYXRjaChjYWNoZVJlcXVlc3QpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHJldHVybiAocmVzcG9uc2UgfHwgZmV0Y2goZXZlbnQucmVxdWVzdCkudGhlbihmZXRjaFJlc3BvbnNlID0+IHtcbiAgICAgIHJldHVybiBjYWNoZXNcbiAgICAgICAgLm9wZW4oY2FjaGVJRClcbiAgICAgICAgLnRoZW4oY2FjaGUgPT4ge1xuICAgICAgICAgIGlmIChmZXRjaFJlc3BvbnNlLnVybC5pbmRleE9mKFwiYnJvd3Nlci1zeW5jXCIpID09PSAtMSkge1xuICAgICAgICAgICAgY2FjaGUucHV0KGV2ZW50LnJlcXVlc3QsIGZldGNoUmVzcG9uc2UuY2xvbmUoKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBmZXRjaFJlc3BvbnNlO1xuICAgICAgICB9KTtcbiAgICB9KS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBpZiAoZXZlbnQucmVxdWVzdC51cmwuaW5kZXhPZihcIi5qcGdcIikgPiAtMSkge1xuICAgICAgICByZXR1cm4gY2FjaGVzLm1hdGNoKFwiL2ltZy9uYS5wbmdcIik7XG4gICAgICB9XG4gICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKFwiQXBwbGljYXRpb24gaXMgbm90IGNvbm5lY3RlZCB0byB0aGUgaW50ZXJuZXRcIiwge1xuICAgICAgICBzdGF0dXM6IDQwNCxcbiAgICAgICAgc3RhdHVzVGV4dDogXCJBcHBsaWNhdGlvbiBpcyBub3QgY29ubmVjdGVkIHRvIHRoZSBpbnRlcm5ldFwiXG4gICAgICB9KTtcbiAgICB9KSk7XG4gIH0pKTtcbn07XG4iXX0=
