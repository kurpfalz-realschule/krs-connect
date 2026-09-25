import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

// S-2 2.5 (25.09.2026): users.email ist fuer Lehrkraefte per Spalten-GRANT gesperrt.
// Jede Abfrage mit users(*) / select('*') / select() auf users wuerde dann mit 42501 scheitern.
const src = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf-8');

test.describe('S-2 2.5: keine users-Abfrage mit *', () => {
  test('kein users(*)-Embed', () => {
    expect(src).not.toMatch(/users\(\*\)/);
  });
  test("kein from('users') mit select('*') oder leerem select()", () => {
    const hits = src.split('\n').filter(l => /from\('users'\)/.test(l) && /\.select\((\s*|'\*'[^)]*)\)/.test(l));
    expect(hits).toEqual([]);
    // mehrzeilige insert/update-Ketten: das naechste .select nach from('users') darf nicht leer sein
    const re = /from\('users'\)[^;]{0,400}?\.select\(([^)]*)\)/g;
    let m; const bad: string[] = [];
    while ((m = re.exec(src))) { if (m[1].trim() === '' || m[1].trim().startsWith("'*")) bad.push(m[0].slice(0, 120)); }
    expect(bad).toEqual([]);
  });
  test('USER_COLS enthaelt keine E-Mail, eigene Zeile/Adminliste per RPC', () => {
    const m = src.match(/const USER_COLS = '([^']+)'/);
    expect(m).not.toBeNull();
    expect(m![1].split(',')).not.toContain('email');
    expect(src).toContain("rpc('krs_my_profile')");
    expect(src).toContain("rpc('krs_admin_users')");
  });
});
