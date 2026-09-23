// =====================================================================
// KRS — gemeinsamer Webhook-Schutz (Paket A9, 23.09.2026)
// Das Secret liegt NUR im Supabase Vault (Name: krs_hook_secret) und wird
// von den DB-Triggern (public.krs_notify_hook) mitgeschickt. Die Function
// holt es per RPC public.krs_hook_secret() (nur service_role) und vergleicht
// zeitkonstant. Rotation: ausschließlich in der DB (siehe Migration A9).
// =====================================================================
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Übergang: altes Env-Secret zusätzlich akzeptieren (nur während Umstellung).
const UEBERGANG_ENV_SECRET = false;

let cache: { wert: string; bis: number } | null = null;

export function gleich(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

async function vaultSecret(sb: SupabaseClient, frisch = false): Promise<string> {
  if (!frisch && cache && Date.now() < cache.bis) return cache.wert;
  const { data, error } = await sb.rpc("krs_hook_secret");
  if (error || !data) throw new Error("hook secret nicht lesbar");
  cache = { wert: String(data), bis: Date.now() + 5 * 60_000 };
  return cache.wert;
}

export async function hookErlaubt(req: Request, sb: SupabaseClient): Promise<boolean> {
  const erhalten = req.headers.get("x-krs-hook-secret") || "";
  if (erhalten.length < 32) return false;
  try {
    if (gleich(erhalten, await vaultSecret(sb))) return true;
    // Rotation innerhalb des Cache-Fensters: einmal frisch nachladen.
    if (gleich(erhalten, await vaultSecret(sb, true))) return true;
  } catch (e) {
    console.error("hookErlaubt:", (e as Error).message);
  }
  if (UEBERGANG_ENV_SECRET) {
    const env = Deno.env.get("HOOK_SECRET") || "";
    if (env && gleich(erhalten, env)) return true;
  }
  return false;
}
