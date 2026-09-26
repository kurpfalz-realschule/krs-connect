// =====================================================================
// KRS Connect — notify-email  (Paket A, 23.09.2026; D3 Feierabend 25.09.2026)
// E-Mail-Hinweis bei Dringend-Beiträgen und @alle.
//
// Auslöser: DB-Trigger notify_email_on_post (AFTER INSERT public.posts)
//   → public.krs_notify_hook() → POST hierher mit x-krs-hook-secret (Vault).
//
// A1: Empfänger = aktive MITGLIEDER des Teams, in dessen Kanal gepostet wurde
//     (nicht mehr alle Nutzer), ohne Autor:in, ohne ausdrückliches Opt-out.
// E-2: Die Mail enthält KEINEN Beitragsinhalt und keinen Titel — nur Hinweis,
//     Team und Kanal (Versand läuft über Resend, US-Anbieter).
// A9: Secret aus dem Vault, zeitkonstanter Vergleich, generische Fehler.
//
// Secrets (setzt Norbert selbst, nie im Repo): RESEND_API_KEY, MAIL_FROM
// Deploy: verify_jwt = false (Webhook hat kein User-JWT; Schutz = Hook-Secret)
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { hookErlaubt } from "./hook-secret.ts";

const CONNECT_URL = "https://kurpfalz-realschule.github.io/krs-connect/";
const REPLY_TO = "kotzan@realschule-schriesheim.de";

function stripHtml(html: string): string {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function antwort(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!(await hookErlaubt(req, sb))) return antwort({ error: "forbidden" }, 403);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return antwort({ error: "bad request" }, 400);
  }

  const record = (payload?.record ?? {}) as Record<string, unknown>;
  const isUrgent = record.is_urgent === true;
  const mentionsAll = /@alle\b/i.test(stripHtml(String(record.content ?? "")));

  // Nur Haupt-Posts (keine Thread-Antworten), nur Dringend oder @alle
  if (record.parent_id || record.is_deleted === true || (!isUrgent && !mentionsAll)) {
    return antwort({ skipped: true });
  }

  const authorId = Number(record.author_id ?? 0);
  const channelId = Number(record.channel_id ?? 0);

  // ── A1: Kanal → Team → Mitglieder ──────────────────────────────────
  const { data: kanal, error: kErr } = await sb
    .from("channels").select("id, name, team_id").eq("id", channelId).maybeSingle();
  if (kErr || !kanal?.team_id) {
    console.error("notify-email: Kanal nicht gefunden", channelId, kErr?.message);
    return antwort({ skipped: "kein Kanal" });
  }
  const { data: team } = await sb.from("teams").select("name").eq("id", kanal.team_id).maybeSingle();

  const { data: mitglieder, error: mErr } = await sb
    .from("team_members").select("user_id").eq("team_id", kanal.team_id);
  if (mErr) {
    console.error("notify-email: team_members", mErr.message);
    return antwort({ error: "intern" });
  }
  const mitgliedIds = [...new Set((mitglieder || []).map((m) => Number(m.user_id)))]
    .filter((id) => id !== authorId);
  if (mitgliedIds.length === 0) return antwort({ skipped: "keine Empfaenger" });

  const { data: users, error: uErr } = await sb
    .from("users").select("id, email, status").in("id", mitgliedIds).not("email", "is", null);
  if (uErr) {
    console.error("notify-email: users", uErr.message);
    return antwort({ error: "intern" });
  }
  const aktive = (users || []).filter((u) => (u.status ?? "active") === "active");

  // Opt-out: Standard true; nur ein ausdrücklich gespeichertes false zählt.
  const { data: prefs, error: pErr } = await sb
    .from("user_preferences").select("user_id, notifications_enabled")
    .in("user_id", aktive.map((u) => Number(u.id)));
  if (pErr) {
    console.error("notify-email: user_preferences", pErr.message);
    return antwort({ error: "intern" });
  }
  const declined = new Set(
    (prefs || []).filter((p) => p.notifications_enabled === false).map((p) => Number(p.user_id)),
  );
  // D3 (Paket D, 25.09.2026): Feierabend — Dringend kommt immer durch; @alle
  // geht im Feierabend nicht per Mail raus (der Beitrag steht in Connect). Bei einem
  // RPC-Fehler wird trotzdem gesendet (lieber zu viel als verloren) und geloggt.
  let still = new Set<number>();
  if (!isUrgent) {
    const { data: ruhig, error: qErr } = await sb.rpc("krs_quiet_users", {
      p_users: aktive.map((u) => Number(u.id)),
    });
    if (qErr) console.error("notify-email: krs_quiet_users", qErr.message);
    else still = new Set((ruhig || []).map((x: unknown) => Number(x)));
  }

  const recipients = aktive
    .filter((u) => !declined.has(Number(u.id)) && !still.has(Number(u.id)))
    .map((u) => String(u.email).toLowerCase());

  if (recipients.length === 0) return antwort({ skipped: "no recipients", still: still.size });

  // ── E-2: nur Hinweis + Team/Kanal, kein Inhalt ─────────────────────
  const teamName = String(team?.name ?? "Connect").trim();
  const kanalName = String(kanal.name ?? "").trim();
  const kind = isUrgent ? "🔴 Dringend" : "📣 @alle";
  const subject = `${kind} in KRS Connect – ${teamName}`;
  const text = [
    `Im Team „${teamName}"${kanalName ? `, Kanal #${kanalName},` : ""} gibt es ${isUrgent ? "einen neuen DRINGEND-Beitrag" : "einen neuen Beitrag an @alle"}.`,
    "",
    "Aus Datenschutzgründen steht der Inhalt nicht in dieser Mail.",
    `→ Jetzt in Connect lesen: ${CONNECT_URL}`,
    "",
    "Diese Mail kommt automatisch. Abschalten: Connect → Einstellungen → Benachrichtigungen.",
    "Bitte nicht auf diese Mail antworten.",
  ].join("\n");

  const from = Deno.env.get("MAIL_FROM") || "KRS Connect <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY") || ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [from.replace(/^.*<|>$/g, "")],
      bcc: recipients,
      reply_to: REPLY_TO,
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Resend-Fehler:", res.status, body.slice(0, 300));
    // 200, damit der Webhook nicht endlos wiederholt
    return antwort({ error: "send failed" });
  }

  console.log(`notify-email: ${recipients.length} Empfänger, post ${record.id}, ${kind}, team ${kanal.team_id}`);
  return antwort({ ok: true, recipients: recipients.length });
});
