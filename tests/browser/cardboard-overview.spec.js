const { test, expect } = require('@playwright/test');

// Keep layout fixtures independent of asynchronous SW update prompts.
// Explicit banner cases below and the PWA suite retain update coverage.
test.use({ serviceWorkers: 'block' });

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
        // Keep the turn context consistent with the controlled seat order.
        state.game.log = [];
        state.game.addLog(LOG_TYPES.SYSTEM, `👤 ${state.game.currentPlayer().name}のターン`);
        setTutorialEnabled(false);
        render();
        acceptHotseatHandoff();
    }, { count, controlledCards });
}

// Controlled presentation fixtures verify camera/layout without claiming a
// naturally played match; ui-playthrough.spec.js covers real game progression.
async function snapshot(page) {
    return page.evaluate(() => GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER));
}

async function expectWholeTable(page, count) {
    await expect(page.locator('#cardboardTableCanvas > #cardboardSeats .cardboard-player')).toHaveCount(count);
    await expect(page.locator('#cardboardSeats #cardboardCenter #cardboardMarket')).toHaveCount(1);
    await expect(page.locator('#cardboardOverview, #cardboardDetails')).toHaveCount(0);
    await expect.poll(() => page.locator('#cardboardTableViewport').evaluate(viewport => {
        const clip = viewport.getBoundingClientRect();
        const nodes = [...viewport.querySelectorAll('.cardboard-player, #cardboardCenter')];
        const failures = [];
        const tolerance = 2;
        const contained = (bounds, outer) => bounds.width > 0 && bounds.height > 0 &&
            bounds.left >= outer.left - tolerance && bounds.top >= outer.top - tolerance &&
            bounds.right <= outer.right + tolerance && bounds.bottom <= outer.bottom + tolerance;
        if (clip.height < Math.min(180, innerHeight / 2)) failures.push('table viewport collapsed');
        if (nodes.length < 2) failures.push('table groups missing');
        const groups = nodes.map(node => ({
            node, bounds: node.getBoundingClientRect(),
            name: node.id || `player ${node.dataset.playerIndex}`,
        }));
        for (const group of groups) {
            if (!contained(group.bounds, clip)) failures.push(`${group.name} outside viewport`);
            for (const card of group.node.querySelectorAll('.cardboard-card')) {
                const bounds = card.getBoundingClientRect();
                if (!contained(bounds, group.bounds)) failures.push(`${group.name}/${card.dataset.cardName} outside owner`);
                if (!contained(bounds, clip)) failures.push(`${group.name}/${card.dataset.cardName} outside viewport`);
            }
        }
        for (let first = 0; first < groups.length; first++) {
            for (let second = first + 1; second < groups.length; second++) {
                const a = groups[first].bounds;
                const b = groups[second].bounds;
                const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                if (width > tolerance && height > tolerance) failures.push(`${groups[first].name} overlaps ${groups[second].name}`);
            }
        }
        return failures.slice(0, 8);
    })).toEqual([]);
}

async function expectOwnedCards(page) {
    const result = await page.evaluate(() => {
        const expected = GameRuntimeState.runtime.snapshot().game.players.map(player => {
            const cards = new Map();
            for (const card of player.cards) {
                const previous = cards.get(card.name);
                cards.set(card.name, { name:card.name, count:(previous?.count || 0)+1,
                    dice:card.diceNums.join('・'), color:card.color });
            }
            return [...cards.values()].sort((left,right)=>left.name.localeCompare(right.name)).map(card=>({
                name:card.name, dataName:card.name, count:`所有 ×${card.count}`, dice:card.dice,
                colorClass:`cardboard-card-${card.color}`, artCount:1, categoryIdentified:true,
            }));
        });
        const actual = expected.map((cards,index)=>{
            const panel = document.querySelector(`#cardboardSeats .cardboard-player[data-player-index="${index}"]`);
            return [...(panel?.querySelectorAll('.cardboard-card') || [])].map(card=>({
                name:card.querySelector('.cardboard-name')?.textContent,
                dataName:card.dataset.cardName,
                count:card.querySelector('.cardboard-count')?.textContent,
                dice:card.querySelector('.cardboard-dice')?.textContent,
                colorClass:[...card.classList].find(name=>/^cardboard-card-(?:blue|green|red|purple)$/.test(name)),
                artCount:card.querySelectorAll('.cardboard-art svg').length,
                categoryIdentified:/青|緑|赤|紫/.test(card.querySelector('.cardboard-category')?.textContent || ''),
            })).sort((left,right)=>left.name.localeCompare(right.name));
        });
        return {expected,actual};
    });
    expect(result.actual).toEqual(result.expected);
}

