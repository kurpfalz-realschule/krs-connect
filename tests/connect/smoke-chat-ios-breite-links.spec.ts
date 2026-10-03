import { test, expect, openConnect } from '../fixtures/connect.ts';

/**
 * iPhone-Chat: Blasen dürfen nicht breiter werden als 75 % der Spalte
 * (einzeiliges Antwort-Zitat hat das vorher über den linken Rand geschoben),
 * und geschriebene https-Adressen werden in Chat, Beitrag, Antwort und Suche
 * zu echten Links — alle laufen durch sanitizeHtml.
 */

test.describe('Chat-Breite und antippbare Adressen', () => {
  test.beforeEach(async ({ page }) => {
    await openConnect(page, { user: 'la' });
    await page.waitForFunction(
      () => !!(window as any).DOMPurify && typeof (window as any).__krsSanitizeHtml === 'function',
      null,
      { timeout: 10_000 }
    );
  });

  test('geschriebene Adresse wird zum Link, vorhandene Links und Code bleiben', async ({ page }) => {
    const out = await page.evaluate(() => {
      const s = (window as any).__krsSanitizeHtml;
      return {
        plain: s('guck mal, ob es so passt: https://realschule-schriesheim.de/eltern/webuntis-hilfe/'),
        dotted: s('siehe https://example.com.'),
        www: s('www.example.com/hilfe'),
        existing: s('<a href="https://example.com/bereits">Beispiel</a>'),
        code: s('<code>https://example.com/nicht-klickbar</code>'),
        script: s('nicht öffnen: javascript:alert(1)'),
        wiki: s('siehe https://de.wikipedia.org/wiki/Datei_(Begriff).'),
      };
    });

    expect(out.plain).toContain('href="https://realschule-schriesheim.de/eltern/webuntis-hilfe/"');
    expect(out.plain).toContain('target="_blank"');
    expect(out.plain).toContain('class="krs-autolink"');
    expect(out.plain.match(/<a\b/gi)?.length).toBe(1);

    expect(out.dotted).toContain('href="https://example.com"');
    expect(out.dotted).toMatch(/example\.com<\/a>\./);

    expect(out.www).toContain('href="https://www.example.com/hilfe"');

    expect(out.existing.match(/<a\b/gi)?.length).toBe(1);
    expect(out.existing).toContain('href="https://example.com/bereits"');
    expect(out.existing).toContain('Beispiel');

    expect(out.code).not.toMatch(/<code>[^<]*<a/i);
    expect(out.code).toContain('https://example.com/nicht-klickbar');

    expect(out.script).not.toMatch(/href=/i);
    expect(out.script).toContain('javascript:alert(1)');

    expect(out.wiki).toContain('href="https://de.wikipedia.org/wiki/Datei_(Begriff)"');
  });

  test('Antwort-Zitat bleibt innerhalb der Spalte, kurze Blase bleibt schmal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const box = await page.evaluate(() => {
      const wrap = document.createElement('div');
      wrap.className = 'chat-messages';
      wrap.style.cssText = 'width:360px;height:420px;position:fixed;left:8px;top:8px;z-index:99999;background:#fff;';
      wrap.innerHTML = [
        '<div class="chat-msg own" id="t-quote"><div class="chat-bubble own">',
        '<div class="chat-reply-quote"><span class="chat-reply-quote-author">Katharina Scharmann:</span>',
        '<span class="chat-reply-quote-text">Irgendwie ist es dieses Jahr alles sehr viel und der Satz geht noch weiter und weiter</span></div>',
        '<div class="chat-text">kurz</div></div></div>',
        '<div class="chat-msg own" id="t-url"><div class="chat-bubble own">',
        '<div class="chat-text">guck mal, ob es so passt: https://realschule-schriesheim.de/eltern/webuntis-hilfe/</div>',
        '</div></div>',
        '<div class="chat-msg own" id="t-short"><div class="chat-bubble own"><div class="chat-text">Ok</div></div></div>',
      ].join('');
      document.body.appendChild(wrap);
      const wr = wrap.getBoundingClientRect();
      const measure = (id: string) => {
        const el = document.getElementById(id)!;
        const r = el.getBoundingClientRect();
        return { left: r.left - wr.left, right: r.right - wr.left, width: r.width };
      };
      return {
        wrap: wr.width,
        overflow: wrap.scrollWidth > wrap.clientWidth + 1,
        quote: measure('t-quote'),
        url: measure('t-url'),
        short: measure('t-short'),
        quoteText: (document.querySelector('#t-quote .chat-reply-quote-text') as HTMLElement).scrollWidth,
        quoteTextClient: (document.querySelector('#t-quote .chat-reply-quote-text') as HTMLElement).clientWidth,
      };
    });

    const cap = box.wrap * 0.75 + 1;
    expect(box.overflow).toBe(false);
    for (const bubble of [box.quote, box.url, box.short]) {
      expect(bubble.left).toBeGreaterThanOrEqual(-1);
      expect(bubble.right).toBeLessThanOrEqual(box.wrap + 1);
      expect(bubble.width).toBeLessThanOrEqual(cap);
    }
    expect(box.short.width).toBeLessThan(box.url.width);
    expect(box.quoteText).toBeGreaterThan(box.quoteTextClient);
  });
});
