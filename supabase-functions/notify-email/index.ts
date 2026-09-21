// =====================================================================
// KRS Connect — notify-email
// E-Mail-Fallback für Dringend-Posts und @alle-Erwähnungen.
//
// Auslöser: Supabase Database Webhook (INSERT auf public.posts)
//   → POST hierher mit Header  x-krs-hook-secret: <HOOK_SECRET>
// Versand: Resend API (Secret RESEND_API_KEY), EINE Mail mit BCC an
//   alle aktiven Lehrkräfte mit E-Mail (außer Autor:in), sofern sie
//   Benachrichtigungen nicht ausdrücklich deaktiviert haben.
//
// Secrets (setzt Norbert selbst, nie im Repo):
//   HOOK_SECRET      — frei gewähltes langes Geheimnis (openssl rand -hex 24)
//   RESEND_API_KEY   — von resend.com
//   MAIL_FROM        — z. B. "KRS Connect <connect@mail.tangojam.de>"
//                      (Domain in Resend verifizieren; zum Testen:
//                       "KRS Connect <onboarding@resend.dev>")
// Reply-To: feste Adresse (mail.tangojam.de hat kein echtes Postfach,
//   Antworten sollen bei Norbert landen statt ins Leere zu laufen).
// Deploy: supabase functions deploy notify-email --no-verify-jwt
//   (--no-verify-jwt: Der Webhook hat kein User-JWT; Schutz = HOOK_SECRET.)
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

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
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ── Schutz: Shared Secret des Webhooks ──────────────────────────
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

  const record = (payload?.record ?? {}) as Record<string, unknown>;
  const content = String(record.content ?? "");
  const isUrgent = record.is_urgent === true;
  const mentionsAll = /@alle\b/i.test(stripHtml(content));

  // Nur Haupt-Posts (keine Thread-Antworten), nur Dringend oder @alle
  if (record.parent_id || record.is_deleted === true || (!isUrgent && !mentionsAll)) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Autor:in + mögliche Empfänger laden
  const authorId = Number(record.author_id ?? 0);
  const { data: users, error: uErr } = await sb
    .from("users")
    .select("id, display_name, email, status")
    .not("email", "is", null);
  if (uErr) {
    console.error("users laden:", uErr.message);
    return new Response(JSON.stringify({ error: uErr.message }), { status: 200 });
  }

  const author = (users || []).find((u) => u.id === authorId);
  const possibleRecipients = (users || [])
    .filter((u) => u.id !== authorId && (u.status ?? "active") === "active");

  // Dieselbe Opt-out-Regel wie in notify-push: Standard ist true; nur ein
  // ausdrücklich gespeichertes false schaltet E-Mail und Push gemeinsam ab.
  const recipientIds = possibleRecipients.map((u) => Number(u.id));
  const { data: prefs, error: pErr } = await sb
    .from("user_preferences")
    .select("user_id, notifications_enabled")
    .in("user_id", recipientIds);
  if (pErr) {
    console.error("user_preferences laden:", pErr.message);
    return new Response(JSON.stringify({ error: pErr.message }), { status: 200 });
  }

  const declined = new Set(
    (prefs || [])
      .filter((p) => p.notifications_enabled === false)
      .map((p) => Number(p.user_id)),
  );
  const recipients = possibleRecipients
    .filter((u) => !declined.has(Number(u.id)))
    .map((u) => String(u.email).toLowerCase());

  if (recipients.length === 0) {
    return new Response(JSON.stringify({ skipped: "no recipients" }), { status: 200 });
  }

  const kind = isUrgent ? "🔴 Dringend" : "📣 @alle";
  const title = String(record.title ?? "").trim();
  const subject = `${kind} in KRS Connect${title ? ": " + title : ""}`;
  const text = [
    `${author?.display_name ?? "Eine Lehrkraft"} hat ${isUrgent ? "einen DRINGEND-Beitrag" : "einen Beitrag an @alle"} gepostet:`,
    "",
    title ? `„${title}"` : "",
    stripHtml(content).slice(0, 600),
    "",
    `→ Jetzt in Connect lesen: ${CONNECT_URL}`,
    "",
    "Diese Mail kommt automatisch, wenn dich jemand dringend erreichen will und Connect gerade nicht offen ist.",
    "Bitte nicht auf diese Mail antworten — bei Fragen wende dich an die oben genannte Reply-Adresse.",
  ].filter((l) => l !== "").join("\n");

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

  const body = await res.text();
  if (!res.ok) {
    console.error("Resend-Fehler:", res.status, body.slice(0, 300));
    // 200 zurückgeben, damit der Webhook nicht endlos retried
    return new Response(JSON.stringify({ error: "send failed", detail: body.slice(0, 200) }), { status: 200 });
  }

  console.log(`notify-email: ${recipients.length} Empfänger, post ${record.id}, ${kind}`);
  return new Response(JSON.stringify({ ok: true, recipients: recipients.length }), { status: 200 });
});
