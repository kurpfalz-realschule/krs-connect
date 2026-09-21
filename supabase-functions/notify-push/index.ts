// =====================================================================
// KRS — notify-push
// Native iOS-Benachrichtigungen über APNs für die App „KRS Schule".
//
// Auslöser: Supabase Database Webhooks (INSERT), genau wie bei notify-email:
//   1) public.posts    → Dringend-Beiträge und @alle
//   2) public.messages → Direktnachrichten
//   Beide schicken den Header  x-krs-hook-secret: <HOOK_SECRET>
//
// Bewusst KEIN zweites Regelwerk: Für Beiträge gilt dieselbe Regel wie beim
// E-Mail-Versand (nur Haupt-Posts, nicht gelöscht, Dringend ODER @alle).
// Neu ist nur der Kanal — und Direktnachrichten, die per E-Mail nie gingen.
//
// Secrets (setzt Norbert selbst, nie im Repo):
//   HOOK_SECRET        — dasselbe wie bei notify-email
//   APNS_KEY_ID        — 10 Zeichen, aus dem Apple-Developer-Portal
//   APNS_TEAM_ID       — 10 Zeichen, Apple Team ID
//   APNS_PRIVATE_KEY   — Inhalt der .p8-Datei, mit -----BEGIN PRIVATE KEY-----
//   APNS_TOPIC         — de.realschuleschriesheim.krs
//   APNS_ENV           — dauerhaft "production"; Sandbox wird pro Geraetetoken erkannt
//
// Deploy: supabase functions deploy notify-push --no-verify-jwt
//   (--no-verify-jwt: der Webhook hat kein User-JWT; Schutz ist HOOK_SECRET.)
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

// Direktnachrichten können Schülernamen enthalten. Standardmäßig steht deshalb
// nur „Neue Nachricht von X" auf dem Sperrbildschirm, nicht der Text selbst.
// Auf true setzen, wer die Vorschau möchte (iOS blendet sie je nach
// Geräteeinstellung ohnehin erst nach dem Entsperren ein).
const ZEIGE_DM_INHALT = false;

const APNS_HOST = (Deno.env.get("APNS_ENV") || "production") === "sandbox"
  ? "https://api.sandbox.push.apple.com"
  : "https://api.push.apple.com";

// ── Hilfen ───────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function b64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PEM (.p8) → ArrayBuffer mit den reinen DER-Bytes. */
function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

// Apple verlangt, dass ein Token höchstens alle 20 Minuten neu erzeugt wird,
// und akzeptiert ihn bis zu einer Stunde. Deshalb im Modul zwischenspeichern —
// die Instanz lebt über mehrere Aufrufe.
let tokenCache: { jwt: string; erzeugt: number } | null = null;

async function apnsJwt(): Promise<string> {
  const jetzt = Math.floor(Date.now() / 1000);
  if (tokenCache && jetzt - tokenCache.erzeugt < 1800) return tokenCache.jwt;

  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const pem = Deno.env.get("APNS_PRIVATE_KEY");
  if (!keyId || !teamId || !pem) {
    throw new Error("APNS_KEY_ID, APNS_TEAM_ID oder APNS_PRIVATE_KEY fehlt");
  }

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = b64url(new TextEncoder().encode(
    JSON.stringify({ alg: "ES256", kid: keyId }),
  ));
  const claims = b64url(new TextEncoder().encode(
    JSON.stringify({ iss: teamId, iat: jetzt }),
  ));
  const signatur = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  // Web Crypto liefert bei ECDSA genau das r||s-Format, das ES256 braucht.
  const jwt = `${header}.${claims}.${b64url(signatur)}`;
  tokenCache = { jwt, erzeugt: jetzt };
  return jwt;
}

type Ziel = { id: number; token: string; environment: string };

