const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

async function prepare(page, viewport, count = 4, controlledCards = true) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { if (!localStorage.getItem('machikoroDesignTheme')) localStorage.setItem('machikoroDesignTheme', 'cardboard'); });
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(({ count, controlledCards }) => {
        startGameNow(count, Array.from({ length: count }, (_, index) => ({ type: index ? 'cpu' : 'human', difficulty: 'normal', name: `街${index + 1}` })));
        const state = GameRuntimeState.runtime.snapshot();
        // This fixture replaces the shuffled CPU session with controlled human
        // seats. Give presentation controllers the new session identity too.
        GameRuntimeState.runtime.setCpuPlayers(Array.from({ length: count }, () => null));
        cancelCpuSchedule('cardboard-view');
        state.game.currentPlayerIndex = 0;
        state.game.players.forEach((player, index) => {
            player.name = `街${index + 1}`;
            if (controlledCards) player.cards = Array.from({ length: index ? 2 : 4 }, () => createCardByName(index ? 'カフェ' : '麦畑'));
            player.coins = 30;
        });
        setTutorialEnabled(false);
        render();
        acceptHotseatHandoff();
    }, { count, controlledCards });
}

for (const viewport of [{width:320,height:844},{width:390,height:844},{width:844,height:390},{width:1440,height:936}]) {
    test(`全員の街と市場を見渡せる ${viewport.width}`, async ({page}, testInfo) => {
        await prepare(page, viewport, 4);
        await expect(page.locator('.cardboard-overview-city')).toHaveCount(4);
        const before = await page.evaluate(() => GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER));
        await expect(page.locator('#cardboardDetails')).not.toHaveAttribute('open', '');
        const layout = await page.locator('#cardboardOverview').evaluate(world => {
            const boxes = [...world.querySelectorAll('.cardboard-overview-city, #cardboardMarket')].map(node => {
                const r=node.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
            });
            return {boxes, width:innerWidth,height:innerHeight};
        });
        for (const box of layout.boxes) {
            expect(box.left).toBeGreaterThanOrEqual(0);
            expect(box.right).toBeLessThanOrEqual(layout.width);
            expect(box.top).toBeGreaterThanOrEqual(0);
            expect(box.bottom).toBeLessThanOrEqual(layout.height);
            expect(box.height).toBeGreaterThan(40);
        }
        const firstCard = page.locator('#cardboardMarket .compact-market-item').first();
        await expect(firstCard.locator('.compact-market-name')).toBeVisible();
        const cardLayout = await firstCard.evaluate(card => {
            const strip = card.closest('.compact-market-facilities').getBoundingClientRect();
            const center = card.closest('#cardboardCenter').getBoundingClientRect();
            const clip = {top:Math.max(strip.top,center.top,0),bottom:Math.min(strip.bottom,center.bottom,innerHeight)};
            for (let parent=card.parentElement;parent;parent=parent.parentElement) {
                if (['hidden','auto','scroll','clip'].includes(getComputedStyle(parent).overflowY)) {
                    const bounds=parent.getBoundingClientRect(); clip.top=Math.max(clip.top,bounds.top); clip.bottom=Math.min(clip.bottom,bounds.bottom);
                }
            }
            return [...card.querySelectorAll('.compact-market-name,.compact-market-price,.compact-market-stock')].map(node=>{
                const r=node.getBoundingClientRect(); return {text:node.textContent, top:r.top,bottom:r.bottom, clipTop:clip.top,clipBottom:clip.bottom};
            });
        });
        for (const row of cardLayout) {
            expect(row.bottom, row.text).toBeLessThanOrEqual(row.clipBottom + 1);
            expect(row.top, row.text).toBeGreaterThanOrEqual(row.clipTop - 1);
        }
        await page.screenshot({path:testInfo.outputPath('overview.png')});
        await page.locator('.cardboard-overview-town-button').nth(2).click();
        await expect(page.locator('#cardboardTownDialog')).toBeVisible();
        await page.locator('#cardboardTownClose').click();
        expect(await page.evaluate(() => GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER))).toEqual(before);
        await page.evaluate(() => {
            const game=GameRuntimeState.runtime.snapshot().game;
            game.players.forEach((player,index)=>{
                const names=['麦畑','パン屋','牧場','カフェ','森林','コンビニ'];
                player.cards=Array.from({length:4+index*6},(_,n)=>createCardByName(names[n%names.length]));
                Object.keys(player.landmarks).slice(0,index).forEach(name=>{player.landmarks[name]=true;});
            });
            render();
        });
        await expect(page.locator('.cardboard-overview-city')).toHaveCount(4);
        await page.screenshot({path:testInfo.outputPath('overview-grown.png')});
        await page.locator('#cardboardDetails > summary').click();
        await page.locator('#cardboardDetailSelect').selectOption('2');
        await expect(page.locator('#cardboardSeats .cardboard-player-selected')).toHaveAttribute('data-player-index','2');
        await page.locator('#cardboardDetails > summary').click();
        const grown = await page.evaluate(() => GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER));
        for (const theme of ['classic','sunset','plaza','cardboard']) {
            await page.evaluate(theme=>{const select=document.getElementById('gameDesignThemeSelect'); select.value=theme; select.dispatchEvent(new Event('change',{bubbles:true}));},theme);
            expect(await page.evaluate(() => GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER))).toEqual(grown);
        }
    });
}

