import { test, expect, openConnect } from '../fixtures/connect';
for (const width of [320, 390, 834, 1440]) {
  test(`Optional design ${width}: persistence and navigation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openConnect(page, { user: 'la' });
    await expect(page.locator('.app-layout')).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/krs-design-v2/);
    const firstPost = await page.locator('.post').first().textContent();
    await page.evaluate(() => { (window as any).KRSDesign.setEnabled(true); });
    await expect(page.locator('html')).toHaveClass(/krs-design-v2/);
    expect(await page.locator('.post').first().textContent()).toBe(firstPost);
    if (width <= 1024) {
      await page.getByTestId('teams-open-list').click();
      await expect(page.locator('.team-drawer.mobile-open')).toBeVisible();
      await page.getByRole('button', { name: 'Liste schließen', exact: true }).click();
      await page.getByRole('button', { name: 'Team-Bereiche öffnen', exact: true }).click();
      await page.getByTestId('team-tab-links').click();
      await expect(page.getByTestId('teams-open-list')).toBeVisible();
      await page.getByRole('button', { name: 'Team-Bereiche öffnen', exact: true }).click();
      await page.getByTestId('team-tab-posts').click();
    }
    await page.evaluate(() => { (window as any).KRSDesign.setEnabled(false); });
    expect(await page.locator('.post').first().textContent()).toBe(firstPost);
    await page.evaluate(() => { (window as any).KRSDesign.setEnabled(true); });
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/krs-design-v2/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)).toBe(false);
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => { (window as any).KRSDesign.setEnabled(false); });
    expect(errors).toEqual([]);
  });
}
test('Design rejects messages from itself and unrelated callers', async ({ page }) => {
  await openConnect(page, { user: 'la' });
  await page.evaluate(() => window.postMessage({type:'KRS_DESIGN_STATE',version:1,requestId:'abcd',enabled:true},location.origin));
  await expect(page.locator('html')).not.toHaveClass(/krs-design-v2/);
});
test('A real unsent chat draft survives the Settings design switch in both directions', async ({ page }) => {
  await openConnect(page, { user: 'la' });
  await page.getByRole('button', { name: 'Chats', exact: true }).click();
  await page.locator('.conversation-item').first().click();
  const editor = page.locator('.chat-input-bar [contenteditable=true]');
  await editor.fill('Mein ungesendeter Entwurf');
  await page.getByRole('button', { name: 'Einstellungen öffnen', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Neues Design ausprobieren', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(editor).toHaveText('Mein ungesendeter Entwurf');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(editor).toHaveText('Mein ungesendeter Entwurf');
});