for (const viewport of [{width:320,height:844},{width:390,height:844},{width:844,height:390},{width:1440,height:936}]) {
    test(`共通カード卓で全員の施設と中央市場を見渡せる ${viewport.width}`, async ({page}, testInfo) => {
        await prepare(page, viewport, 4);
        await expectWholeTable(page,4);
        await expectOwnedCards(page);
        await page.screenshot({path:testInfo.outputPath('card-table-overview.png')});
        const before = await snapshot(page);
        const camera = page.locator('#cardboardTableViewport');
        const fittedScale = Number(await camera.getAttribute('data-table-scale'));
        await page.locator('[data-cardboard-camera="readable"]').click();
        await expect.poll(async()=>Number(await camera.getAttribute('data-table-scale'))).toBeGreaterThan(fittedScale);
        const readableScale = Number(await camera.getAttribute('data-table-scale'));
        await page.locator('[data-cardboard-camera="in"]').click();
        await expect.poll(async()=>Number(await camera.getAttribute('data-table-scale'))).toBeGreaterThan(readableScale);
        // Keyboard pan exercises the native viewport, rather than changing its
        // scroll coordinates through evaluate.
        await camera.focus();
        await camera.press('Home');
        await page.locator('[data-cardboard-camera="readable"]').click();
        await camera.focus();
        await camera.press('ArrowLeft');
        const panBefore = await camera.evaluate(viewport=>viewport.scrollTop);
        expect(panBefore).toBeGreaterThan(0);
        await camera.press('ArrowUp');
        await expect.poll(()=>camera.evaluate(viewport=>viewport.scrollTop)).toBeLessThan(panBefore);
        await page.locator('.cardboard-roster-seat[data-cardboard-player-index="2"]').click();
        await expect(page.locator('.cardboard-player-selected')).toHaveAttribute('data-player-index','2');
        await page.locator('[data-cardboard-camera="market"]').click();
        await page.locator('[data-cardboard-camera="overview"]').click();
        await expectWholeTable(page,4);
        expect(await snapshot(page)).toEqual(before);

        await page.evaluate(()=>{
            const game=GameRuntimeState.runtime.snapshot().game;
            game.players.forEach((player,index)=>{
                const names=['麦畑','パン屋','牧場','カフェ','森林','コンビニ'];
                player.cards=Array.from({length:12+index*6},(_,n)=>createCardByName(names[n%names.length]));
                Object.keys(player.landmarks).slice(0,index).forEach(name=>{player.landmarks[name]=true;});
            });
            render();
        });
        await expectWholeTable(page,4);
        await expect(page.locator('#cardboardTableViewport')).toHaveAttribute('data-table-mode','overview');
        await page.locator('[data-cardboard-camera="overview"]').click();
        await expectWholeTable(page,4);
        await expectOwnedCards(page);
        await page.screenshot({path:testInfo.outputPath('card-table-grown.png')});
        const grown = await snapshot(page);
        for (const theme of ['classic','sunset','plaza','cardboard']) {
            await page.evaluate(theme=>{const select=document.getElementById('gameDesignThemeSelect'); select.value=theme; select.dispatchEvent(new Event('change',{bubbles:true}));},theme);
            expect(await snapshot(page)).toEqual(grown);
            const actions = page.locator('#gameScreen .game-action-panel');
            await expect(actions).toHaveCount(1);
            await expect(actions).toBeVisible();
            if (theme !== 'cardboard') {
                await expect(page.locator('#cardboardBoard')).toBeHidden();
                expect(await actions.evaluate(panel => panel.closest('#cardboardBoard') === null)).toBe(true);
            } else {
                await expect(page.locator('#cardboardBoard')).toBeVisible();
                await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(4);
                expect(await actions.evaluate(panel => panel.closest('#cardboardActionSlot') !== null)).toBe(true);
            }
        }
        await expectWholeTable(page,4);
        await expectOwnedCards(page);
    });
}

