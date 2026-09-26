// =====================================================================
// KRS — notify-push
// Native iOS-Benachrichtigungen über APNs für die App „KRS Schule".
//
// Auslöser: Supabase Database Webhooks (INSERT), genau wie bei notify-email:
//   1) public.posts    → Dringend-Beiträge, @alle, @Name, Antworten im Thread
//   2) public.messages → Direktnachrichten
//   Beide schicken den Header  x-krs-hook-secret: <HOOK_SECRET>
//
// Paket D (25.09.2026): D1 @Name + Antworten im eigenen Thread (nur Push,
// keine Mail), D3 Feierabend über RPC krs_quiet_users (Dringend kommt durch).
//
// Paket A (23.09.2026): Empfänger bei Beiträgen = Mitglieder des Teams (A1),
// Text nur Hinweis + Team/Kanal ohne Inhalt (E-2), Secret aus Vault (A9).
//
// Dringend/@alle: dieselbe Regel wie beim E-Mail-Versand (nur Haupt-Posts,
// nicht gelöscht). @Name, Antworten und Direktnachrichten gibt es nur als Push.
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
import { hookErlaubt } from "./hook-secret.ts";

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

// ── D1: Erwähnungen ─────────────────────────────────────────────────────────
type Gruppe = { ids: number[]; titel: string; text: string; ref?: string };