for (const count of [2, 3, 5, 10]) {
    test(`全体盤面の人数適応 ${count}`, async ({page}, testInfo) => {
        await prepare(page, {width:844,height:390}, count);
        await expect(page.locator('.cardboard-overview-city')).toHaveCount(count);
        await expect(page.locator('#cardboardMarket .compact-market-buy').first()).toBeVisible();
        await page.screenshot({path:testInfo.outputPath(`overview-${count}.png`)});
        const boxes=await page.locator('.cardboard-overview-city').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
        for (const box of boxes) {
            expect(box.width).toBeGreaterThan(80);
            expect(box.height).toBeGreaterThan(40);
            expect(box.x+box.width).toBeLessThanOrEqual(844);
        }
    });
}

for (const viewport of [{width:390,height:844},{width:844,height:390}]) {
    test(`全体盤面から施設を建設して全員の街へ戻れる ${viewport.width}`, async ({page}) => {
        await prepare(page, viewport, 4);
        await page.evaluate(()=>{
            const game=GameRuntimeState.runtime.snapshot().game;
            game.phase=GAME_PHASES.BUILD;
            game.builtThisTurn=false;
            render();
        });
        const purchase=page.locator('#cardboardMarket .compact-market-buy:not([disabled])').first();
        const name=await purchase.getAttribute('data-card-name');
        const before=await page.evaluate(()=>{
            const game=GameRuntimeState.runtime.snapshot().game;
            return {count:game.players[0].cards.length,coins:game.players[0].coins};
        });
        await purchase.click();
        await expect.poll(()=>page.evaluate(()=>GameRuntimeState.runtime.snapshot().game.players[0].cards.length)).toBe(before.count+1);
        expect(await page.evaluate(()=>GameRuntimeState.runtime.snapshot().game.players[0].coins)).toBeLessThan(before.coins);
        await expect(page.locator('.cardboard-overview-city')).toHaveCount(4);
        await expect(page.locator('.cardboard-overview-city').first().locator('.cardboard-overview-progress')).toContainText(`施設 ${before.count+1}枚`);
        await expect(page.locator('#cardboardDetails')).not.toHaveAttribute('open','');
        await expect(page.locator('#cardboardMarket')).toBeVisible();
        expect(name).toBeTruthy();
    });
}

test('10人の縦持ちでも全員の街と市場を把握できる', async ({page}, testInfo) => {
    await prepare(page, {width:320,height:844}, 10);
    const layout=await page.locator('#cardboardOverview').evaluate(world=>[...world.querySelectorAll('.cardboard-overview-city,#cardboardMarket')].map(node=>{
        const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};
    }));
    expect(layout).toHaveLength(11);
    for (const box of layout) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(320);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.bottom).toBeLessThanOrEqual(844);
    }
    await page.screenshot({path:testInfo.outputPath('overview-10-portrait.png')});
});