for (const count of [2,3,5,10]) {
    test(`共通カード卓の人数適応 ${count}`, async ({page},testInfo)=>{
        await prepare(page,{width:844,height:390},count);
        await expectWholeTable(page,count);
        await expectOwnedCards(page);
        await page.screenshot({path:testInfo.outputPath(`card-table-${count}.png`)});
        const before=await snapshot(page);
        await page.locator(`.cardboard-roster-seat[data-cardboard-player-index="${count-1}"]`).click();
        await expect(page.locator('.cardboard-player-selected')).toHaveAttribute('data-player-index',String(count-1));
        await expect(page.locator('#cardboardSeats .cardboard-player')).toHaveCount(count);
        await page.locator('[data-cardboard-camera="overview"]').click();
        await expectWholeTable(page,count);
        expect(await snapshot(page)).toEqual(before);
    });
}

test('10人の320px縦持ちでも全員の所有カードと市場を俯瞰できる',async({page},testInfo)=>{
    await prepare(page,{width:320,height:844},10);
    await expectWholeTable(page,10);
    await expectOwnedCards(page);
    await page.screenshot({path:testInfo.outputPath('card-table-10-portrait.png')});
});

for (const viewport of [{width:390,height:844},{width:844,height:390}]) {
    test(`共通カード卓の市場から建設して全員のカードへ戻れる ${viewport.width}`,async({page})=>{
        await prepare(page,viewport,4);
        await page.evaluate(()=>{const game=GameRuntimeState.runtime.snapshot().game;game.phase=GAME_PHASES.BUILD;game.builtThisTurn=false;render();});
        await page.locator('[data-cardboard-camera="market"]').click();
        const purchase=page.locator('#cardboardMarket .compact-market-buy:not([disabled])').first();
        const name=await purchase.getAttribute('data-card-name');
        const before=await page.evaluate(()=>{const player=GameRuntimeState.runtime.snapshot().game.players[0];return{count:player.cards.length,coins:player.coins};});
        const ownerName=await page.evaluate(()=>GameRuntimeState.runtime.snapshot().game.players[0].name);
        await purchase.click();
        await expect.poll(()=>page.evaluate(()=>GameRuntimeState.runtime.snapshot().game.players[0].cards.length)).toBe(before.count+1);
        expect(await page.evaluate(()=>GameRuntimeState.runtime.snapshot().game.players[0].coins)).toBeLessThan(before.coins);
        await expect(page.locator('#cardboardCurrentResult')).toContainText(ownerName);
        await expect(page.locator('#cardboardCurrentResult')).toContainText(name);
        await page.locator('[data-cardboard-camera="overview"]').click();
        await expectWholeTable(page,4);
        await expectOwnedCards(page);
        expect(name).toBeTruthy();
    });
}

for(const viewport of [{width:320,height:844},{width:844,height:390},{width:1440,height:936}]) {
    test(`更新通知が出ていてもカード卓と収支を操作できる ${viewport.width}`,async({page})=>{
        await prepare(page,viewport,4);
        const before=await snapshot(page);
        await page.evaluate(()=>setPwaBannerVisible('pwaUpdateBanner',true));
        await expect(page.locator('#pwaUpdateBanner')).toBeVisible();
        await page.locator('[data-cardboard-camera="market"]').click();
        await page.locator('[data-cardboard-camera="overview"]').click();
        await page.locator('#cardboardEventDetails > summary').click();
        await expect(page.locator('#cardboardEventDetails')).toHaveAttribute('open','');
        await expect(page.locator('#pwaUpdateBanner')).toBeVisible();
        expect(await page.evaluate(() => {
            const banner = document.getElementById('pwaUpdateBanner').getBoundingClientRect();
            const actions = document.getElementById('cardboardActionSlot').getBoundingClientRect();
            const receipt = document.getElementById('cardboardDiceReceipt').getBoundingClientRect();
            return actions.bottom <= banner.top + 1 && receipt.bottom <= banner.top + 1;
        }), '更新通知は操作と開いた収支欄を覆わない').toBe(true);
        expect(await snapshot(page)).toEqual(before);
    });
}
