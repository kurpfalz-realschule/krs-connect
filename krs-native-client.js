/*!
 * krs-native-client.js — Gegenstück zu krs-native.js für Module im iframe
 * Kurpfalz-Realschule Schriesheim · gehört ins Repo krs-connect, neben index.html
 *
 * ------------------------------------------------------------------------
 * GRUNDREGEL: Läuft KRS Connect im Browser oder als eigenständige Seite,
 * verändert diese Datei nichts. Sie wird nur aktiv, wenn Connect als Modul
 * im nativen Hub steckt.
 * ------------------------------------------------------------------------
 *
 * Hintergrund: Capacitor spritzt seine Brücke ausschließlich in den obersten
 * Rahmen ein. Connect läuft im iframe und sieht `window.Capacitor` deshalb
 * NICHT — obwohl es in der App läuft. Ohne diese Datei würde Connect denken,
 * es sei ein normaler Browser, und weiter die Web-Notification-API benutzen,
 * die im WKWebView nicht existiert.
 *
 * Version: 1.0.0
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var HUB_ORIGIN = 'https://kurpfalz-realschule.github.io';
  var TIMEOUT_MS = 5000;

  var inFrame = window.parent && window.parent !== window;

  // Fallback-Objekt, solange (oder falls) sich der Hub nicht meldet.
  var api = {
    version: VERSION,
    available: false,
    platform: 'web',
    ready: null,
    haptic: function () { return Promise.resolve(null); },
    openExternal: function (url) { window.open(url, '_blank', 'noopener'); return Promise.resolve(true); },
    share: function () { return Promise.resolve(null); },
    enablePush: function () { return Promise.resolve({ ok: false, reason: 'web' }); },
    pushStatus: function () { return Promise.resolve({ token: null }); }
  };
  window.KRSNative = window.KRSNative || api;

  if (!inFrame) { api.ready = Promise.resolve(false); return; }

  // ── RPC ────────────────────────────────────────────────────
  var seq = 0;
  var pending = {};

  window.addEventListener('message', function (ev) {
    if (ev.origin !== HUB_ORIGIN) return;
    var m = ev.data;
    if (!m || m.type !== 'KRS_NATIVE_RPC_RESULT' || !pending[m.id]) return;
    var p = pending[m.id];
    delete pending[m.id];
    clearTimeout(p.timer);
    if (m.ok) p.resolve(m.value); else p.reject(new Error(m.error || 'RPC fehlgeschlagen'));
  });

  function rpc(method, args) {
    return new Promise(function (resolve, reject) {
      var id = 'r' + (++seq) + '_' + Date.now();
      pending[id] = {
        resolve: resolve, reject: reject,
        // Ohne Zeitlimit würde ein hängender Aufruf die Oberfläche blockieren.
        timer: setTimeout(function () {
          delete pending[id];
          reject(new Error('Zeitüberschreitung bei ' + method));
        }, TIMEOUT_MS)
      };
      try {
        window.parent.postMessage({ type: 'KRS_NATIVE_RPC', id: id, method: method, args: args || {} },
                                  HUB_ORIGIN);
      } catch (e) {
        clearTimeout(pending[id].timer); delete pending[id]; reject(e);
      }
    });
  }

  // ── Handschlag: läuft der Hub nativ? ───────────────────────
  api.ready = new Promise(function (resolve) {
    var done = false;
    function finish(native) {
      if (done) return; done = true;
      api.available = native;
      api.platform = native ? 'ios' : 'web';
      if (native) {
        api.haptic = function (style) { return rpc('haptic', { style: style || 'MEDIUM' }); };
        api.openExternal = function (url) { return rpc('openExternal', { url: url }); };
        api.share = function (o) { return rpc('share', o || {}); };
        api.enablePush = function () { return rpc('enablePush'); };
        api.pushStatus = function () { return rpc('pushStatus'); };
        document.documentElement.setAttribute('data-krs-native', 'ios');
        applyNativeCss();
        interceptExternalLinks();
      }
      resolve(native);
    }

    window.addEventListener('message', function (ev) {
      if (ev.origin !== HUB_ORIGIN) return;
      if (ev.data && ev.data.type === 'KRS_NATIVE_READY') finish(true);
    });

    try { window.parent.postMessage({ type: 'KRS_NATIVE_HELLO' }, HUB_ORIGIN); } catch (e) {}
    // Antwortet niemand, ist es ein normaler Browser.
    setTimeout(function () { finish(false); }, 1200);
  });

  // ── Anpassungen, die nur in der App gelten ────────────────
  function applyNativeCss() {
    var css = [
      // Connect sitzt im iframe; die sicheren Bereiche hat schon der Hub
      // abgezogen. Hier geht es nur um App-Gefühl:
      'html[data-krs-native],html[data-krs-native] body{overscroll-behavior-y:none;}',
      'html[data-krs-native] button,html[data-krs-native] [role="button"]{',
      '-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;}',
      // Eingabefelder dürfen auswählbar bleiben, sonst kann man nichts kopieren.
      'html[data-krs-native] input,html[data-krs-native] textarea,',
      'html[data-krs-native] [contenteditable]{-webkit-user-select:text;user-select:text;}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'krs-native-client-css';
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  function interceptExternalLinks() {
    var nativeOpen = window.open;
    window.open = function (url) {
      if (url && /^https?:/i.test(String(url))) { api.openExternal(String(url)); return null; }
      try { return nativeOpen.apply(window, arguments); } catch (e) { return null; }
    };
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest && ev.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (!/^https?:/i.test(href)) return;
      if (a.target !== '_blank' && href.indexOf(location.origin) === 0) return;
      ev.preventDefault();
      api.openExternal(href);
    }, true);
  }

  // ── Web-Notification-API auf natives Push umbiegen ─────────
  //
  // Connect prüft an drei Stellen `Notification.permission` und ruft
  // `Notification.requestPermission()`. Im WKWebView gibt es das Objekt nicht:
  // `typeof Notification` ist 'undefined', die Abfrage liefert 'denied' und
  // die Benachrichtigungs-Einstellung wirkt für Nutzer:innen kaputt.
  // Wir legen deshalb einen schlanken Ersatz an, der auf APNs zeigt.
  api.ready.then(function (native) {
    if (!native) return;
    if (typeof window.Notification !== 'undefined') return;   // nichts kaputtmachen

    var state = { permission: 'default' };
    function Shim() {}                                        // new Notification() → nativer Push
    Object.defineProperty(Shim, 'permission', { get: function () { return state.permission; } });
    Shim.requestPermission = function (cb) {
      return api.enablePush().then(function (r) {
        state.permission = (r && r.ok) ? 'granted' : 'denied';
        if (typeof cb === 'function') cb(state.permission);
        return state.permission;
      });
    };
    window.Notification = Shim;

    // War die Erlaubnis schon erteilt, gleich den Zustand übernehmen.
    api.pushStatus().then(function (s) {
      if (s && s.token) state.permission = 'granted';
    }, function () {});
  });
})();
