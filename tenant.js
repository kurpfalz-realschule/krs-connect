// tenant.js — Diese EINE Datei pro Schule anpassen. Sonst nichts.
// KEINE Personendaten. KEIN Secret Key. Nur der öffentliche anon/publishable Key.
//
// Dies ist der ECHTE KRS-Tenant (Ist-Werte, Stand v4.16.0) — bewusst identisch
// zum bisherigen hartkodierten Verhalten (TENANT-SPEC.md E6: kein Feature-Neubau,
// Verhalten bleibt bitidentisch). Verlässt das KRS-Repo nicht (s. TENANT-SPEC 3.0).
//
// Muss als ERSTES Script im <head> geladen werden, synchron, vor React-CDN.
(function () {
  'use strict';

  window.TENANT = {
    schule: {
      nameLang:     'Kurpfalz-Realschule Schriesheim',
      nameKurz:     'KRS',
      ort:          'Schriesheim',
      emailDomains: ['realschule-schriesheim.de'],  // Login-Gate. LEER ⇒ Login gesperrt.
      adminEmails:  ['kotzan@gmail.com'],           // Zusatz-Logins außerhalb der Domain. Default: []
    },

    app: {
      name:      'KRS Connect',
      nameShort: 'Connect',
      claim:     'Interne Kommunikation für das Kollegium',
    },

    branding: {
      accent:      '#2563eb',
      accentHover: '#1d4ed8',
      accentLight: 'rgba(37, 99, 235, 0.06)',  // Ist-Wert aus index.html (nicht der Spec-Beispielwert 0.10!)
      accentSoft:  '#dbeafe',
      logoUrl:     '',  // leer ⇒ Produkt-Fallback-Logo (= PRODUCT_LOGO_FALLBACK in index.html, heute das KRS-Logo)
    },

    supabase: {
      url:     'https://ooejsfixxiuobrpqgfqm.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vZWpzZml4eGl1b2JycHFnZnFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjQ5MDYsImV4cCI6MjA4OTYwMDkwNn0.GbAv-sB4B8nNE3IPfiYIjbkMKs0Aq03c_-TUcmFY_5s',
      region:  'EU (Frankfurt)',  // erscheint im Datenschutzhinweis
    },

    links: {
      nextcloudUrl: 'https://cloud.realschule-schriesheim.de',  // leer ⇒ Feature aus
      homepageUrl:  'https://realschule-schriesheim.de/',
    },

    hub: {
      enabled:        true,   // Produkt-Default: false (s. tenant.example.js)
      url:            'https://kurpfalz-realschule.github.io/krs-hub/',
      notizenUrl:     'https://kurpfalz-realschule.github.io/krs-hub/notizen/',
      allowedOrigins: ['https://kurpfalz-realschule.github.io'],
    },

    feedback: {
      gasUrl: 'https://script.google.com/macros/s/AKfycbwr9ZV9108jpkfN4nKboTuwMEgUhBOxW2c2ksWgazKNeSgiINL4G2ZNUMKeEzfaOj3H_g/exec',
    },

    recht: {
      verantwortlich: 'Kurpfalz-Realschule Schriesheim, vertreten durch die Schulleitung.',
      kontaktEmail:   'sekretariat@realschule-schriesheim.de',
      landesgesetz:   'LDSG BW',
      avvVorhanden:   true,   // Ist-Zustand (KRS hat den Supabase-AVV bereits abgeschlossen).
                              // Neue Tenants: Default MUSS false sein (s. tenant.example.js, 2.3b).
      hosting:        'Die Webseite wird über GitHub Pages (Microsoft/GitHub Inc.) bereitgestellt.',
      datenschutzUrl: '',
      // Reserviert für S5 (DSGVO-Review 2.3b) — bewusst NICHT in S2 mit erfundenem Inhalt befüllt
      // und noch NICHT im UI verdrahtet (Impressum/Banner sind eigenes Feature, nicht Tenant-Mechanik):
      datenschutzbeauftragter: '',
      aufsichtsbehoerde:       '',
      rechtsgrundlage:         '',
      speicherdauer:           '',
      anschrift:               '',
      impressum:               '',
    },

    features: {},  // reserviert — in S2 NICHT implementiert
  };

  // ── Accessor, global (auch für klassische Scripts nötig) ──
  window.T = function (path, fallback) {
    const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), window.TENANT);
    return (v === undefined || v === null || v === '') ? fallback : v;
  };

  // ── Brücke: der Hub liest weiterhin window.KRS_TENANT ──
  window.KRS_TENANT = window.KRS_TENANT || {
    EMAIL_DOMAIN:  window.TENANT.schule.emailDomains[0] || '',
    HOMEPAGE_URL:  window.TENANT.links.homepageUrl,
    NEXTCLOUD_URL: window.TENANT.links.nextcloudUrl,
  };

  // ── 3.5 Branding-Setter + Kontrast-Wächter ──────────────────────────────
  // Läuft synchron vor dem ersten Paint (tenant.js ist das erste Script).
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
    if (!a || !b) return 21; // unbekanntes Format ⇒ nicht warnen (kein false positive)
    const la = relLuminance(a) + 0.05, lb = relLuminance(b) + 0.05;
    return la > lb ? la / lb : lb / la;
  }

  try {
    const root = document.documentElement;
    const b = window.TENANT.branding || {};
    if (b.accent) {
      root.style.setProperty('--accent', b.accent);
      // Ableitung NUR als Fallback für fehlende optionale Felder (TENANT-SPEC 2.5) —
      // für KRS sind alle drei Felder oben explizit gesetzt, hier passiert nichts.
      root.style.setProperty('--accent-hover', b.accentHover || b.accent);
      root.style.setProperty('--accent-light', b.accentLight || 'rgba(0,0,0,0.06)');
      root.style.setProperty('--accent-soft', b.accentSoft || '#e2e8f0');

      if (/^#[0-9a-f]{6}$/i.test(b.accent) && contrastRatio(b.accent, '#ffffff') < 4.5) {
        root.style.setProperty('--accent-text', '#1e293b');
        console.warn('[tenant] Akzentfarbe zu hell für weiße Schrift — Textfarbe auf dunkel umgestellt.');
      }
    }
  } catch (e) { /* Branding ist rein kosmetisch — nie die App blockieren */ }

  // ── 3.8 Framing-Schutz ──────────────────────────────────────────────────
  try {
    const hubEnabled = window.TENANT.hub && window.TENANT.hub.enabled === true;
    if (!hubEnabled) {
      if (window.top !== window.self) {
        document.documentElement.style.display = 'none';
        window.top.location = window.self.location; // Clickjacking-Schutz: aus dem Frame ausbrechen
      }
    }
    // hub.enabled:true ⇒ die eigentliche Origin-Prüfung passiert bereits im
    // Hub-Auth-Listener (index.html, exakter Array-Vergleich, s. TENANT-SPEC 2.1/3.6).
  } catch (e) { /* Framing-Schutz darf die App nie zum Absturz bringen */ }

  // ── 3.7 Content-Security-Policy — ZURÜCKGESTELLT (echter Befund, 22.07.2026) ──
  // TENANT-SPEC 3.7 wollte die CSP zunächst als Report-Only per <meta> ausliefern.
  // Das ist technisch nicht möglich: Browser lehnen JEDE per <meta> gelieferte
  // "Content-Security-Policy-Report-Only" grundsätzlich ab (nicht nur einzelne
  // Direktiven wie frame-ancestors) — bestätigt durch Run #60/#61 im CI-Gate
  // (Konsolen-Warnung "...was delivered via a <meta> element, which is disallowed").
  // Nur die ENFORCED-Variante ("Content-Security-Policy") ist per <meta> zulässig,
  // aber ohne vorherige Report-Only-Beobachtungsphase riskiert eine zu enge Policy,
  // die App sofort unbenutzbar zu machen (genau das, wovor 3.7 warnt). Da GitHub
  // Pages zudem keine eigenen HTTP-Response-Header setzen kann (kein Server dahinter),
  // ist eine echte Report-Only-Phase hier ohne einen vorgeschalteten Edge-Dienst
  // (z. B. Cloudflare Worker) nicht sauber umsetzbar.
  // Entscheidung: CSP-Auslieferung auf S4 verschoben (dort ohnehin Hosting-Fragen im
  // Fokus). Der Framing-Schutz oben (window.top-Prüfung, TENANT-SPEC 3.8) bleibt die
  // wirksame Schutzmaßnahme gegen Clickjacking und ist von diesem Befund unabhängig.

  // ── 3.6 validateTenant() — Sicherheits-Härtung, läuft vor createClient ──
  // Rückgabe: { ok: true } oder { ok: false, reason: '<generischer Text ohne Interna>' }
  window.validateTenantConfig = function () {
    const T = window.TENANT;
    const fail = (msg) => { console.warn('[tenant] Konfiguration ungültig: ' + msg); return { ok: false, reason: 'Konfiguration fehlt oder ist fehlerhaft.' }; };

    if (!T || typeof T !== 'object') return fail('window.TENANT fehlt (tenant.js nicht geladen?)');

    const url = T.supabase && T.supabase.url;
    const anonKey = T.supabase && T.supabase.anonKey;
    const emailDomains = (T.schule && T.schule.emailDomains) || [];

    if (!url || !/^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(url)) {
      return fail('supabase.url fehlt oder ungültig (kein Pfad-Anteil erlaubt)');
    }
    if (!anonKey) return fail('supabase.anonKey fehlt');

    // Der wahrscheinlichste Fork-Fehler: service_role/secret-Key statt anon/publishable-Key.
    if (anonKey.indexOf('sb_secret_') === 0 || anonKey.indexOf('service_role') !== -1) {
      return fail('supabase.anonKey sieht wie ein SECRET/SERVICE-ROLE-Key aus — niemals im Client verwenden!');
    }
    if (anonKey.indexOf('sb_publishable_') !== 0) {
      // Legacy-JWT-Format (Supabase vor dem neuen Key-Schema): role-Claim dekodieren.
      const parts = anonKey.split('.');
      if (parts.length === 3) {
        try {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload.role !== 'anon') return fail('supabase.anonKey hat role="' + payload.role + '" statt "anon"');
        } catch (e) {
          return fail('supabase.anonKey ist kein gültiges JWT und kein sb_publishable_-Key');
        }
      } else {
        return fail('supabase.anonKey hat unbekanntes Format');
      }
    }

    if (!Array.isArray(emailDomains) || emailDomains.length === 0) {
      return fail('schule.emailDomains ist leer — Login wäre für niemanden möglich');
    }

    // URL-Felder: nur https:, nie javascript:/data:
    const urlFields = [
      (T.hub && T.hub.url), (T.hub && T.hub.notizenUrl),
      (T.links && T.links.nextcloudUrl), (T.links && T.links.homepageUrl),
      (T.feedback && T.feedback.gasUrl), (T.recht && T.recht.datenschutzUrl),
    ];
    for (const u of urlFields) {
      if (u && !/^https:\/\//i.test(u)) return fail('ein URL-Feld ist nicht https:// (' + u + ')');
    }

    // hub.allowedOrigins: exakt https://host[:port], kein '*', kein Pfad
    const origins = (T.hub && T.hub.allowedOrigins) || [];
    for (const o of origins) {
      if (o === '*' || !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o)) {
        return fail('hub.allowedOrigins enthält einen ungültigen Eintrag (kein Wildcard, kein Pfad erlaubt)');
      }
    }

    // logoUrl: nur data:image/(png|jpeg|webp);base64 ODER relativer Pfad — kein svg+xml, keine Fremd-Origin
    const logoUrl = T.branding && T.branding.logoUrl;
    if (logoUrl) {
      const isDataUri = /^data:image\/(png|jpeg|webp);base64,/i.test(logoUrl);
      const isRelative = /^[^:]+$/.test(logoUrl) || logoUrl.indexOf('./') === 0 || logoUrl.indexOf('/') === 0;
      if (!isDataUri && !isRelative) return fail('branding.logoUrl ist weder ein erlaubtes data:-Bild noch ein relativer Pfad');
    }

    // Sicherheitsrelevante Flags dürfen nie "true" als Fallback haben — Prüfung
    // hier nur informativ, die eigentliche Regel liegt in den T(...)-Aufrufen in index.html.
    return { ok: true };
  };
})();
