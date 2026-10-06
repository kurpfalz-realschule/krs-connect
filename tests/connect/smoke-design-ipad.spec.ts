import { test, expect } from '../fixtures/connect';
for (const embedded of [false,true]) for (const width of [768,810,834,1024]) {
  test(`New design iPad portrait ${width}, embedded=${embedded}: switch teams and chats`,async({page})=>{
    await page.setViewportSize({width,height:1366});
    await page.addInitScript(()=>{localStorage.setItem('krs_design_v2','1');localStorage.setItem('krs_onboarding_done','1');localStorage.setItem('krs_teams_compact','1');localStorage.setItem('krs_channels_compact','1');});
    const source='/index.html?forceMode=demo&forceUser=la';
    if(embedded){
      await page.route('**/ipad-embed',r=>r.fulfill({contentType:'text/html',body:`<iframe title="Connect" src="${source}" style="position:fixed;inset:0;width:100vw;height:100dvh;border:0"></iframe>`}));
      await page.goto('/ipad-embed');
    }else await page.goto(source);
    const app=embedded?page.frameLocator('iframe'):page;
    await expect(app.locator('html')).toHaveClass(/krs-design-v2/);
    await app.getByTestId('team-context-open').click();
    await expect(app.getByRole('button',{name:'Liste schließen',exact:true})).toBeVisible();
    const drawer=app.locator('.team-drawer.mobile-open');
    await expect(drawer).toBeVisible();
    expect((await drawer.boundingBox())!.width).toBeGreaterThan(width-3);
    await expect(drawer.locator('.list-item-text').first()).toBeVisible();
    await app.getByTestId('drawer-nav-chat').first().click();
    await expect(app.locator('.sidebar-content.mobile-open')).toBeVisible();
    const conversations=app.locator('.conversation-item');
    await expect(conversations.first()).toBeVisible();
    await conversations.first().click();
    await app.getByTestId('chat-open-list').click();
    await conversations.nth(1).click();
    await expect(app.getByTestId('chat-open-list')).toBeVisible();
    if (width === 834) {
      await app.getByTestId('chat-open-list').click();
      await app.getByTestId('drawer-nav-teams').first().click();
      await page.setViewportSize({width:1366,height:834});
      await expect(app.getByRole('button',{name:'Teamliste ausklappen',exact:true})).toBeVisible();
      await page.setViewportSize({width,height:1366});
      await app.getByTestId('teams-open-list').click();
      await expect(app.locator('.team-drawer.mobile-open .list-item-text').first()).toBeVisible();
    }
    const frame=embedded?page.frames().find(f=>f.url().includes('index.html'))!:page.mainFrame();
    expect(await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2)).toBe(false);
  });
}
