// tenant.example.js — VORLAGE. Kopieren nach tenant.js und NUR die Daten unten anpassen.
//
// WICHTIG (TENANT-SPEC.md 3.0): Der Upstream ändert die Logik in dieser Datei möglichst
// NIE mehr — eine Schule kopiert die GANZE Datei (Daten + Mechanik) nach tenant.js und
// füllt nur die Werte im TENANT-Objekt aus. Neue Felder kommen künftig nur hier dazu
// (mit Fallback über T()), damit `git pull` bei Schulen keinen Merge-Konflikt erzeugt.
// tenant.js selbst ist in .gitignore und wird NIE ins öffentliche Repo gepusht.
//
// KEINE Personendaten. KEIN Secret Key. Nur der öffentliche anon/publishable Key.
//
// Muss als ERSTES Script im <head> geladen werden, synchron, vor React-CDN.
(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════
  // 1) DATEN — das hier pro Schule ausfüllen. Rest der Datei unverändert lassen.
  // ══════════════════════════════════════════════════════════════════════
  window.TENANT = {
    schule: {
      nameLang:     '',   // z. B. 'Musterschule Beispielstadt'
      nameKurz:     '',   // z. B. 'MSB'
      ort:          '',
      emailDomains: [],   // Pflichtfeld! LEER ⇒ Login ist gesperrt (fail-closed, s. TENANT-SPEC 3.3).
      adminEmails:  [],   // Zusatz-Logins außerhalb der Domain. Produkt-Default: [] — NIE ein
                          // fremdes Konto hier eintragen, das sonst Adminrechte behält.
    },

    app: {
      name:      '',   // z. B. 'MSB Connect'
      nameShort: '',
      claim:     'Interne Kommunikation für das Kollegium',
    },

    branding: {
      accent:      '#2563eb',
      accentHover: '',   // optional — leer ⇒ automatisch aus accent abgeleitet
      accentLight: '',   // optional
      accentSoft:  '',   // optional
      logoUrl:     '',   // data-URI (image/png|jpeg|webp) ODER relativer Pfad. Leer ⇒ Produkt-Logo.
                         // NIE image/svg+xml (Script-Träger) und NIE eine fremde https-URL (Tracking).
    },

    supabase: {
      url:     '',   // Pflichtfeld! https://<projekt>.supabase.co — kein Pfad-Anteil
      anonKey: '',   // Pflichtfeld! NUR der öffentliche anon/publishable Key — NIEMALS der
                     // service_role/secret-Key (der liegt im Supabase-Dashboard direkt daneben —
                     // validateTenantConfig() bricht hart ab, wenn hier der falsche Key steht).
      region:  '',   // erscheint im Datenschutzhinweis — ehrlich angeben, wo die Instanz läuft
    },

    links: {
      nextcloudUrl: '',  // leer ⇒ Feature ausgeblendet
      homepageUrl:  '',
    },

    hub: {
      enabled:        false,  // Produkt-Default. Der KRS-Hub ist KRS-intern (TENANT-SPEC E1/E3).
      url:            '',
      notizenUrl:     '',
      allowedOrigins: [],     // NIE '*', NIE ein Pfad — nur exakte https://host[:port]-Einträge
    },

    feedback: {
      gasUrl: '',  // leer ⇒ Feedback-Button ausgeblendet (sonst schreibt eure Schule ins fremde Sheet)
    },

    recht: {
      verantwortlich: '',  // z. B. 'Musterschule Beispielstadt, vertreten durch die Schulleitung.'
      kontaktEmail:   '',
      landesgesetz:   'LDSG BW',  // ggf. anderes Bundesland eintragen
      avvVorhanden:   false,  // Produkt-Default MUSS false sein! Erst auf true stellen, NACHDEM
                              // eure Schule den Auftragsverarbeitungsvertrag mit Supabase wirklich
                              // abgeschlossen hat (Supabase Dashboard → Legal/DPA). Siehe
                              // SCHULE-ONBOARDING.md. Solange false: sichtbarer Hinweis im
                              // Datenschutz-Modal.
      hosting:        '',  // Pflichtfeld — wer hostet die Webseite? (z. B. GitHub Pages, eigener Server)
      datenschutzUrl: '',  // gesetzt ⇒ App verlinkt primär EUER Datenschutzdokument statt Mustertext
      // Reserviert für eine spätere S5-Erweiterung (volle Art.-13-DSGVO-Angaben,
      // Impressum) — in S2 noch nicht im UI verdrahtet:
      datenschutzbeauftragter: '',
      aufsichtsbehoerde:       '',
      rechtsgrundlage:         '',
      speicherdauer:           '',
      anschrift:               '',
      impressum:               '',
    },

    features: {},  // reserviert — nicht implementiert
  };

  // ══════════════════════════════════════════════════════════════════════
  // 2) MECHANIK — ab hier nichts mehr ändern (Update-Konvention TENANT-SPEC 3.0).
  // ══════════════════════════════════════════════════════════════════════

  window.T = function (path, fallback) {
    const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), window.TENANT);
    return (v === undefined || v === null || v === '') ? fallback : v;
  };

  window.KRS_TENANT = window.KRS_TENANT || {
    EMAIL_DOMAIN:  window.TENANT.schule.emailDomains[0] || '',
    HOMEPAGE_URL:  window.TENANT.links.homepageUrl,
    NEXTCLOUD_URL: window.TENANT.links.nextcloudUrl,
  };

  // ── 3.5 Branding-Setter + Kontrast-Wächter ──────────────────────────────
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
  } catch (e) { /* Branding ist rein kosmetisch — nie die App blockieren */ }

  // ── 3.8 Framing-Schutz ──────────────────────────────────────────────────
  try {
    const hubEnabled = window.TENANT.hub && window.TENANT.hub.enabled === true;
    if (!hubEnabled) {
      if (window.top !== window.self) {
        document.documentElement.style.display = 'none';
        window.top.location = window.self.location;
      }
    }
  } catch (e) { /* Framing-Schutz darf die App nie zum Absturz bringen */ }

  // ── 3.7 Content-Security-Policy (Report-Only) ───────────────────────────
  try {
    const su = window.TENANT.supabase && window.TENANT.supabase.url;
    const fb = window.TENANT.feedback && window.TENANT.feedback.gasUrl;
    const hubOrigins = (window.TENANT.hub && window.TENANT.hub.enabled && window.TENANT.hub.allowedOrigins) || [];
    const connectSrc = ["'self'"];
    if (su) {
      connectSrc.push(su);
      try { connectSrc.push('wss://' + new URL(su).host); } catch (e) {}
    }
    if (fb) connectSrc.push(fb);
    const csp = [
      "script-src https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com 'unsafe-inline'",
      "connect-src " + connectSrc.join(' '),
      "img-src 'self' data: blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors " + (hubOrigins.length ? hubOrigins.join(' ') : "'none'"),
    ].join('; ');
    const meta = document.createElement('meta');
    meta.setAttribute('http-equiv', 'Content-Security-Policy-Report-Only');
    meta.setAttribute('content', csp);
    document.head.appendChild(meta);
  } catch (e) { /* CSP ist Report-Only — darf die App nie blockieren */ }

  // ── 3.6 validateTenantConfig() — läuft vor createClient ─────────────────
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

    if (anonKey.indexOf('sb_secret_') === 0 || anonKey.indexOf('service_role') !== -1) {
      return fail('supabase.anonKey sieht wie ein SECRET/SERVICE-ROLE-Key aus — niemals im Client verwenden!');
    }
    if (anonKey.indexOf('sb_publishable_') !== 0) {
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

    const urlFields = [
      (T.hub && T.hub.url), (T.hub && T.hub.notizenUrl),
      (T.links && T.links.nextcloudUrl), (T.links && T.links.homepageUrl),
      (T.feedback && T.feedback.gasUrl), (T.recht && T.recht.datenschutzUrl),
    ];
    for (const u of urlFields) {
      if (u && !/^https:\/\//i.test(u)) return fail('ein URL-Feld ist nicht https:// (' + u + ')');
    }

    const origins = (T.hub && T.hub.allowedOrigins) || [];
    for (const o of origins) {
      if (o === '*' || !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o)) {
        return fail('hub.allowedOrigins enthält einen ungültigen Eintrag (kein Wildcard, kein Pfad erlaubt)');
      }
    }

    const logoUrl = T.branding && T.branding.logoUrl;
    if (logoUrl) {
      const isDataUri = /^data:image\/(png|jpeg|webp);base64,/i.test(logoUrl);
      const isRelative = /^[^:]+$/.test(logoUrl) || logoUrl.indexOf('./') === 0 || logoUrl.indexOf('/') === 0;
      if (!isDataUri && !isRelative) return fail('branding.logoUrl ist weder ein erlaubtes data:-Bild noch ein relativer Pfad');
    }

    return { ok: true };
  };
})();
