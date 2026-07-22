// tenant.musterschule.js — Demo-Tenant „Musterschule Beispielstadt".
//
// Zweck (TENANT-SPEC.md Sprint S2, Punkt 9): Beleg, dass ein Fork wirklich nur EINE
// Datei tauschen muss, um Branding/Hub/Feedback komplett anders zu konfigurieren —
// ohne eine einzige Zeile in index.html anzufassen. Gedacht für die Live-Demo und
// für E2E-Tests, IMMER zusammen mit ?forceMode=demo (dann greift nie ein echter
// Supabase-Client, s. TENANT-SPEC 3.3 — die leeren supabase-Felder unten sind daher
// unkritisch, solange diese Datei nur im Demo-Modus geladen wird).
//
// Zum Ausprobieren: index.html so laden, dass tenant.musterschule.js statt tenant.js
// eingebunden wird, plus ?forceMode=demo an der URL.
(function () {
  'use strict';

  window.TENANT = {
    schule: {
      nameLang:     'Musterschule Beispielstadt',
      nameKurz:     'MSB',
      ort:          'Beispielstadt',
      emailDomains: ['musterschule-beispielstadt.de'],
      adminEmails:  [],  // Produkt-Default: keine fremden Zusatz-Logins
    },

    app: {
      name:      'MSB Connect',
      nameShort: 'Connect',
      claim:     'Interne Kommunikation für das Kollegium',
    },

    branding: {
      accent:      '#0d9488',   // bewusst anderer Farbton (Teal statt KRS-Blau) — zeigt, dass
      accentHover: '#0f766e',   // die Ableitung (2.5) für Schulen ohne eigene Werte funktioniert,
      accentLight: '',          // hier aber absichtlich explizit gesetzt, um den Unterschied zu KRS zu zeigen
      accentSoft:  '#99f6e4',
      logoUrl:     '',          // leer ⇒ Produkt-Fallback-Logo (neutral, nicht das KRS-Logo)
    },

    supabase: {
      url:     '',   // absichtlich leer — diese Datei ist NUR für ?forceMode=demo gedacht
      anonKey: '',
      region:  'EU (Frankfurt)',
    },

    links: {
      nextcloudUrl: '',   // leer ⇒ Nextcloud-Karte ausgeblendet (zeigt bedingtes Rendern)
      homepageUrl:  'https://musterschule-beispielstadt.de/',
    },

    hub: {
      enabled:        false,  // Musterschule hat keinen KRS-Hub — Produkt-Default
      url:            '',
      notizenUrl:     '',
      allowedOrigins: [],
    },

    feedback: {
      gasUrl: '',  // leer ⇒ Feedback-Button ausgeblendet (kein fremdes Google-Sheet)
    },

    recht: {
      verantwortlich: 'Musterschule Beispielstadt, vertreten durch die Schulleitung.',
      kontaktEmail:   'sekretariat@musterschule-beispielstadt.de',
      landesgesetz:   'LDSG BW',
      avvVorhanden:   false,  // Produkt-Default — Demo behauptet keinen echten AVV
      hosting:        'Die Webseite wird über GitHub Pages (Microsoft/GitHub Inc.) bereitgestellt.',
      datenschutzUrl: '',
      datenschutzbeauftragter: '',
      aufsichtsbehoerde:       '',
      rechtsgrundlage:         '',
      speicherdauer:           '',
      anschrift:               '',
      impressum:               '',
    },

    features: {},
  };

  window.T = function (path, fallback) {
    const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), window.TENANT);
    return (v === undefined || v === null || v === '') ? fallback : v;
  };

  window.KRS_TENANT = window.KRS_TENANT || {
    EMAIL_DOMAIN:  window.TENANT.schule.emailDomains[0] || '',
    HOMEPAGE_URL:  window.TENANT.links.homepageUrl,
    NEXTCLOUD_URL: window.TENANT.links.nextcloudUrl,
  };

  // ── Branding-Setter + Kontrast-Wächter (identisch zu tenant.js/tenant.example.js) ──
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
    if (!m) return null;
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }
  function relLuminance([r, g, b]) {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function contrastRatio(hexA, hexB) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    if (!a || !b) return 21;
    const la = relLuminance(a) + 0.05, lb = relLuminance(b) + 0.05;
    return la > lb ? la / lb : lb / la;
  }
  try {
    const root = document.documentElement;
    const b = window.TENANT.branding || {};
    if (b.accent) {
      root.style.setProperty('--accent', b.accent);
      root.style.setProperty('--accent-hover', b.accentHover || b.accent);
      root.style.setProperty('--accent-light', b.accentLight || 'rgba(0,0,0,0.06)');
      root.style.setProperty('--accent-soft', b.accentSoft || '#e2e8f0');
      if (/^#[0-9a-f]{6}$/i.test(b.accent) && contrastRatio(b.accent, '#ffffff') < 4.5) {
        root.style.setProperty('--accent-text', '#1e293b');
        console.warn('[tenant] Akzentfarbe zu hell für weiße Schrift — Textfarbe auf dunkel umgestellt.');
      }
    }
  } catch (e) {}

  // ── Framing-Schutz ──
  try {
    const hubEnabled = window.TENANT.hub && window.TENANT.hub.enabled === true;
    if (!hubEnabled && window.top !== window.self) {
      document.documentElement.style.display = 'none';
      window.top.location = window.self.location;
    }
  } catch (e) {}

  // ── CSP zurückgestellt (s. tenant.js für Begründung: <meta>-Report-Only wird von
  //    Browsern grundsätzlich verworfen, GitHub Pages kann keine HTTP-Header setzen,
  //    verschoben auf S4). Framing-Schutz oben bleibt wirksam. ──

  // ── validateTenantConfig() — im Demo-Modus wird sie nie aufgerufen (forceMode=demo
  // überspringt den Guard komplett, s. TENANT-SPEC 3.3), aber der Vollständigkeit
  // halber identisch vorhanden, falls diese Datei je ohne Demo-Modus geladen wird. ──
  window.validateTenantConfig = function () {
    const T = window.TENANT;
    const fail = (msg) => { console.warn('[tenant] Konfiguration ungültig: ' + msg); return { ok: false, reason: 'Konfiguration fehlt oder ist fehlerhaft.' }; };
    if (!T || typeof T !== 'object') return fail('window.TENANT fehlt');
    const url = T.supabase && T.supabase.url;
    if (!url || !/^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(url)) return fail('supabase.url fehlt oder ungültig');
    return { ok: true };
  };
})();