function antwort(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

function regexEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** true, wenn im Klartext „@<Anzeigename>" oder „@<Nachname>" als ganzes Wort steht. */
export function wirdErwaehnt(klartext: string, u: { display_name: string; nachname: string }): boolean {
  const namen = [u.display_name, u.nachname]
    .map((n) => (n || "").trim())
    .filter((n) => n.length >= 3 && n.toLowerCase() !== "alle");
  for (const n of namen) {
    const re = new RegExp("(?<![\\w.@])@" + regexEscape(n) + "(?![\\wäöüÄÖÜß])", "i");
    if (re.test(klartext)) return true;
  }
  return false;
}

// ── Hauptlogik ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!(await hookErlaubt(req, sb))) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad request" }), { status: 400 });
  }

  const tabelle = String(payload?.table ?? "");
  const record = (payload?.record ?? {}) as Record<string, unknown>;

  let absenderId = 0;
  // D1 (Paket D, 25.09.2026): verschiedene Empfänger bekommen verschiedene
  // Hinweise (erwähnt / Antwort im Thread). Deshalb Gruppen statt einer Liste.
  let gruppen: Gruppe[] = [];
  // D3: Dringend kommt immer durch, alles andere respektiert den Feierabend.
  let dringend = false;
  const modul = "connect";

  // ── Fall 1: Beitrag ────────────────────────────────────────────────
  if (tabelle === "posts") {
    if (record.is_deleted === true) {
      return antwort({ skipped: "geloescht" });
    }
    const klartext = stripHtml(String(record.content ?? ""));
    const istAntwort = !!record.parent_id;
    dringend = !istAntwort && record.is_urgent === true;
    const anAlle = !istAntwort && /@alle\b/i.test(klartext);
    // Schneller Ausstieg ohne DB-Zugriff: Haupt-Post ohne Dringend/@alle und
    // ohne irgendein @ kann niemanden benachrichtigen.
    if (!istAntwort && !dringend && !anAlle && !klartext.includes("@")) {
      return antwort({ skipped: "keine Dringend/@alle/Erwähnung" });
    }

    absenderId = Number(record.author_id ?? 0);

    // A1: nur Mitglieder des Teams, in dessen Kanal gepostet wurde.
    const { data: kanal } = await sb
      .from("channels").select("id, name, team_id").eq("id", Number(record.channel_id ?? 0)).maybeSingle();
    if (!kanal?.team_id) {
      return antwort({ skipped: "kein Kanal" });
    }
    const { data: team } = await sb.from("teams").select("name").eq("id", kanal.team_id).maybeSingle();
    const { data: mitglieder } = await sb
      .from("team_members").select("user_id").eq("team_id", kanal.team_id);
    const mitgliedIds = [...new Set((mitglieder || []).map((m) => Number(m.user_id)))]
      .filter((id) => id !== absenderId);
    let aktive: { id: number; display_name: string; nachname: string }[] = [];
    if (mitgliedIds.length > 0) {
      const { data: aktiv } = await sb
        .from("users").select("id, status, display_name, nachname").in("id", mitgliedIds);
      aktive = (aktiv || [])
        .filter((u) => (u.status ?? "active") === "active")
        .map((u) => ({ id: Number(u.id), display_name: String(u.display_name ?? ""), nachname: String(u.nachname ?? "") }));
    }

    // E-2: kein Inhalt, kein Titel — nur Hinweis + Team/Kanal.
    const teamName = String(team?.name ?? "Connect").trim();
    const kanalName = String(kanal.name ?? "").trim();
    const ref = String(record.parent_id ?? record.id ?? "");

    if (dringend || anAlle) {
      gruppen.push({
        ids: aktive.map((u) => u.id),
        titel: dringend ? `🔴 Dringend: ${teamName}` : `📣 @alle: ${teamName}`,
        text: kanalName ? `Neuer Beitrag in #${kanalName}` : "Neuer Beitrag in Connect",
        ref,
      });
    } else {
      // D1a: @Name — dieselbe Schreibweise, die die Vorschlagsliste im Client
      // einfügt (@display_name), zusätzlich @Nachname.
      const erwaehnt = new Set(aktive.filter((u) => wirdErwaehnt(klartext, u)).map((u) => u.id));
      // D1b: Antwort → Autor:in des Eltern-Beitrags + alle, die schon geantwortet haben.
      const beteiligt = new Set<number>();
      if (istAntwort) {
        const elternId = Number(record.parent_id);
        const { data: eltern } = await sb
          .from("posts").select("author_id").eq("id", elternId).maybeSingle();
        if (eltern?.author_id) beteiligt.add(Number(eltern.author_id));
        const { data: antworten } = await sb
          .from("posts").select("author_id").eq("parent_id", elternId).eq("is_deleted", false).limit(1000);
        for (const a of antworten || []) beteiligt.add(Number(a.author_id));
      }
      const aktivIds = new Set(aktive.map((u) => u.id));
      const threadIds = [...beteiligt].filter((id) => aktivIds.has(id) && id !== absenderId && !erwaehnt.has(id));
      if (erwaehnt.size > 0) {
        gruppen.push({
          ids: [...erwaehnt],
          titel: `💬 Du wurdest erwähnt — ${teamName}`,
          text: kanalName ? `in #${kanalName}` : "in Connect",
          ref,
        });
      }
      if (threadIds.length > 0) {
        gruppen.push({
          ids: threadIds,
          titel: `↩︎ Neue Antwort in deinem Thread — ${teamName}`,
          text: kanalName ? `in #${kanalName}` : "in Connect",
          ref,
        });
      }
    }

  // ── Fall 2: Direktnachricht ────────────────────────────────────────
  } else if (tabelle === "messages") {
    if (record.is_deleted === true) {
      return antwort({ skipped: "geloescht" });
    }
    absenderId = Number(record.sender_id ?? 0);
    const convId = Number(record.conversation_id ?? 0);

    const { data: mitglieder } = await sb
      .from("conversation_members").select("user_id").eq("conversation_id", convId);
    const ids = (mitglieder || [])
      .map((m) => Number(m.user_id))
      .filter((id) => id !== absenderId);

    const { data: absender } = await sb
      .from("users").select("display_name").eq("id", absenderId).maybeSingle();

    gruppen.push({
      ids,
      titel: absender?.display_name ?? "Neue Nachricht",
      text: ZEIGE_DM_INHALT
        ? stripHtml(String(record.content ?? "")).slice(0, 180)
        : "Neue Direktnachricht in Connect",
      ref: String(convId),
    });

  } else {
    return antwort({ skipped: `Tabelle ${tabelle}` });
  }

  gruppen = gruppen.filter((g) => g.ids.length > 0);
  const alleIds = [...new Set(gruppen.flatMap((g) => g.ids))];
  if (alleIds.length === 0) {
    return antwort({ skipped: "keine Empfaenger" });
  }

  // ── Wer will überhaupt Benachrichtigungen? ─────────────────────────
  // notifications_enabled ist Standard true; nur ausdrückliches false zählt.
  const { data: prefs } = await sb
    .from("user_preferences")
    .select("user_id, notifications_enabled")
    .in("user_id", alleIds);
  const abgelehnt = new Set(
    (prefs || []).filter((p) => p.notifications_enabled === false).map((p) => Number(p.user_id)),
  );

  // ── D3: Feierabend (ein RPC für die ganze Liste) ────────────────────
  // Dringend kommt immer durch. Bei einem RPC-Fehler wird trotzdem gesendet
  // (lieber ein Hinweis zu viel als ein verlorener) — und geloggt.
  let still = new Set<number>();
  if (!dringend) {
    const { data: ruhig, error: qErr } = await sb.rpc("krs_quiet_users", { p_users: alleIds });
    if (qErr) console.error("notify-push: krs_quiet_users", qErr.message);
    else still = new Set((ruhig || []).map((x: unknown) => Number(x)));
  }

  const wollen = alleIds.filter((id) => !abgelehnt.has(id) && !still.has(id));
  if (wollen.length === 0) {
    return antwort({ skipped: "Feierabend/Opt-out", still: still.size });
  }

  const { data: tokens } = await sb
    .from("push_tokens")
    .select("id, user_id, token, environment")
    .in("user_id", wollen)
    .is("disabled_at", null);

  if (!tokens || tokens.length === 0) {
    return antwort({ skipped: "keine Geraete", still: still.size });
  }

  let jwt: string;
  try {
    jwt = await apnsJwt();
  } catch (e) {
    console.error("APNs-JWT:", (e as Error).message);
    // 200, damit der Webhook nicht endlos wiederholt.
    return antwort({ error: "apns config" });
  }

  // Jede Person bekommt genau einen Hinweis: den der ersten passenden Gruppe.
  const gruppeVon = new Map<number, Gruppe>();
  for (const g of gruppen) for (const id of g.ids) if (!gruppeVon.has(id)) gruppeVon.set(id, g);

  let zugestellt = 0;
  const stillgelegt: number[] = [];

  for (const t of tokens) {
    const g = gruppeVon.get(Number(t.user_id));
    if (!g) continue;
    const r = await sende(
      { id: Number(t.id), token: String(t.token), environment: String(t.environment) },
      { titel: g.titel, text: g.text, modul, ref: g.ref },
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
    `notify-push: ${tabelle}, ${zugestellt}/${tokens.length} zugestellt, ${stillgelegt.length} stillgelegt, ${still.size} Feierabend`,
  );
  return antwort({ ok: true, zugestellt, gesamt: tokens.length, stillgelegt: stillgelegt.length, still: still.size });
});
