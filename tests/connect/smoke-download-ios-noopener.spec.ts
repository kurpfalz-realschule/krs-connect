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

  test('iOS-Webweg wartet auf zweiten Klick und ruft File Share in dieser Geste auf', async ({ connectPage: page }) => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
      (navigator as any).canShare = (data: any) => !!(data && data.files && data.files.length);
      (window as any).__shareCalls = [];
      (navigator as any).share = async (data: any) => { (window as any).__shareCalls.push(data.files[0].name); };
      const url = URL.createObjectURL(new Blob(['ios-share'], { type: 'text/plain' }));
      (window as any).__iosDownloadPromise = (window as any).__krsDownloadFile({ url, name: 'Grüße Schule.txt' });
    });
    const dialog = page.getByRole('dialog', { name: 'Datei ist bereit' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'In Dateien sichern / Teilen' })).toBeVisible();
    await dialog.getByRole('button', { name: 'In Dateien sichern / Teilen' }).click();
    const result = await page.evaluate(() => (window as any).__iosDownloadPromise);
    expect(result).toMatchObject({ state: 'handed_off', transport: 'web-ios', method: 'web-share' });
    expect(await page.evaluate(() => (window as any).__shareCalls)).toEqual(['Grüße Schule.txt']);
  });

  test('Abbruch des iOS-Share-Sheets bleibt cancelled und startet keinen Fallback', async ({ connectPage: page }) => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
      (navigator as any).canShare = () => true;
      (window as any).__openCalls = 0;
      const originalOpen = window.open;
      (window as any).__originalOpen = originalOpen;
      window.open = (() => { (window as any).__openCalls++; return null; }) as any;
      (navigator as any).share = async () => { throw new DOMException('cancelled', 'AbortError'); };
      const url = URL.createObjectURL(new Blob(['cancel']));
      (window as any).__iosDownloadPromise = (window as any).__krsDownloadFile({ url, name: 'abbruch.pdf' });
    });
    await page.getByRole('button', { name: 'In Dateien sichern / Teilen' }).click();
    const result = await page.evaluate(async () => {
      const value = await (window as any).__iosDownloadPromise;
      const calls = (window as any).__openCalls;
      window.open = (window as any).__originalOpen;
      return { value, calls };
    });
    expect(result.value).toMatchObject({ state: 'cancelled', method: 'web-share' });
    expect(result.calls).toBe(0);
  });

  test('iOS-Fallback setzt download-Query erst nach bewusstem Klick', async ({ connectPage: page }) => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' });
      (navigator as any).canShare = () => false;
      const targets: string[] = [];
      (window as any).__fallbackTargets = targets;
      (window as any).__originalOpen = window.open;
      window.open = (() => {
        const fake: any = { opener: {}, close() {} };
        Object.defineProperty(fake, 'location', { set(value) { targets.push(String(value)); }, get() { return ''; } });
        return fake;
      }) as any;
      const url = URL.createObjectURL(new Blob(['fallback']));
      (window as any).__fallbackPromise = (window as any).__krsDownloadFile({ url, name: 'Plan (grün).pdf' });
    });
    expect(await page.evaluate(() => (window as any).__fallbackTargets)).toEqual([]);
    await page.getByRole('button', { name: 'Im Browser laden' }).click();
    const completed = await page.evaluate(async () => {
      const value = await (window as any).__fallbackPromise;
      const targets = (window as any).__fallbackTargets;
      window.open = (window as any).__originalOpen;
      return { value, targets };
    });
    expect(completed.value).toMatchObject({ state: 'handed_off', method: 'download-url' });
    expect(completed.targets).toHaveLength(1);
    const target = new URL(completed.targets[0]);
    expect(target.searchParams.get('download')).toBe('Plan (grün).pdf');
  });
});