async function sende(
  ziel: Ziel,
  inhalt: { titel: string; text: string; modul: string; ref?: string },
  jwt: string,
): Promise<{ ok: boolean; status: number; grund?: string }> {
  const host = ziel.environment === "sandbox"
    ? "https://api.sandbox.push.apple.com"
    : APNS_HOST;

  const res = await fetch(`${host}/3/device/${ziel.token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": Deno.env.get("APNS_TOPIC") || "de.realschuleschriesheim.krs",
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 3600),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: {
        alert: { title: inhalt.titel, body: inhalt.text },
        sound: "default",
        "interruption-level": "active",
      },
      // Wird von krs-native.js ausgewertet: springt ins richtige Modul.
      module: inhalt.modul,
      ref: inhalt.ref,
    }),
  });

  if (res.ok) return { ok: true, status: res.status };
  let grund = "";
  try {
    grund = String((await res.json())?.reason ?? "");
  } catch { /* Apple antwortet bei 200 mit leerem Rumpf */ }
  return { ok: false, status: res.status, grund };
}

// ── Hauptlogik ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("HOOK_SECRET") || "";
  if (!secret || req.headers.get("x-krs-hook-secret") !== secret) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
  }

  const tabelle = String(payload?.table ?? "");
  const record = (payload?.record ?? {}) as Record<string, unknown>;

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let absenderId = 0;
  let empfaengerIds: number[] = [];
  let titel = "";
  let text = "";
  let modul = "connect";
  let ref: string | undefined;

  // ── Fall 1: Beitrag ────────────────────────────────────────────────
  if (tabelle === "posts") {
    const content = String(record.content ?? "");
    const dringend = record.is_urgent === true;
    const anAlle = /@alle\b/i.test(stripHtml(content));

    if (record.parent_id || record.is_deleted === true || (!dringend && !anAlle)) {
      return new Response(JSON.stringify({ skipped: "keine Dringend/@alle" }), { status: 200 });
    }

    absenderId = Number(record.author_id ?? 0);
    const { data: alle } = await sb
      .from("users").select("id, status").neq("id", absenderId);
    empfaengerIds = (alle || [])
      .filter((u) => (u.status ?? "active") === "active")
      .map((u) => Number(u.id));

    const betreff = String(record.title ?? "").trim();
    titel = dringend ? "🔴 Dringend in Connect" : "📣 Beitrag an @alle";
    text = [betreff, stripHtml(content).slice(0, 180)].filter(Boolean).join(" — ");
    ref = String(record.id ?? "");

  // ── Fall 2: Direktnachricht ────────────────────────────────────────
  } else if (tabelle === "messages") {
    if (record.is_deleted === true) {
      return new Response(JSON.stringify({ skipped: "geloescht" }), { status: 200 });
    }
    absenderId = Number(record.sender_id ?? 0);
    const convId = Number(record.conversation_id ?? 0);

    const { data: mitglieder } = await sb
      .from("conversation_members").select("user_id").eq("conversation_id", convId);
    empfaengerIds = (mitglieder || [])
      .map((m) => Number(m.user_id))
      .filter((id) => id !== absenderId);

    const { data: absender } = await sb
      .from("users").select("display_name").eq("id", absenderId).maybeSingle();

    titel = absender?.display_name ?? "Neue Nachricht";
    text = ZEIGE_DM_INHALT
      ? stripHtml(String(record.content ?? "")).slice(0, 180)
      : "Neue Direktnachricht in Connect";
    ref = String(convId);

  } else {
    return new Response(JSON.stringify({ skipped: `Tabelle ${tabelle}` }), { status: 200 });
  }

  if (empfaengerIds.length === 0) {
    return new Response(JSON.stringify({ skipped: "keine Empfaenger" }), { status: 200 });
  }

  // ── Wer will überhaupt Benachrichtigungen? ─────────────────────────
  // notifications_enabled ist Standard true; nur ausdrückliches false zählt.
  const { data: prefs } = await sb
    .from("user_preferences")
    .select("user_id, notifications_enabled")
    .in("user_id", empfaengerIds);
  const abgelehnt = new Set(
    (prefs || []).filter((p) => p.notifications_enabled === false).map((p) => Number(p.user_id)),
  );
  const wollen = empfaengerIds.filter((id) => !abgelehnt.has(id));

  const { data: tokens } = await sb
    .from("push_tokens")
    .select("id, user_id, token, environment")
    .in("user_id", wollen)
    .is("disabled_at", null);

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ skipped: "keine Geraete" }), { status: 200 });
  }

  let jwt: string;
  try {
    jwt = await apnsJwt();
  } catch (e) {
    console.error("APNs-JWT:", (e as Error).message);
    // 200, damit der Webhook nicht endlos wiederholt.
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 200 });
  }

  let zugestellt = 0;
  const stillgelegt: number[] = [];

  for (const t of tokens) {
    const r = await sende(
      { id: Number(t.id), token: String(t.token), environment: String(t.environment) },
      { titel, text, modul, ref },
      jwt,
    );
    if (r.ok) {
      zugestellt++;
      await sb.from("push_tokens")
        .update({ last_success_at: new Date().toISOString() })
        .eq("id", t.id);
    } else if (r.status === 410 || r.grund === "BadDeviceToken" || r.grund === "Unregistered") {
      // Gerät hat die App gelöscht oder der Token ist abgelaufen.
      // Stilllegen statt löschen — so bleibt nachvollziehbar, warum jemand
      // nichts mehr bekommt.
      stillgelegt.push(Number(t.id));
      await sb.from("push_tokens")
        .update({ disabled_at: new Date().toISOString(), disabled_reason: r.grund || "410" })
        .eq("id", t.id);
    } else {
      console.error(`APNs ${r.status} ${r.grund} für Token ${t.id}`);
    }
  }

  console.log(
    `notify-push: ${tabelle}, ${zugestellt}/${tokens.length} zugestellt, ${stillgelegt.length} stillgelegt`,
  );
  return new Response(
    JSON.stringify({ ok: true, zugestellt, gesamt: tokens.length, stillgelegt: stillgelegt.length }),
    { status: 200 },
  );
});
