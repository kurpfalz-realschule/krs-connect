// Prüft die Allowlist in tenant.js. Gibt keine Schlüssel aus.
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../tenant.js', import.meta.url), 'utf8');
const sandbox = { window: {}, URL, console, atob };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const validate = sandbox.window.validateTenantConfig;
const original = sandbox.window.TENANT.supabase.url;
const results = [];

function check(url, expectOk) {
  sandbox.window.TENANT.supabase.url = url;
  const got = validate().ok === true;
  results.push({ url, expectOk, got, pass: got === expectOk });
}

check('https://krs-api.linkup.school', true);
check('https://ooejsfixxiuobrpqgfqm.supabase.co', true);
check('https://evil.example', false);
check('https://krs-api.linkup.school.evil.com', false);
check('http://krs-api.linkup.school', false);
check('https://krs-api.linkup.school/rest/v1', false);
check('https://user:pw@krs-api.linkup.school', false);
check('https://nicht-wir.supabase.co', true);

sandbox.window.TENANT.supabase.url = original;
const failed = results.filter((r) => !r.pass);
for (const r of results) {
  console.log(`${r.pass ? 'ok' : 'FAIL'} ${r.expectOk ? 'erlaubt' : 'abgelehnt'} ${r.url}`);
}
if (original !== 'https://krs-api.linkup.school') {
  console.log('FAIL eingetragene URL ist nicht der eigene Host');
  process.exit(1);
}
if (failed.length) process.exit(1);
console.log(`ALLOWLIST ${results.length} gruen`);
