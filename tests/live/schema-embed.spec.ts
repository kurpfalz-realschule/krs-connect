import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Live-Schema-Wächter (0BJ, 26.09.2026).
 *
 * Am 25.09. legte eine Migration zwei Tabellen mit zusammengesetztem
 * Primärschlüssel aus FKs auf posts UND users an. PostgREST hielt sie für
 * m2m-Verknüpfungen → `posts?select=*,author:users(...)` wurde mehrdeutig
 * (HTTP 300) → alle Kanäle wirkten leer. Dieser Test fragt die wichtigsten
 * Einbettungen mit dem öffentlichen anon-Key ab: RLS liefert eine leere Liste
 * (200), aber eine Mehrdeutigkeit im Schema käme als 300/400 zurück.
 * Nach JEDER Migration einmal laufen lassen:  npx playwright test tests/live/schema-embed.spec.ts
 */

function tenant() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'tenant.js'), 'utf8');
  const url = (src.match(/url:\s*'(https:\/\/[a-z0-9]+\.supabase\.co)'/) || [])[1];
  const key = (src.match(/anonKey:\s*'([^']+)'/) || [])[1];
  return { url, key };
}

const ABFRAGEN = [
  // ohne FK-Hinweis: genau die Form, die am 25.09. brach (ältere Clients nutzen sie)
  'posts?select=id,author:users(id)&limit=1',
  'posts?select=id,author:users!posts_author_id_fkey(id)&limit=1',
  'messages?select=id,sender:users(id)&limit=1',
  'messages?select=id,sender:users!messages_sender_id_fkey(id)&limit=1',
  'team_members?select=user_id,users(id)&limit=1',
  'conversation_members?select=user_id,users(id)&limit=1',
];

test.describe('Live-Schema: PostgREST-Einbettungen eindeutig', () => {
  const { url, key } = tenant();
  test.skip(!url || !key, 'tenant.js ohne Supabase-URL/anonKey');

  for (const q of ABFRAGEN) {
    test(`200 für ${q.split('?')[0]} · ${q.split('select=')[1].split('&')[0]}`, async ({ request }) => {
      const res = await request.get(`${url}/rest/v1/${q}`, {
        headers: { apikey: key!, Authorization: `Bearer ${key}` },
      });
      const body = await res.text();
      expect(res.status(), body.slice(0, 300)).toBe(200);
    });
  }
});
