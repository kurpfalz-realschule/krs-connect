import { test, expect } from '../fixtures/connect.ts';

test.describe('DL-02/DL-04 — gemeinsamer Downloadvertrag', () => {
  test('liefert awaitbar preparing → transferring → ready → handed_off', async ({ connectPage: page }) => {
    const result = await page.evaluate(async () => {
      const states: string[] = [];
      const onState = (event: Event) => states.push((event as CustomEvent).detail.state);
      window.addEventListener('krs-download-state', onState);
      const blob = new Blob(['KRS download probe'], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      try {
        const value = await (window as any).__krsDownloadFile({ url, name: 'probe.txt', type: 'text/plain', size: blob.size });
        return { states, value };
      } finally {
        window.removeEventListener('krs-download-state', onState);
        URL.revokeObjectURL(url);
      }
    });
    expect(result.states).toEqual(['preparing', 'transferring', 'ready', 'handed_off']);
    expect(result.value).toMatchObject({ state: 'handed_off', name: 'probe.txt', transport: 'web', bytes: 18 });
    expect(result.value.requestId).toMatch(/^dl-|^[0-9a-f-]{20,}$/i);
  });

  test('HTTP-Fehler werden nicht als Datei gespeichert und enden failed', async ({ connectPage: page }) => {
    await page.route('**/download-missing.pdf', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"missing"}' }));
    const downloads: string[] = [];
    page.on('download', download => downloads.push(download.suggestedFilename()));
    const result = await page.evaluate(() => (window as any).__krsDownloadFile({ url: '/download-missing.pdf', name: 'bericht.pdf' }));
    expect(result).toMatchObject({ state: 'failed', name: 'bericht.pdf', errorCode: 'download_failed' });
    expect(downloads).toEqual([]);
  });

  test('native Faehigkeit wird verwendet, wenn der neue App-Build sie meldet', async ({ connectPage: page }) => {
    const result = await page.evaluate(async () => {
      const previous = (window as any).KRSNative;
      const calls: any[] = [];
      (window as any).KRSNative = {
        available: true,
        capabilities: async () => ({ downloadFile: true, shareFile: true }),
        downloadFile: async (args: any) => { calls.push(args); return { state: 'handed_off' }; },
      };
      try {
        const value = await (window as any).__krsDownloadFile({ url: 'blob:test', name: 'datei.pdf', type: 'application/pdf', size: 42 });
        return { calls, value };
      } finally { (window as any).KRSNative = previous; }
    });
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toMatchObject({ url: 'blob:test', name: 'datei.pdf', type: 'application/pdf', size: 42 });
    expect(result.value).toMatchObject({ state: 'handed_off', transport: 'native' });
  });

  test('alter App-Build ohne downloadFile faellt kontrolliert auf Web zurueck', async ({ connectPage: page }) => {
    const result = await page.evaluate(async () => {
      const previous = (window as any).KRSNative;
      (window as any).KRSNative = { available: true, capabilities: async () => ({ downloadFile: false }) };
      const url = URL.createObjectURL(new Blob(['fallback']));
      try { return await (window as any).__krsDownloadFile({ url, name: 'fallback.txt' }); }
      finally { URL.revokeObjectURL(url); (window as any).KRSNative = previous; }
    });
    expect(result).toMatchObject({ state: 'handed_off', transport: 'web', name: 'fallback.txt' });
  });
});
